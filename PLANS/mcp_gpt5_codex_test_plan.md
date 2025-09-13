# MCP Test Plan: gpt5_codex (Codex CLI exec)

This test plan validates the new MCP tool `gpt5_codex`, which drives the Codex CLI in headless exec mode. Tests are organized for quick execution by another agent or human tester.

## Prerequisites
- Codex CLI v0.34.0+ installed and in PATH (`codex --version`).
- `OPENAI_API_KEY` configured (Codex CLI logged in or API-based profile).
- For web search in exec mode: either
  - Pass `-c tools.web_search=true` (preferred), or
  - Persist in `~/.codex/config.toml` under `[tools] web_search = true`.
- MCP server running this repo build (compiled TS → JS): `npm run build`, then start MCP server as usual in your client (e.g., Claude Code).

## MCP Tool Reference
- Tool name: `gpt5_codex`
- Input schema (key fields):
  - `task`: string (required)
  - `model`: string (default `gpt-5`)
  - `profile`: string (optional)
  - `reasoning_effort`: `minimal|low|medium|high`
  - `verbosity`: `low|medium|high`
  - `edit_mode`: `research|auto_edit|full_auto|dangerous`
  - `file_path`: string (abs path)
  - `files`: [{ path, label? }] (abs paths)
  - `images`: [abs paths]
  - `enable_web_search`: boolean
  - `save_to_file`: boolean (default true)
  - `display_in_chat`: boolean (default true)
  - `timeout_sec`: number (default 300)

Notes
- Web search in exec mode is enabled via `-c tools.web_search=true` (the tool does this when `enable_web_search=true`). Do not rely on `--search`.
- Text files ≤100KB are inlined into the prompt. Total inline text cap: 200KB.
- Images are attached via `-i` and not inlined.
- The tool captures the final message using `--output-last-message` for clean output.

---

## Test 1 — Smoke: minimal task, research mode
- Input:
  ```json
  {
    "task": "Say hello in one short sentence.",
    "edit_mode": "research",
    "reasoning_effort": "low",
    "save_to_file": true,
    "display_in_chat": true
  }
  ```
- Expect:
  - Status: success
  - Output: short greeting
  - A file created under `gpt5_docs/agent_*.md` containing the result

## Test 2 — Web Search: product announcement summary (Apple first)
- Input:
  ```json
  {
    "task": "Use web search to summarize the iPhone Air announcement (2025-09-09). Output plain text (NO JSON). Include 1) one-line summary; 2) 3–6 key specs; 3) pre-order and availability dates; 4) ≥2 sources with direct URLs, Apple first. Keep it concise and factual.",
    "enable_web_search": true,
    "reasoning_effort": "low",
    "verbosity": "low",
    "edit_mode": "research"
  }
  ```
- Expect:
  - Status: success
  - Mentions Apple Newsroom (or Apple product page) and at least one reputable outlet
  - Dates include pre-order (Sept 12, 2025) and availability (Sept 19, 2025)
  - If sources differ, notes conflicts briefly

## Test 3 — Real-time query: London temperature (web search behavior)
- Input:
  ```json
  {
    "task": "What is the current temperature in London right now? Cite at least two sources.",
    "enable_web_search": true,
    "reasoning_effort": "low",
    "verbosity": "low",
    "edit_mode": "research"
  }
  ```
- Expect:
  - Status: success
  - If exact real-time value not accessible, the answer should state limitations and still cite sources (e.g., BBC Weather, Met Office) with direct URLs

## Test 4 — Model override: `gpt-5-chat-latest`
- Input:
  ```json
  {
    "task": "Summarize three key differences between git rebase and git merge.",
    "model": "gpt-5-chat-latest",
    "reasoning_effort": "low",
    "edit_mode": "research"
  }
  ```
- Expect: coherent, concise bullets; save file path reported if `save_to_file=true`.

## Test 5 — File inlining: single text file
- Use absolute path to an existing text file (≤100KB), e.g., `gpt5_docs/test_web_search.md`.
- Input:
  ```json
  {
    "task": "Read the attached file and summarize it in 3 bullets.",
    "file_path": "/absolute/path/to/gpt5_docs/test_web_search.md",
    "edit_mode": "research",
    "reasoning_effort": "low"
  }
  ```
- Expect: file content referenced in the answer; present a short summary; status success.

## Test 6 — File inlining cap: multiple files total >200KB
- Provide a set of large text files exceeding 200KB when combined.
- Input:
  ```json
  {
    "task": "Summarize the attached docs.",
    "files": [ {"path": "/abs/path/large1.txt"}, {"path": "/abs/path/large2.txt"} ],
    "edit_mode": "research"
  }
  ```
- Expect: status error with a clear message about the 200KB inline cap.

## Test 7 — Image attachment
- Use an existing image path, e.g., `_IMAGES/Apple_logo_simple_bitten_apple_silhouette_clean_de_2025-08-25T19-00-20.png`.
- Input:
  ```json
  {
    "task": "Describe the attached image in one paragraph.",
    "images": ["/absolute/path/to/_IMAGES/Apple_logo_simple_bitten_apple_silhouette_clean_de_2025-08-25T19-00-20.png"],
    "edit_mode": "research",
    "reasoning_effort": "low"
  }
  ```
- Expect: a single coherent paragraph; status success.

## Test 8 — Edit modes (safety)
- Research mode should NOT make edits or run unsafe commands:
  ```json
  {
    "task": "Propose code changes to README.md but do not modify files.",
    "edit_mode": "research"
  }
  ```
- Auto edit can perform safe edits inside workspace:
  ```json
  {
    "task": "Create a file NOTES.md with a short checklist.",
    "edit_mode": "auto_edit"
  }
  ```
- Expect:
  - In research: no changes applied; suggestions only
  - In auto_edit: Codex may create/modify files; verify the file appears and contains the checklist

## Test 9 — Timeout handling
- Input (use a task prone to long processing):
  ```json
  {
    "task": "Exhaustive dependency audit across the repo with step-by-step plan.",
    "edit_mode": "research",
    "timeout_sec": 5
  }
  ```
- Expect: status `timeout` and a clear note; no crash.

## Test 10 — `save_to_file` × `display_in_chat` matrix
- A) `save_to_file=true`, `display_in_chat=true` (default): full content + saved path shown
- B) `save_to_file=true`, `display_in_chat=false`: only metadata + file path
- C) `save_to_file=false`, `display_in_chat=true`: content only, no file
- D) `save_to_file=false`, `display_in_chat=false`: content only (flag ignored for compatibility)

## Test 11 — Profile routing
- If you have a Codex profile with special defaults (e.g., cloud), test with:
  ```json
  {
    "task": "Verify your current execution environment and list enabled tools.",
    "profile": "my_cloud_profile",
    "edit_mode": "research"
  }
  ```
- Expect: environment report; if cloud with internet enabled, web search should behave consistently when `enable_web_search=true`.

## Test 12 — Error surfaces: missing file path
- Input:
  ```json
  {
    "task": "Read and summarize the missing file.",
    "file_path": "/does/not/exist.txt",
    "edit_mode": "research"
  }
  ```
- Expect: status error: includes `ENOENT` or a friendly “File not found” message.

---

## Direct Codex CLI (optional parity checks)
- Web search (exec):
  ```bash
  outfile=/tmp/codex_last.txt
  codex -c tools.web_search=true -a untrusted -s read-only -m gpt-5 \
    exec --output-last-message "$outfile" \
    "Use web search to summarize the iPhone Air announcement (2025-09-09). Output plain text."
  cat "$outfile"
  ```
- Research vs auto-edit quick check:
  ```bash
  codex -a untrusted -s read-only exec "Propose edits to README.md without applying them."
  codex -a untrusted -s workspace-write exec "Create a NOTES.md with a short checklist."
  ```

## Pass Criteria Summary
- All “success” tests return coherent content and (when requested) save files under `gpt5_docs/`.
- Web search tests include direct URLs and handle limitations gracefully.
- File inline limits are enforced with clear errors.
- Edit modes honor safety expectations.
- Timeouts return `timeout` status cleanly.

---

## Update 2025-09-13 — PATH/Codex binary hardening

What changed
- Tool code now honors `CODEX_BIN` env var to choose the Codex CLI binary; falls back to `codex` on PATH.
- Build refreshed via `npm run build` (TypeScript → `build/`).
- User config updated to include `CODEX_BIN = "/opt/homebrew/bin/codex"` under `[mcp_servers.gpt5-server].env`.

Why
- Some IDE/MCP hosts sandbox PATH differently, causing `spawn('codex', ...)` to fail. Explicit `CODEX_BIN` removes ambiguity.

After restart — re-test sequence
- 0) Restart the MCP client/session to reload `/Users/cristi/.codex/config.toml` and the server.
- 1) Quick smoke (Test 1) with defaults; expect success and a new file in `gpt5_docs/`.
- 2) Confirm binary resolution indirectly: success of Test 1 and absence of `No final message captured` note. If failure persists, verify `CODEX_BIN` path and permissions.
- 3) Run Test 2 (web search) to confirm `-c tools.web_search=true` is applied by the tool when `enable_web_search=true`.
- 4) Run Test 8 (edit modes): ensure `research` does not edit files, `auto_edit` is allowed to create `NOTES.md`.
- 5) Proceed with remaining tests (3–7, 9–12) as listed.

Troubleshooting tips
- If “Tool execution failed” appears, check that:
  - `codex --version` resolves at `/opt/homebrew/bin/codex` when run outside the IDE.
  - The MCP server logs show: `Environment loaded from: .../.env` and no ENOENT for the codex binary.
  - `OPENAI_API_KEY` is present in the MCP server env.
