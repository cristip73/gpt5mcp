# gpt5_agent Streaming Fix - Test Report

**Date**: 2026-02-17
**Build**: post-TextDecoder fix (10:56 build)
**Tester**: Claude Opus 4.6 via general-purpose agents

---

## Bug Summary

### Root Cause
`Uint8Array.toString()` in Node.js returns comma-separated byte values (e.g. `"72,101,108,108,111"`) instead of text (`"Hello"`). The SSE streaming parser used `.toString()` on chunks from `fetch()` ReadableStream, causing **zero events parsed, zero output, zero tokens** on every streaming call.

### Secondary Issues Fixed
1. **Missing `break` from `for await` loop** - after `response.completed` event, loop continued waiting for next chunk indefinitely
2. **Activity timeout never fired** - `lastActivityTime` was reset on each chunk, checked immediately after = always ~0ms difference
3. **No SSE debug logging** - impossible to diagnose streaming issues

### Fixes Applied (`src/tools/built-in/gpt5-agent.ts`)
1. **TextDecoder** for Uint8Array chunks (`typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })`)
2. **`if (accumulator.done) break`** after processing each chunk's lines
3. **AbortController + setTimeout** safety net (3 min inactivity timeout)
4. **SSE debug logging** via `GPT5_DEBUG_SSE=1` env var
5. **Comprehensive event handling** - web_search, file_search, code_interpreter events recognized; unknown events logged

---

## Test Results

### Quick Reference

| # | Test Case | Reasoning | Verbosity | Web Search | Save | Duration | Tokens | Output | Status |
|---|-----------|-----------|-----------|------------|------|----------|--------|--------|--------|
| 1 | Simple task (palindrome) | low | low | no | no | 2.2s | 169 | 104 chars | PASS |
| 2 | RN 0.83 features | medium | medium | yes | no | 108.4s | 24,502 | 1,829 out | PASS |
| 3 | "What is 2+2" (non-streaming) | none | low | no | no | 1.1s | 63 | "Four" | PASS |
| 4 | TypeScript 5.8 vs 5.9 | medium | high | yes | no | 208.1s | 61,132 | ~8,500 chars | PASS |
| 5 | RSC vs SSR | high | low | yes | yes | 26.2s | ~6,200 | 5.3KB file | PASS |
| 6 | RN Auth guide | high | high | yes | yes | 190.1s | ~66,000 | 32.9KB file | PASS |
| 7 | Invalid model (error) | - | - | - | - | <1s | - | graceful error | PASS |
| 8 | Empty task string | - | - | - | - | 2.6s | - | helpful message | PASS |
| 9 | 10 quantum questions | medium | high | yes | no | 292.8s | 71,500 | ~15,800 chars | PASS |
| 10 | Conversation continuation | low | low | no | no | 3.6s (2 calls) | 315 | remembered "42" | PASS |
| 11 | Minimal reasoning (fallback) | minimal->low | low | no | no | 1.4s | 79 | "7 days" | PASS |
| 12 | Pasted RN code review | high | high | no | yes | 45.8s | ~3,600 | 12.3KB, 7/7 bugs | PASS |
| 13 | Pasted Express security | medium | high | no | yes | 43.3s | ~3,000 | 11.6KB, security 2/10 | PASS |
| 14 | Pasted Dockerfile | high | low | no | yes | 31.0s | ~2,700 | 5.8KB, 5/5 optim | PASS |
| 15 | MAXIMAL (4 frameworks x 8 criteria) | high | high | yes | yes | 600s | - | timeout | **FAIL** |
| 16 | Pasted RN error debug | high | high | yes | yes | 186.2s | ~62,000 | 25.4KB | PASS |
| 17 | Pasted package.json audit | high | low | yes | yes | 445.8s* | 140,392 | 18.5KB, 9 CVEs | PASS (retry) |

*Test 17: first attempt timed out at 300s, succeeded on retry with longer timeout

### Pass Rate: 16/17 (94.1%)

---

## Detailed Findings

### Streaming Path (low/medium/high reasoning)
- All streaming calls now parse events correctly via TextDecoder
- `response.completed` event properly triggers loop exit
- Token usage correctly captured from `response.completed` event data
- Web search events (`response.web_search_call.*`) silently consumed without error

### Non-Streaming Path (none/minimal reasoning)
- Works correctly, bypasses SSE entirely
- Sub-2-second response times
- `minimal` not supported by gpt-5.2, falls back to `low` gracefully

### Error Handling
- Invalid model: instant graceful error with clear message
- Empty task: returns helpful guidance instead of crash
- Timeout: streaming abort fires correctly, returns partial result or error

### Conversation Continuation
- `previous_response_id` works correctly
- Context preserved across calls (remembered "42", computed 42*3=126)
- Input tokens increase appropriately (135 vs 61) showing history loaded

### File Saving
- All `save_to_file: true` tests correctly wrote to `_gpt5_docs/`
- Filenames auto-generated from task content + timestamp
- Files include metadata footer with response ID, model, timing, token counts

### Quality Assessment (Pasted Code Tests)
- **React Native code review**: identified all 7 intentional bugs including infinite useEffect loop, loose equality, missing keyExtractor, fire-and-forget DELETE
- **Express.js security audit**: rated 2/10, caught SQL injection, plaintext passwords, weak tokens, IDOR, no CORS/rate limiting. Provided secure rewrite
- **Dockerfile optimization**: suggested multi-stage build, alpine images, layer caching, .dockerignore, npm ci, non-root user, health checks
- **RN error debugging**: correctly identified JS/native version mismatch as root cause, provided platform-specific remediation steps with version numbers
- **Package.json audit**: identified 9+ CVEs with specific version fixes, noted moment.js deprecation

---

## Known Limitations

### Timeout on Very Complex Tasks
- **Test 15 (MAXIMAL)**: 4 frameworks x 8 criteria + web search + high reasoning + quality_over_cost exceeded 600s timeout
- **Test 17 (first attempt)**: package.json audit with web search exceeded 300s on first try
- **Recommendation**: Tasks requiring 30+ web searches with high reasoning may need `max_execution_time_seconds: 900` or task splitting

### SSE Event Format
- OpenAI sends `response.completed` as the final event (NOT `response.done`)
- Both are handled, but `response.done` was never observed in any test
- `response.output_text.annotation.added` events (web search citations) are received but not parsed for data - citations appear inline in text

### Timeout Budget vs Actual
- `max_execution_time_seconds` maps to both fetch timeout AND overall deadline
- Web search tasks typically use 60-80% of budget (search time + reasoning + streaming)
- The `AbortSignal.timeout(fetchTimeoutMs)` on fetch may not abort mid-stream reliably; the activity timer is the real safety net

---

## Recommendations

1. **Increase default timeout** for web search tasks to 300s minimum (currently can be as low as 120s)
2. **Consider task splitting** for research tasks with 10+ data points
3. **Enable `GPT5_DEBUG_SSE=1`** in production for a few days to collect event statistics
4. **Monitor `response.output_text.annotation.added`** events - could extract citation URLs for structured output
5. **Add MCP-level timeout** as ultimate safety net above the streaming timeout
