Problema ta („`socket hang up`” fix când folosești **GPT-5 Agent** cu **medium/high reasoning** + **web search**) e fix scenariul în care **streaming-ul nu te mai salvează**, pentru că uneori **nu vine niciun byte/„event” în primele ~zeci de secunde** (TTFB mare). Când ai un proxy / platformă cu timeout (foarte des ~60s), conexiunea se rupe și în Node apare ca „socket hang up”. În community sunt rapoarte de TTFB 40+ secunde și latențe de 30–60s+ pentru Requests/Responses, mai ales pe setup-uri agentice. ([OpenAI Developer Community][1])

**„Background processing” în Responses API** înseamnă: trimiți cererea cu `background: true` (și obligatoriu `store: true`), primești **instant** un `response.id`, apoi faci **polling** cu `GET /v1/responses/{id}` până când `status` devine `completed/failed/incomplete/...`. OpenAI zice explicit că background e pentru request-uri care altfel ar lovi timeouts și că răspunsurile „stored” sunt păstrate ~10 minute pentru polling. ([OpenAI Platform][2])
Bonus: poți și **anula** un background response (`POST /v1/responses/{id}/cancel`). ([OpenAI Platform][3])

Mai jos îți dau 2 niveluri de implementare (ambele utile în MCP).

---

## 1) Fix minim (recomandat): folosești Background + Polling **în interiorul** tool-ului tău `gpt5_agent`

Asta îți rezolvă direct „socket hang up” către OpenAI, fără să schimbi interfața MCP.

### Ce schimbi în codul tău

1. Extinzi request-ul cu `background?: boolean`
2. Pentru combinațiile „riscante” (ex: `reasoning_effort: high` sau `enable_web_search: true` cu `medium/high`) **nu mai faci `stream: true`**, ci:

   * `POST /v1/responses` cu `background: true, store: true, stream: false`
   * `poll` cu `GET /v1/responses/{id}` până la status terminal

> Observație importantă pentru codul tău: tu ai `store: !args.previous_response_id` la prima iterație. **Pentru background trebuie `store: true` mereu**, altfel nu poți face polling (și unele request-uri stateless sunt respinse în background). ([OpenAI Platform][2])

### Cod (drop-in helpers)

```ts
type ResponseStatus = 'completed' | 'failed' | 'in_progress' | 'cancelled' | 'queued' | 'incomplete';

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

async function createBackgroundResponse(
  apiKey: string,
  request: any,
  timeoutMs = 30_000
): Promise<{ id: string; status: ResponseStatus }> {
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      ...request,
      // background mode:
      background: true,
      store: true,   // REQUIRED for background polling
      stream: false, // return fast, poll later
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`createBackgroundResponse failed: ${resp.status} ${resp.statusText} - ${txt}`);
  }

  const data = await resp.json();
  return { id: data.id, status: data.status };
}

async function retrieveResponse(apiKey: string, id: string, timeoutMs = 20_000): Promise<any> {
  const resp = await fetch(`https://api.openai.com/v1/responses/${id}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`retrieveResponse failed: ${resp.status} ${resp.statusText} - ${txt}`);
  }

  return resp.json();
}

async function pollUntilTerminal(
  apiKey: string,
  id: string,
  {
    deadlineMs,
    minIntervalMs = 400,
    maxIntervalMs = 2500,
  }: { deadlineMs: number; minIntervalMs?: number; maxIntervalMs?: number }
): Promise<any> {
  let interval = minIntervalMs;

  while (Date.now() < deadlineMs) {
    const data = await retrieveResponse(apiKey, id);

    const status: ResponseStatus = data.status;
    if (status !== 'queued' && status !== 'in_progress') {
      return data; // completed / failed / incomplete / cancelled
    }

    // backoff cu jitter
    const jitter = Math.floor(Math.random() * 150);
    await sleep(interval + jitter);
    interval = Math.min(maxIntervalMs, Math.floor(interval * 1.35));
  }

  throw new Error(`Polling timeout for response ${id}`);
}

async function cancelResponse(apiKey: string, id: string): Promise<void> {
  // Cancel works for background responses. :contentReference[oaicite:4]{index=4}
  await fetch(`https://api.openai.com/v1/responses/${id}/cancel`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
  }).catch(() => {});
}
```

### Integrare în bucla ta de agent (conceptual)

În loc de blocul tău:

```ts
const response = await fetch('https://api.openai.com/v1/responses', { ... stream: useStreaming ... })
...
if (useStreaming) processStreamingResponse(...)
else data = await response.json()
```

faci ceva de genul:

```ts
const shouldUseBackground =
  adaptiveReasoningEffort === 'high' ||
  (args.enable_web_search === true && ['medium', 'high'].includes(adaptiveReasoningEffort));

if (shouldUseBackground) {
  // 1) create (fast)
  const { id } = await createBackgroundResponse(context.apiKey, request);

  // 2) poll (many short GETs)
  let data: any;
  try {
    data = await pollUntilTerminal(context.apiKey, id, { deadlineMs: overallDeadline });
  } catch (e) {
    await cancelResponse(context.apiKey, id);
    throw e;
  }

  previousResponseId = data.id;

  // apoi folosești exact logica ta existentă:
  // - parse usage
  // - extractOutputText(data)
  // - detect function_call items din data.output
  // - execută tool calls etc.
} else {
  // păstrezi streaming-ul tău actual (low/medium fără web_search, de ex.)
}
```

**De ce funcționează:** în loc să ții un socket deschis 1–10 minute (și să mori la timeout), faci **zeci/sute de request-uri scurte** (GET) care nu depășesc timeout-urile tipice.

---

## 2) „MCP-style” corect pentru lucrări lungi: tool-uri `start` + `poll` (+ `cancel`)

Asta e partea „diferită față de un API normal”: în MCP, un tool call e (de obicei) așteptat să răspundă într-un timp rezonabil. Pentru task-uri lungi, cel mai robust pattern e:

* `gpt5_agent_start(args) -> { job_id }`
* `gpt5_agent_poll({job_id}) -> { status, progress, output? }`
* `gpt5_agent_cancel({job_id}) -> { status: "cancelled" }`

### De ce merită

* Nu depinzi de timeout-ul clientului MCP / UI / orchestrator.
* Poți raporta progres (iterații, ultimul response_id, etc.).
* Poți „resume” după restart dacă pui job store în Redis/DB.

### Schiță de implementare (în-memory, simplu)

```ts
type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

type AgentJob = {
  jobId: string;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  // pointeri utili:
  currentResponseId?: string;
  iterations?: number;
  lastMessage?: string;   // ex: ultimii 2-4k chars
  resultPath?: string;    // dacă salvezi în fișier
  error?: string;
  cancelRequested?: boolean;
};

const JOBS = new Map<string, AgentJob>();

function makeJobId() {
  return `job_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
```

#### Tool: `gpt5_agent_start`

* Creează job
* Pornește execuția într-un „worker” async (nu await)
* Returnează job_id imediat

```ts
async function gpt5_agent_start(args: GPT5AgentArgs, ctx: ToolExecutionContext) {
  const jobId = makeJobId();
  const job: AgentJob = {
    jobId,
    status: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  JOBS.set(jobId, job);

  // fire-and-forget
  runAgentJob(jobId, args, ctx).catch(err => {
    const j = JOBS.get(jobId);
    if (j) {
      j.status = 'failed';
      j.error = err?.message || String(err);
      j.updatedAt = Date.now();
    }
  });

  return { job_id: jobId, status: 'queued' };
}
```

#### Worker: `runAgentJob`

Aici refolosești `GPT5AgentTool.execute`, dar:

* scrii progres în `JOBS`
* folosești **Background + Polling** pentru OpenAI calls (ca în secțiunea 1)
* verifici `cancelRequested` periodic; dacă e true și ai `currentResponseId`, dai cancel la OpenAI (`/cancel`) ([OpenAI Platform][3])

```ts
async function runAgentJob(jobId: string, args: GPT5AgentArgs, ctx: ToolExecutionContext) {
  const job = JOBS.get(jobId);
  if (!job) return;

  job.status = 'running';
  job.updatedAt = Date.now();

  // Aici: rulezi bucla ta de agent
  // La fiecare iterație:
  //   job.iterations = i
  //   job.currentResponseId = previousResponseId
  //   job.lastMessage = tail(finalOutput, 4000)
  //   job.updatedAt = Date.now()
  // Dacă job.cancelRequested => arunci/cancel

  // La final:
  job.status = 'completed';
  job.updatedAt = Date.now();
  job.resultPath = '_gpt5_docs/....md';
}
```

#### Tool: `gpt5_agent_poll`

```ts
async function gpt5_agent_poll(jobId: string) {
  const job = JOBS.get(jobId);
  if (!job) return { error: 'job_not_found' };

  return {
    job_id: job.jobId,
    status: job.status,
    iterations: job.iterations ?? 0,
    response_id: job.currentResponseId,
    preview: job.lastMessage,
    result_path: job.resultPath,
    error: job.error,
    updated_at: job.updatedAt,
  };
}
```

#### Tool: `gpt5_agent_cancel`

```ts
async function gpt5_agent_cancel(jobId: string) {
  const job = JOBS.get(jobId);
  if (!job) return { error: 'job_not_found' };

  job.cancelRequested = true;
  job.status = 'cancelled';
  job.updatedAt = Date.now();
  return { job_id: jobId, status: 'cancelled' };
}
```

### Note practice (altfel te lovești de probleme noi)

* **TTL cleanup**: șterge joburile vechi (ex: >24h) ca să nu umpli RAM.
* **Concurență**: pune o coadă (p-limit) ca să nu rulezi 50 joburi simultan.
* **Persistență**: dacă MCP serverul poate reporni, treci JOBS în Redis/SQLite.
* **Polling interval**: 0.4–2.5s cu backoff e ok; nu vrei 20 poll/s.

---

## Ce aș face în cazul tău (rapid + robust)

1. **Acum**: implementezi **Background + Polling în interiorul** `gpt5_agent` (secțiunea 1). Asta îți taie „socket hang up” către OpenAI.
2. **După** (dacă vezi timeout-uri MCP/client): adaugi tool-urile `start/poll/cancel` (secțiunea 2) și păstrezi `gpt5_agent` sincron pentru backwards compatibility.

Dacă vrei, îți pot arăta exact **unde** în codul tău să introduci `shouldUseBackground` și cum să refaci blocul `useStreaming` astfel încât:

* `low` rămâne streaming,
* `medium/high + web_search` devine background,
* iar `store` devine coerent (mai ales când ai `previous_response_id`).

[1]: https://community.openai.com/t/unexpectedly-high-time-to-first-token-with-gpt-4-1-agents-sdk/1362735 "Unexpectedly High Time to First Token with GPT-4.1 (Agents SDK) - API - OpenAI Developer Community"
[2]: https://platform.openai.com/docs/guides/background "Background mode | OpenAI API"
[3]: https://platform.openai.com/docs/api-reference/responses "Responses | OpenAI API Reference"
