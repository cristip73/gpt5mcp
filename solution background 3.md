Da — din ce ai descris (și mai ales faptul că **scriptul direct merge**, dar **prin Claude Code/MCP pică**), problema miroase mult mai mult a **timeout/kill la nivel de MCP client (Claude Code)** decât a OpenAI/Cloudflare.

Mai jos îți explic **ce e “background” oficial**, **ce se întâmplă probabil în MCP**, și îți dau un **pattern de implementare MCP “job-based”** (start + poll) care ocolește timeouts de client.

---

## 1) “background: true” e real și e fix pentru asta (oficial OpenAI)

OpenAI are “Background mode” pentru Responses API: trimiți `background: true`, primești rapid un Response object cu `id` + `status`, iar apoi faci polling pe `GET /v1/responses/{id}` până ajunge în stare terminală.

Important:

* Background mode **stochează datele ~10 minute** ca să poți face polling și **nu e compatibil cu ZDR**.
* Poți folosi **web_search_preview** ca tool în `tools`.
* Background + stream există, dar OpenAI zice explicit că **TTFT (time to first token) e mai mare** decât la sync și “lucrează să reducă gap-ul” — deci background+stream nu e calea “cea mai rapidă” ca să primești imediat ID-ul.

Concluzie: pentru “dă-mi repede ID-ul și procesează în spate”, cel mai sigur e:

* `background: true`
* `stream: false`
* (opțional) `store: true` dacă vrei retenție mai lungă decât “fereastra de polling”, dar atenție la data retention.

---

## 2) De ce “merge direct, dar moare prin MCP”: timeout-uri hard în MCP client (Claude Code / JS SDK)

Există un pattern foarte bine documentat în ecosistemul MCP JS/TS:

* **TypeScript MCP client SDK** a avut (cel puțin) un **timeout hard de 60s** pe request, care **nu e resetat de progress updates** (adică “keepalive” logic nu ajută).
* În ecosistemul Anthropic/Claude tooling există rapoarte de **timeout hard ~30s** pentru tool calls în anumite SDK-uri, chiar dacă încerci să-l mărești.

Ce se întâmplă practic în scenariul tău:

* Claude Code (ca MCP client) așteaptă rezultatul tool-ului tău.
* Dacă tool-ul durează “prea mult” (după pragul intern), clientul poate **tăia execuția** / închide pipes / termina subprocess-ul.
* Când subprocess-ul moare sau îi sunt închise IO-urile, conexiunea HTTP în curs (undici/fetch) poate da exact erori gen **“socket hang up / socket closed unexpectedly”** (pentru că se rupe brusc TCP-ul din perspectiva request-ului).

Asta explică perfect diferența “script direct OK” vs “prin MCP moare”.

---

## 3) Diagnosticul rapid care confirmă 100% dacă e timeout/kill de Claude Code

Adaugă în MCP server (o singură dată, global) următoarele loguri (doar pe **stderr**):

```ts
process.on("SIGTERM", () => console.error("[proc] SIGTERM", Date.now()));
process.on("SIGINT", () => console.error("[proc] SIGINT", Date.now()));
process.on("exit", (code) => console.error("[proc] exit", code, Date.now()));
process.stdin.on("close", () => console.error("[proc] stdin closed", Date.now()));
process.stdout.on("error", (e) => console.error("[proc] stdout error", e));
process.stderr.on("error", (e) => console.error("[proc] stderr error", e));
```

Apoi creează un tool simplu `sleep_90` care face `await new Promise(r => setTimeout(r, 90000))`.

* Dacă “pică” la ~30s sau ~60s → e **timeout hard în client**, nu OpenAI.

---

## 4) Soluția corectă pentru MCP: **Job-based tools** (start → poll), NU un singur tool “care stă deschis”

În MCP, trebuie să te porți ca într-un mediu “serverless / RPC cu timeouts”: **fiecare tool call trebuie să termine repede**.

### Varianta A (recomandată): 2 tool-uri

1. `gpt5_start_job`

   * face `POST /v1/responses` cu `background:true`
   * returnează în 1–3 sec: `{ response_id, status }`

2. `gpt5_poll_job`

   * face `GET /v1/responses/{id}`
   * returnează status + (dacă e `completed`) output-ul

Așa, chiar dacă Claude Code are timeout 30–60s pe tool call, tu:

* nu mai ai niciun call care stă deschis minute
* polling-ul e “scurt și sigur”

### Varianta B: 1 tool, dar cu “operation”

Un singur tool `gpt5_job({ op: "start" | "poll" | "cancel" ... })`.
Avantaj: mai puține tool-uri (token economy). Dezavantaj: puțin mai multă logică în schema ta.

---

## 5) Implementare concretă (TypeScript) – pattern MCP “start + poll” (scurt, robust)

### Tool 1: start (background)

```ts
async function startJob({ task, model, reasoning, enableWebSearch }, apiKey) {
  const body = {
    model,
    input: [
      { role: "system", content: "..." },
      { role: "user", content: task }
    ],
    tools: enableWebSearch ? [{ type: "web_search_preview" }] : undefined,
    reasoning: reasoning ? { effort: reasoning } : undefined,

    // CHEIA:
    background: true,
    stream: false,

    // opțional:
    store: true,
  };

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    // timeout mic-ish aici e OK (ar trebui să răspundă rapid)
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) throw new Error(await resp.text());
  const data = await resp.json();

  return { response_id: data.id, status: data.status }; // queued / in_progress etc
}
```

### Tool 2: poll (retrieve)

```ts
async function pollJob({ response_id }, apiKey) {
  const resp = await fetch(`https://api.openai.com/v1/responses/${response_id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) throw new Error(await resp.text());
  const data = await resp.json();

  return {
    response_id: data.id,
    status: data.status,              // queued | in_progress | completed | failed | cancelled
    output_text: data.output_text,    // când e completed
    reasoning_summary: data.reasoning_summary,
    usage: data.usage,
  };
}
```

### Cum îl faci “agentic” în Claude Code (fără să ceri userului să facă manual poll)

În **descrierea tool-urilor** (și/sau system prompt-ul tău intern), pune explicit regula:

* Dacă `gpt5_start_job` returnează `queued` sau `in_progress`, agentul trebuie să **cheme `gpt5_poll_job` repetat** până primește `completed` sau `failed`.

Asta transformă polling-ul în “multi-tool loop” controlat de Claude, dar fiecare tool call rămâne sub timeout.

---

## 6) De ce “background + stream” îți poate strica fixul în MCP

OpenAI spune clar că la background+stream **TTFT poate fi mai mare** decât la sync.
Într-un MCP client cu timeouts hard, fix acel TTFT “mai mare” poate declanșa tăierea tool call-ului înainte să primești primul event.

Deci, pentru “returnează-mi ID repede”:

* background **fără** stream e mai potrivit (exact cum ai observat în scriptul direct).

---

## 7) Ce aș face eu la tine (cel mai pragmatic)

1. Confirm timeouts Claude Code/MCP cu `sleep_90` + logurile SIGTERM/stdin-close.
2. Schimb `gpt5_agent` în:

   * **sync streaming** doar pentru `none/low/medium fără web_search`
   * **job mode** pentru `high` și pentru orice cu `web_search_preview`
3. În job mode: **nu poll-ui în același tool call**. Doar `start_job` → return ID.
4. La nivel de agent logic: Claude Code cheamă `poll_job` până finalizează.

Asta e fix diferența dintre “un API normal” și “un tool MCP”: în MCP, tool call-ul e un RPC cu timeouts impuse de host, deci trebuie să fragmentezi execuția în pași scurți.

---

Dacă vrei, îți spun exact cum aș modifica **tool-ul tău existent** `gpt5_agent` ca să devină “state machine” (single-tool API: `start` / `poll` / `step`) fără să-ți dublezi tool-urile — dar ca idee centrală, soluția e aceeași: **niciun call MCP nu trebuie să stea deschis minute**.
