# Raport: Socket Hang Up în MCP Server pentru GPT-5 Agent

## Problema

Când folosim `gpt5_agent` tool cu **high reasoning** + **web search enabled**, primim eroarea:
```
The socket connection was closed unexpectedly
```

Eroarea apare **doar** când rulăm prin MCP (Model Context Protocol). Un script identic rulat direct în Node.js funcționează perfect.

---

## Context Tehnic

- **MCP Server**: bazat pe `@modelcontextprotocol/sdk` v1.24.3
- **API**: OpenAI Responses API (`/v1/responses`)
- **Node.js**: 18+ (folosim native fetch)
- **Transport**: stdio (MCP server rulează ca subprocess al Claude Code)

---

## Ce funcționează vs ce nu funcționează

| Scenariul | Rezultat |
|-----------|----------|
| `reasoning: medium`, fără web search | ✅ Funcționează (streaming) |
| `reasoning: high` + web search, **script direct** | ✅ Funcționează (211 secunde) |
| `reasoning: high` + web search, **prin MCP** | ❌ Socket closed |
| `background: true` + polling, **script direct** | ✅ Funcționează |
| `background: true` + polling, **prin MCP** | ❌ Socket closed |

---

## Ce am încercat

### 1. Înlocuit `node-fetch` cu native `fetch`
- **Rațiune**: node-fetch ar putea gestiona diferit conexiunile
- **Rezultat**: Același error, mesaj ușor diferit ("socket hang up" → "socket connection closed unexpectedly")

### 2. Schimbat modul de timeout
- Din `AbortSignal.timeout(ms)` în `AbortController` + `setTimeout`
- **Rezultat**: Fără efect

### 3. Eliminat timeout/signal complet pentru background mode
- **Rezultat**: Fără efect

### 4. Background + Stream mode
- Ideea: `background: true` + `stream: true` - primim `response.created` event rapid cu ID-ul, apoi polling
- Timeout crescut la 120s
- **Rezultat**: Conexiunea se închide înainte să primim primul byte

### 5. Streaming pentru toate nivelurile de reasoning
- **Rezultat**: Funcționează pentru medium, dar high + web search tot eșuează

---

## Test Direct (funcționează!)

```javascript
// test-background-api.mjs - rulat direct cu: node test-background-api.mjs
const response = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`
  },
  body: JSON.stringify({
    model: "gpt-5.2",
    input: [...],
    tools: [{ type: "web_search_preview" }],
    reasoning: { effort: "high" },
    background: true,
    stream: false,
    store: true
  })
});

// Rezultat: POST returnează în 1.29s cu response ID
// Polling completează în 211s
// ✅ FUNCȚIONEAZĂ PERFECT
```

---

## Ipoteze

### 1. MCP Client Timeout
Claude Code (MCP client) ar putea avea un timeout intern pe tool calls care nu e documentat/configurabil.

### 2. stdio Transport Layer
Comunicarea MCP prin stdio ar putea avea limitări pentru request-uri cu TTFB (Time to First Byte) mare.

### 3. Event Loop Blocking
Poate există ceva în MCP SDK care blochează event loop-ul sau interferează cu conexiunile HTTP.

### 4. Undici (native fetch) + subprocess
Native fetch în Node.js folosește undici. Ar putea exista incompatibilități când rulează într-un subprocess cu stdio.

---

## Cod Relevant

**Fișier principal**: `src/tools/built-in/gpt5-agent.ts`

```typescript
// Mode selection
const useBackground =
  adaptiveReasoningEffort === 'high' ||
  (args.enable_web_search === true && ['medium', 'high'].includes(adaptiveReasoningEffort));

// Request cu background + stream
const response = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${context.apiKey}`,
  },
  body: JSON.stringify({
    ...request,
    background: true,
    stream: true  // Pentru a primi response.created rapid
  })
});

// Parse SSE pentru response.created
const reader = response.body.getReader();
// ... parsare până la response.created event
// Dar conexiunea se închide înainte să primim orice
```

---

## Întrebări pentru Review

1. Știi dacă MCP SDK sau Claude Code au timeout-uri pe tool execution?
2. Ai experiență cu request-uri HTTP lungi (TTFB > 30s) în MCP servers?
3. Există workaround-uri pentru stdio transport limitations?
4. Ar trebui să implementăm tool-uri separate (`gpt5_start_job` + `gpt5_poll_job`) în loc de un singur tool?

---

## Fișiere Relevante

- `src/tools/built-in/gpt5-agent.ts` - implementarea principală
- `test-background-api.mjs` - script de test direct (funcționează)
- `Solution background2 chatgpt.md` - analiza originală a problemei

---

## Branch

`feat/streaming` - toate modificările sunt aici

Commits relevante:
- `1ae7d9c` - Replace node-fetch with native fetch
- `f7210a8` - Improve background mode reliability
- `dff6c20` - Implement background processing for high reasoning
