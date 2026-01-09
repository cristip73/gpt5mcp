Din ce ai pus aici, problema **nu mai e “cum fac polling”**, ci că **nu reușești să obții `response_id` la start** (POST-ul “background” nu apucă să-ți dea nici măcar header-ele/primul byte înainte să-ți moară socket-ul).

### Ce e “de fapt” cu background (vs ce ai presupus)

* **Background mode** în Responses API e oficial: trimiți `background: true`, primești un `Response` cu `status` (`queued`/`in_progress` etc.), apoi **poll** cu `GET /v1/responses/{id}` până la terminal. ([OpenAI Platform][1])
* OpenAI menționează explicit că la **background+stream** “time to first token” e **mai mare** decât la sync și lucrează să reducă gap-ul. Asta e un indiciu important că **TTFB-ul poate fi surprinzător de mare** în unele cazuri. ([OpenAI Platform][1])
* Pentru web search există tool-ul “nou” `web_search` în ghidul de web search, dar în ghidul de deep research apare încă `web_search_preview`. Deci ambele pot exista în ecosistem, depinde de context/model. ([OpenAI Platform][2])

---

## De ce ție îți pică fix la `background:true` (și mai ales cu web_search)

În logul tău, **ai timeout de 30s pe POST**. Dacă serverul (OpenAI edge / rețea / runtime-ul tău) nu îți livrează primul byte în <30s, tu:

* ori **îți abortezi** singur request-ul (și unele runtime-uri raportează “socket closed unexpectedly” / “socket hang up”),
* ori ai un **hard limit de platformă** (edge/serverless) care omoară conexiunea la ~30s indiferent ce faci.

Asta explică perfect de ce:

* “2+2” merge (TTFB mic),
* “high + web_search / task complex” moare (TTFB mai mare).

> Observație: tu te aștepți ca “background create” să fie mereu ~1–5s. În practică, nu e un contract; când intră web_search + high reasoning, pot exista întârzieri până iese primul byte.

---

# Fix-ul care chiar “se potrivește” cu MCP: **Background + Stream doar ca să prinzi `response.created`, apoi închizi**

În background guide, OpenAI arată explicit că poți rula **background + stream** și dacă “cade stream-ul”, poți relua ulterior. Asta înseamnă că **poți să te conectezi, să aștepți doar evenimentul `response.created` (care conține ID-ul), apoi să închizi intenționat**. ([OpenAI Platform][1])

Asta e foarte MCP-friendly, pentru că tool-ul tău:

* stă conectat **doar câteva secunde** (cât să prindă ID-ul),
* apoi returnează rapid către LLM un `job_id/response_id`,
* iar polling-ul îl faci în call-uri ulterioare (sau webhook).

---

## Arhitectură MCP “corectă” pentru background/polling (diferența față de un API normal)

În MCP, un tool call trebuie să **returneze rapid**. Deci pattern-ul bun e **2–3 tools** (sau 1 tool care se comportă în 2 faze):

1. **`gpt5_agent_start`**

   * creează un Response în background (ideal **background+stream** până prinzi `response.created`)
   * salvează `{job_id → response_id}` în memorie/Redis/sqlite
   * returnează: `job_id`, `response_id`, `status`, `next_poll_ms`

2. **`gpt5_agent_poll`**

   * face `GET /v1/responses/{response_id}`
   * dacă e `queued/in_progress` → returnează status + recomandare `next_poll_ms`
   * dacă e `completed/failed/cancelled` → returnează rezultatul (și îl persiști la tine, fiindcă Response e păstrat “~10 minute” pentru polling). ([OpenAI Platform][1])

3. opțional **`gpt5_agent_get_result`** (dacă vrei separare “poll vs fetch final”)

---

# Cod (TypeScript) – start cu **background+stream** până la `response.created`, apoi polling

Mai jos e o variantă în stilul tău (SSE parsing simplificat). Ideea-cheie: **nu aștepți output**, doar ID-ul, apoi **închizi**.

```ts
import fetch from "node-fetch";
import crypto from "crypto";

type JobStatus = "starting" | "queued" | "in_progress" | "completed" | "failed" | "cancelled" | "expired";

type JobRecord = {
  jobId: string;
  responseId: string;
  createdAt: number;
  status: JobStatus;
  lastPollAt?: number;
  resultText?: string;
  error?: string;
};

const jobs = new Map<string, JobRecord>();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number, maxJitter = 150) {
  return ms + Math.floor(Math.random() * maxJitter);
}

/**
 * START: create Response with background+stream, read until response.created => response.id
 * Then abort the stream intentionally (does NOT cancel the background job per docs: you can resume later).
 */
export async function startBackgroundJob(args: {
  apiKey: string;
  model: string; // "gpt-5.2"
  input: any;    // your Responses input
  tools?: any[];
  reasoning?: any;
  text?: any;
  max_output_tokens?: number;
  service_tier?: "auto" | "default" | "flex" | "priority";
  startTimeoutMs?: number; // give it more than 30s if you can
}) {
  const jobId = crypto.randomUUID();
  const startTimeoutMs = args.startTimeoutMs ?? 120_000; // IMPORTANT: > 30s if possible

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), startTimeoutMs);

  const body = {
    model: args.model,
    input: args.input,
    tools: args.tools,
    reasoning: args.reasoning,
    text: args.text,
    max_output_tokens: args.max_output_tokens ?? 32000,
    background: true,
    stream: true,              // 👈 key
    store: true,
    service_tier: args.service_tier ?? "auto",
    // If you want web-search sources metadata in the retrieved response:
    // include: ["web_search_call.action.sources"],
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal as any,
  });

  if (!res.ok) {
    clearTimeout(t);
    const txt = await res.text();
    throw new Error(`Create failed: ${res.status} ${res.statusText} - ${txt}`);
  }

  if (!res.body) {
    clearTimeout(t);
    throw new Error("No response body (stream) from OpenAI");
  }

  let buffer = "";
  let currentEvent = "";
  let responseId: string | null = null;

  try {
    for await (const chunk of res.body as any) {
      buffer += chunk.toString("utf8");

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("event:")) {
          currentEvent = trimmed.slice(6).trim();
          continue;
        }
        if (!trimmed.startsWith("data:")) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === "[DONE]") continue;

        let payload: any;
        try {
          payload = JSON.parse(dataStr);
        } catch {
          continue;
        }

        if (currentEvent === "response.created" && payload?.response?.id) {
          responseId = payload.response.id;
          break;
        }
      }

      if (responseId) break;
    }
  } finally {
    // close stream intentionally as soon as we got the id
    clearTimeout(t);
    controller.abort();
  }

  if (!responseId) {
    throw new Error("Did not receive response.created with response.id within start timeout");
  }

  const rec: JobRecord = {
    jobId,
    responseId,
    createdAt: Date.now(),
    status: "queued",
  };
  jobs.set(jobId, rec);

  return { job_id: jobId, response_id: responseId, status: rec.status, next_poll_ms: 1200 };
}

/**
 * POLL: GET /v1/responses/{id}
 */
export async function pollJob(args: {
  apiKey: string;
  jobId: string;
  pollTimeoutMs?: number; // per poll
}) {
  const job = jobs.get(args.jobId);
  if (!job) throw new Error(`Unknown jobId: ${args.jobId}`);

  // expire locally after ~12 min (OpenAI keeps ~10 min for polling; you should persist results yourself)
  if (Date.now() - job.createdAt > 12 * 60_000) {
    job.status = "expired";
    jobs.set(args.jobId, job);
    return { ...job, next_poll_ms: null };
  }

  const controller = new AbortController();
  const pollTimeoutMs = args.pollTimeoutMs ?? 20_000;
  const t = setTimeout(() => controller.abort(), pollTimeoutMs);

  const res = await fetch(`https://api.openai.com/v1/responses/${job.responseId}`, {
    method: "GET",
    headers: { "Authorization": `Bearer ${args.apiKey}` },
    signal: controller.signal as any,
  });

  clearTimeout(t);

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Retrieve failed: ${res.status} ${res.statusText} - ${txt}`);
  }

  const data = await res.json() as any;

  job.lastPollAt = Date.now();
  job.status = data.status ?? job.status;

  if (job.status === "completed") {
    job.resultText = data.output_text ?? null;
  } else if (job.status === "failed" || job.status === "cancelled") {
    job.error = data.error?.message ?? "Job failed/cancelled";
  }

  jobs.set(args.jobId, job);

  const next =
    job.status === "queued" ? jitter(1200) :
    job.status === "in_progress" ? jitter(2000) :
    null;

  return { job_id: job.jobId, response_id: job.responseId, status: job.status, output_text: job.resultText, error: job.error, next_poll_ms: next };
}
```

### De ce asta te ajută fix în cazul tău

* Dacă problema ta e **“nu primesc nimic în 30s”**, cu `stream:true` ai șanse mult mai mari să primești **rapid** un eveniment mic (`response.created`) și să ieși.
* Chiar dacă “TTFB pentru tokens” e mare, tu **nu aștepți tokens**, aștepți doar ID-ul.
* Doc-ul zice explicit că poți relua streamingul dacă se întrerupe, deci întreruperea intenționată nu ar trebui să “omoare” job-ul.

---

## 3 lucruri care merită schimbate imediat în request-ul tău

1. **Nu mai ține `startTimeoutMs = 30s`** dacă ai control (pune 120s). Dacă ești pe o platformă cu hard limit 30s, atunci fix-ul real e “background+stream până la id și ieși”.
2. Setează `service_tier: "priority"` (doar dacă accepți costul) ca să reduci latențe/queue pe start. Parametrul există în Responses API.
3. Dacă vrei “sources” real în payload (nu doar text cu citări), folosește `include: ["web_search_call.action.sources"]`.

---

Dacă vrei, îți arăt cum să “împachetezi” asta în MCP astfel încât **LLM-ul să știe singur** să facă:

* `start` → apoi (după `next_poll_ms`) `poll` până la `completed`,
  fără să-ți mănânce tokens aiurea (adică output-uri scurte, fără loguri, cu un “protocol” clar în descrierea tool-urilor).

[1]: https://platform.openai.com/docs/guides/background "Background mode | OpenAI API"
[2]: https://platform.openai.com/docs/guides/tools-web-search "Web search | OpenAI API"
