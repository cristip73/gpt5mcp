# Changelog

## [2026-01-09] - Streaming Fix

### Fixed
- **Socket hang up error** cu `reasoning_effort: high` + `enable_web_search: true`

### Root Cause
Problema nu era în cod. Fișierul `.mcp.json` pointa la `dist/gpt5-server` (binary creat pe 28 decembrie) în loc de `build/index.js`. Toate modificările la cod nu se testau de fapt - rulam versiunea veche.

### Solution
- Corectat `.mcp.json` să folosească `node build/index.js`
- Implementarea originală de **SSE streaming** funcționează corect
- Streaming previne timeout-ul MCP client (~60-120s) prin menținerea conexiunii active

### Removed (cleanup)
- Fișiere de diagnostic: `API_DIAGNOSTIC.md`, `DIAGNOSTIC_CODEX.md`, `RAPORT_SOCKET_HANGUP.md`
- Fișiere de soluții temporare: `Solution background*.md`, `test-background-api.mjs`
- Cod inutil: operation parameter (start/poll/cancel), background processing, native fetch switch

### Technical Details
- SSE streaming folosește `node-fetch` cu activity timeout de 120s
- Streaming activat pentru toate reasoning efforts (except none/minimal)
- Request timeout până la 15 minute pentru tasks complexe

### Lesson Learned
**Întotdeauna verifică că testezi codul corect.** Build output (`build/`) vs bundled binary (`dist/`) pot fi diferite.
