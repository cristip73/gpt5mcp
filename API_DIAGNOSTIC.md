# GPT-5 Agent API Diagnostic

## Eroare
```
Agent execution failed: The socket connection was closed unexpectedly
```

## Task testat
```
task: "Research the latest developments in quantum computing in 2025. Provide a comprehensive summary with sources."
reasoning_effort: "high"
enable_web_search: true
model: "gpt-5.2" (default)
```

---

## 1. API Call - POST pentru Background Mode

### Endpoint
```
POST https://api.openai.com/v1/responses
```

### Headers
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer $OPENAI_API_KEY"
}
```

### Request Body
```json
{
  "model": "gpt-5.2",
  "input": [
    {
      "role": "system",
      "content": "You are an autonomous agent. Continue working on the task until it is complete. Use available tools as needed to accomplish your goal. Be persistent and thorough, but also efficient. Provide brief status updates between tool calls. "
    },
    {
      "role": "user",
      "content": [
        {
          "type": "input_text",
          "text": "Research the latest developments in quantum computing in 2025. Provide a comprehensive summary with sources."
        }
      ]
    }
  ],
  "tools": [
    {
      "type": "web_search_preview"
    }
  ],
  "reasoning": {
    "effort": "high",
    "summary": "auto"
  },
  "text": {
    "verbosity": "medium"
  },
  "max_output_tokens": 32000,
  "background": true,
  "stream": false,
  "store": true
}
```

### Timeout
```
30000ms (30 secunde) - când a apărut eroarea
```

### Răspuns Așteptat (Background Mode)
```json
{
  "id": "resp_xxxxxxxxxxxxx",
  "status": "queued"
}
```

### Ce se întâmplă de fapt
- POST-ul nu returnează în 60 secunde
- Eroare: "socket connection was closed unexpectedly"
- Conexiunea e închisă de Cloudflare/proxy înainte de a primi răspuns

---

## 2. Polling (dacă ar funcționa POST-ul)

### Endpoint
```
GET https://api.openai.com/v1/responses/{response_id}
```

### Headers
```json
{
  "Authorization": "Bearer $OPENAI_API_KEY",
  "Content-Type": "application/json"
}
```

### Timeout per poll
```
20000ms (20 secunde)
```

### Polling interval
```
Start: 400ms
Max: 2500ms
Backoff: interval * 1.35
Jitter: +0-150ms
```

### Status posibile
- `queued` - în coadă, continuă polling
- `in_progress` - se procesează, continuă polling
- `completed` - gata, extrage output
- `failed` - eroare, stop
- `cancelled` - anulat, stop

### Răspuns la `completed`
```json
{
  "id": "resp_xxxxxxxxxxxxx",
  "status": "completed",
  "output": [
    {
      "type": "message",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "..."
        }
      ]
    }
  ],
  "output_text": "...",
  "reasoning_summary": "...",
  "usage": {
    "input_tokens": 123,
    "output_tokens": 456,
    "output_tokens_details": {
      "reasoning_tokens": 789
    }
  }
}
```

---

## 3. Cod Relevant

### Condiție pentru Background Mode
```typescript
const useBackground =
  adaptiveReasoningEffort === 'high' ||
  (args.enable_web_search === true && ['medium', 'high'].includes(adaptiveReasoningEffort));
```

### pollForCompletion()
```typescript
async function pollForCompletion(
  responseId: string,
  apiKey: string,
  maxWaitMs: number = 900000,    // 15 min default
  minIntervalMs: number = 400,   // start interval
  maxIntervalMs: number = 2500   // max interval
): Promise<BackgroundResult>
```

---

## 4. Întrebări pentru Diagnostic

1. **Background mode funcționează pentru GPT-5.2 cu web_search_preview?**
   - Documentația menționează background mode pentru GPT-5.2
   - Dar nu e clar dacă funcționează cu tools (web search)

2. **TTFB (Time To First Byte) pentru background requests?**
   - Ar trebui să fie instant (~1-5s)
   - Noi primim timeout la 60s

3. **Este Cloudflare timeout-ul (60s) care închide conexiunea?**
   - Eroarea "socket connection was closed unexpectedly" sugerează asta

4. **Este corect request body-ul?**
   - `background: true` e prezent
   - `stream: false` e prezent
   - `store: true` e prezent

---

## 5. Ce funcționează vs ce nu

| Scenario | Status |
|----------|--------|
| `high` reasoning, simplu (2+2) | ✅ 2s |
| `high` reasoning, fără web search, task simplu | ✅ |
| `high` reasoning, fără web search, task complex | ❌ timeout |
| `high` reasoning, cu web search | ❌ timeout |
| `medium` reasoning, cu web search | ❌ timeout |
| `medium` reasoning, fără web search | ✅ streaming |
| `low` reasoning | ✅ streaming |
