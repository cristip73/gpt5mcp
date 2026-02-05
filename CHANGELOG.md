# Changelog

## [2026-02-05] - Documentation Update

### Updated
- **CLAUDE.md** - Updated with active tools (`gpt5_agent`, `gpt5_codex`) and environment variables
- **README.md** - Completely rewritten with documentation for both active tools
- Default model updated to `gpt-5.2` in documentation

---

## [2026-01-10] - Model Update

### Changed
- **Default models** updated to `gpt-5.2` (agent) and `gpt-5.2-codex` (codex)
- **Tool descriptions** improved for clarity

---

## [2026-01-09] - Streaming Fix

### Fixed
- **Socket hang up error** with `reasoning_effort: high` + `enable_web_search: true`

### Root Cause
The issue was not in the code. The `.mcp.json` file pointed to `dist/gpt5-server` (binary created on December 28) instead of `build/index.js`. All code changes were not actually being tested - we were running the old version.

### Solution
- Fixed `.mcp.json` to use `node build/index.js`
- The original **SSE streaming** implementation works correctly
- Streaming prevents MCP client timeout (~60-120s) by keeping the connection active

### Removed (cleanup)
- Diagnostic files: `API_DIAGNOSTIC.md`, `DIAGNOSTIC_CODEX.md`, `RAPORT_SOCKET_HANGUP.md`
- Temporary solution files: `Solution background*.md`, `test-background-api.mjs`
- Unused code: operation parameter (start/poll/cancel), background processing, native fetch switch

### Technical Details
- SSE streaming uses `node-fetch` with 120s activity timeout
- Streaming enabled for all reasoning efforts (except none/minimal)
- Request timeout up to 15 minutes for complex tasks

### Lesson Learned
**Always verify you're testing the correct code.** Build output (`build/`) vs bundled binary (`dist/`) can be different.
