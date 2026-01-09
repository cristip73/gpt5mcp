## 🤖 GPT-5 Codex Task Completed

**Task**: Analyze this MCP server socket hang up problem and provide a diagnostic with potential solutions.

## Problem Summary
When using `gpt5_agent` tool with **high reasoning** + **web search enabled** through MCP (Model Context Protocol), we get:
```
The socket connection was closed unexpectedly
```

The SAME code works perfectly when run as a standalone Node.js script (not through MCP).

## Technical Context
- MCP Server: `@modelcontextprotocol/sdk` v1.24.3
- API: OpenAI Responses API (`/v1/responses`)
- Node.js 18+ with native fetch (replaced node-fetch)
- Transport: stdio (MCP server runs as subprocess of Claude Code)

## What works vs doesn't work
| Scenario | Result |
|----------|--------|
| `reasoning: medium`, no web search | ✅ Works (streaming) |
| `reasoning: high` + web search, **direct script** | ✅ Works (211 seconds) |
| `reasoning: high` + web search, **through MCP** | ❌ Socket closed |
| `background: true` + polling, **direct script** | ✅ Works |
| `background: true` + polling, **through MCP** | ❌ Socket closed |

## What we tried (all failed)
1. Replaced `node-fetch` with native `fetch`
2. Changed from `AbortSignal.timeout()` to manual `AbortController`
3. Removed timeout/signal completely for background mode
4. Used `background: true` + `stream: true` to get response.created event quickly (120s timeout)
5. Used streaming for all reasoning levels

## Key observation
Direct Node.js script works:
- POST returns in 1.29s with response ID
- Polling completes in 211s
- No socket issues

Through MCP:
- Connection closes before receiving ANY byte from API
- Regardless of timeout configuration

## Questions to investigate
1. Does MCP SDK or Claude Code have internal timeouts on tool execution?
2. Are there stdio transport layer limitations for long TTFB requests?
3. Does undici (native fetch) have issues in subprocess contexts?
4. Should we implement separate tools (`gpt5_start_job` + `gpt5_poll_job`) instead of one tool?

Please research MCP SDK limitations, stdio transport issues, and Node.js fetch in subprocess contexts. Provide a diagnostic with potential solutions.
**Model**: gpt-5.1-codex-max
**Mode**: auto_edit
**Execution Time**: 64.0s

### 📝 Result
Likely cause
- Claude Code (and other MCP clients) kill tool calls after a client‑side watchdog (~120 s by default) on stdio transports, independent of whatever HTTP timeout you set in your code. This is documented via the `MCP_TOOL_TIMEOUT` setting and confirmed by user reports that every MCP tool call times out at ~120 s unless the timeout is raised or the work is split. ([docs.claude.com](https://docs.claude.com/en/docs/claude-code/settings?utm_source=openai))
- A recent bug means the configured timeout isn’t always honored for streaming/SSE connections, so long Response‑API streams can still be cut off even when you set higher values. ([github.com](https://github.com/anthropics/claude-code/issues/3033?utm_source=openai))
- The Responses API call itself is fine (your standalone run proves it); what’s failing is the MCP stdio channel being closed by the client watchdog before any bytes from OpenAI reach your process.

Diagnostics to confirm
- Print timestamps to stderr (not stdout) at: tool entry, before fetch, after fetch returns `response.id`, each poll iteration. If the subprocess dies at a fixed wall time (≈120 s) regardless of network events, it’s the client watchdog.
- Temporarily set `MCP_TOOL_TIMEOUT` to a very small value (e.g., 5000) in Claude Code settings; if you now reproduce the error in ~5 s, you’ve isolated the watchdog.
- Check whether the first Responses call is made with `stream:false`. Without streaming or background, TTFB for reasoning+search can exceed the watchdog.

Practical mitigations
1) Keep every tool invocation under the watchdog limit.
   - Return immediately after kicking off the job: implement two tools, `gpt5_start_job` (submit with `background:true`/`stream:false`, return `response.id` in <2 s) and `gpt5_poll_job` (poll up to, say, 20–30 s, then return status so the client can call again). This pattern is resilient even if timeouts aren’t honored.
2) Raise the client timeout where possible.
   - In Claude Code: set `MCP_TOOL_TIMEOUT` (ms) in settings or per‑server `env`. Example: `MCP_TOOL_TIMEOUT=600000` for 10 min. Note: current bug may ignore this for SSE, so still use (1). ([docs.claude.com](https://docs.claude.com/en/docs/claude-code/settings?utm_source=openai))
3) Send progress pings.
   - Emit MCP `$/progress` notifications or lightweight stderr heartbeats every ~15 s; some clients reset their timer on progress (not guaranteed, but low‑cost).
4) Avoid stdout noise.
   - Ensure no `console.log` to stdout; use stderr for logs so you don’t corrupt the stdio protocol (a corrupted frame also makes the client tear down the socket).
5) Network layer tweaks (low probability here since standalone works).
   - Use a keep‑alive agent (`new Agent({ keepAlive:true })`) to reduce chance of idle TCP resets, and ensure no proxy variables differ between Claude Code subprocess and your shell.

Suggested minimal change
- Add a fast “starter” tool and a short‑window “poll” tool; cap each poll call to <30 s; continue polling until `status === 'completed'`. This sidesteps the stdio watchdog entirely and matches the Responses API background workflow.

*Generated: 2026-01-09T18:22:00.352Z*