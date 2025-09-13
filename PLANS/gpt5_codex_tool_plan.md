# GPT-5 Codex Tool Plan (gpt5_codex)

## Overview
Create a new MCP tool `gpt5_codex` that runs OpenAI Codex CLI in headless mode to execute complex tasks locally (no direct API call from our server). It should mimic `gpt5_agent` behavior where practical, while exposing an explicit argument to control edit permissions (safe research vs. auto-edit vs. full-auto vs. dangerous bypass). Validated with Codex CLI v0.34.0. There is no `--reasoning` flag; use `-c` ephemeral config for reasoning/verbosity. Prefer `-c tools.web_search=true` (and/or `--search`) for web search.

This tool will spawn `codex exec` with appropriate arguments, capture output (prefer `--json`), and optionally save the final result to `gpt5_docs/` with the same conventions as `gpt5_agent`.

## Goals
- Feature parity with `gpt5_agent` where feasible in Codex CLI.
- Clear control over file modification permissions via a single argument.
- Headless, scriptable usage; robust output capture and error reporting.
- Optional file save with consistent naming/metadata and display options.

## References
- docs/codex cli args.md (local cheat-sheet)
- PLANS/gpt5_codex_search.md (search modes, approvals vs. network)
 - Codex CLI v0.34.0 capabilities: `-m/--model`, `exec`, `--json`, `--output-last-message <file>`, `-a/--ask-for-approval` (top‑level), `-s/--sandbox` (top‑level), `--full-auto`, `--dangerously-bypass-approvals-and-sandbox`, `-i/--image`, `-c/--config`, `-p/--profile`, `-C/--cd`, `--oss`. Web Search in exec is enabled via `-c tools.web_search=true`.

## Feature Parity Mapping (gpt5_agent → gpt5_codex)
- task → Codex prompt string passed to `codex exec`.
- model → `--model <id>`.
- reasoning_effort → best‑effort via `-c model_reasoning_effort=<low|medium|high>`; if `minimal` provided, map to `low`.
- verbosity → Prefer ephemeral override: `-c text.verbosity=<low|medium|high>`; fallback: embed instruction in prompt.
- max_iterations → No direct CLI control; rely on Codex agent autonomy; document as not enforced.
- show_preambles → When `--json`, we parse streamed events and can surface brief status lines between phases; otherwise not exposed.
- show_reasoning_summary → N/A; if present in provider output, include; otherwise ignore.
- enable_web_search → If true, prefer `-c tools.web_search=true`. Optionally, persist via TOML `[tools] web_search = true`. This is separate from shell/network access and works in any approval mode. If no search events appear, we surface a diagnostic hint about environment policy. Do not use `--search` in exec mode.
- enable_code_interpreter → Codex uses local execution (edits/tests/run commands); no explicit flag.
- previous_response_id → No session-resume flag known for headless `exec`; considered unsupported.
- quality_over_cost → Not directly controllable; prefer higher `-c model_reasoning_effort` and instruct in prompt.
- file inputs (file_path/files) → No `--files` flag in v0.31.0. We will inline text file contents into the prompt (up to size limits) just like `gpt5_agent`; for images use `-i/--image`.
- save_to_file, display_in_chat → Implement in our tool (same behavior matrix as `gpt5_agent`).

Additional notes:
- parallel_tool_calls: no direct knob in CLI; not applicable.
- tool_calls visibility: reconstruct from `--json` events (assistant messages, edits, commands run) for brief execution summary.

## New Permission Control (explicit argument)
Introduce `edit_mode` (string) to make autonomy clear (v0.31.0):
- `research` (default): read-only research; no edits/unsafe commands.
  - Map: `-a untrusted -s read-only --quiet`
- `auto_edit`: allow file edits, restrict commands to trusted set.
  - Map: `-a untrusted -s workspace-write`
- `full_auto`: maximum autonomy within sandbox protections.
  - Map: `--full-auto` (equivalent to `-a on-failure -s workspace-write`)
- `dangerous`: bypass approvals and sandbox (use with caution).
  - Map: `--dangerously-bypass-approvals-and-sandbox`

Additionally support booleans (optional, if needed):
- `allow_edits` (bool) → maps to `auto_edit` vs `research` when `edit_mode` absent.
- `bypass_sandbox` (bool) → appends `--dangerously-bypass-approvals-and-sandbox`.

 Networking clarification (from codex_search):
- Approval mode controls autonomy only (propose vs edit vs run); it does not enable internet for shell commands.
 - Web Search is a model/tool capability (enable via `-c tools.web_search=true` or TOML) and functions regardless of approval mode.

## Tool Parameters (proposed schema)
```json
{
  "task": "string (required)",
  "model": "string (optional, default: gpt-5)",
  "profile": "string (optional, select config profile)",
  "reasoning_effort": "minimal|low|medium|high (optional, default: medium)",
  "verbosity": "low|medium|high (optional)",
  "edit_mode": "research|auto_edit|full_auto|dangerous (optional, default: research)",
  "files_glob": "string (optional, e.g. \"src/**/*.ts tests/**/*.ts\")",
  "images": ["paths"],
  "enable_web_search": "boolean (optional, default: false)",
  "save_to_file": "boolean (default: true)",
  "display_in_chat": "boolean (default: true)",
  "timeout_sec": "number (optional, default: 900)"
}
```

Note: We will not expose `previous_response_id` at first; include in Future Enhancements if Codex adds stable session resume for `exec`.

## CLI Invocation Template
```
 codex exec \
  ${MODEL} \
  ${PROFILE} \
  ${REASONING} \
  ${VERBOSITY_OVERRIDE} \
  ${IMAGES} \
  ${WEB_SEARCH} \
  ${APPROVAL_MODE} \
  ${DANGEROUS_BYPASS} \
  --json --quiet \
  "${TASK_PROMPT}"
```
Where we map:
 - MODEL: `--model <id>` when provided.
 - PROFILE: `--profile <name>` when provided (loads provider defaults from TOML).
 - REASONING: best‑effort via `-c model_reasoning_effort=<low|medium|high>` (map `minimal`→`low`).
 - VERBOSITY_OVERRIDE: `-c text.verbosity=<…>` if provided.
 - FILES: not supported as a flag; we inline file contents into the prompt string on our side.
 - IMAGES: `-i path1 -i path2`.
- WEB_SEARCH: if `enable_web_search=true`, add `--search`.
 - APPROVAL_MODE: from `edit_mode` mapping above.
 - DANGEROUS_BYPASS: add only for `dangerous` or when `bypass_sandbox=true`.

## Output Handling & File Saving
- Prefer `--json` to capture structured stream; collect final assistant message (or concatenate message parts) into a single output string.
- Fallback: if `--json` not available or parsing fails, capture stdout and trim.
- Save behavior mirrors `gpt5_agent`:
  - Folder: `gpt5_docs/` (auto-created).
  - Name: `agent_YYYYMMDD_HHMMSS_task-slug.md`.
  - Content: Title + full output + execution metadata (model, reasoning, timing, tokens if available, edit_mode summary).
- Respect `save_to_file` and `display_in_chat`:
  - If `save_to_file=true && display_in_chat=true`: return full content plus “Saved to: …”.
  - If `save_to_file=true && display_in_chat=false`: return metadata + file path only (token-saver mode).
  - If `save_to_file=false`: return content only (no file).

JSON event parsing specifics (Codex CLI v0.31.0):
- Parse JSONL from stdout; collect assistant content events and the final synthesized message. Concatenate chunks in order.
- Extract lightweight execution summary: number of edits applied, commands executed, and any “web_search” steps if surfaced in events.
 - If `enable_web_search=true` but no search/browse events appear, append a note: “Web Search did not execute; ensure `--search` is enabled and your environment/account allows model-side web access (or configure an MCP Web server).”
 - Optional: support `--output-last-message <file>` to capture the final assistant message directly (in addition to JSONL parsing) for resilience.

## Error Handling
- Detect missing `codex` binary (PATH) and return clear error with install hint.
- Non-zero exit: collect stderr and exit code; include in tool error.
- Timeouts: optional `timeout` param to kill the process and return timeout error.
 - JSON parsing errors: degrade to plain stdout with a warning.
 - Permission mode safety: never pass `--dangerously-bypass-approvals-and-sandbox` unless `edit_mode=dangerous` or explicit flag.
 - Handle process timeouts via `timeout_sec`.

## Security & Safety
- Default `edit_mode` is `research` (no edits), minimizing risk.
- Require explicit user intent for `dangerous` mode; surface a conspicuous warning in output metadata.
- Do not mutate `~/.codex/config.toml`; assume provider/tools configured by user.
 - Make it explicit that `enable_web_search` uses the model-side web tool and does not grant shell/network access; shell networking remains off locally unless user opts into dangerous bypass or runs in cloud with network enabled.

## Limitations
- No guaranteed web search unless Codex has an MCP web tool configured in its config.
- No direct control over max iterations; rely on Codex agent loop.
- Continuations (`previous_response_id`) not supported with headless `exec`.
- Token usage may not be consistently available via CLI; include when present in JSON stream or logs, else omit.
 - Internet/web search runs via model tool when `--search` is enabled; does not imply shell network access.

## Implementation Steps
1. Add new tool file: `src/tools/built-in/gpt5-codex.ts`.
   - Define schema (parameters above) and description.
2. Build arg mapper:
   - Map `edit_mode` → approval and sandbox flags.
   - Compose CLI args: model, profile, reasoning (`-c model_reasoning_effort`), images, verbosity override.
   - Read and inline text files (respect size limits) into the prompt string; attach images with `-i`.
   - If `enable_web_search=true`, add `-c tools.web_search=true`.
3. Spawn process:
   - Use `child_process.spawn` with `codex` and arguments; set `--json --quiet`.
   - Stream stdout; parse JSON lines to accumulate final assistant text.
   - Capture stderr for diagnostics.
4. Output assembly:
   - Construct final result string.
   - Gather metadata (model, edit_mode, duration, exit code; tokens if provided in events).
5. File save (if requested):
   - Mirror `gpt5_agent` naming and footer metadata; write into `gpt5_docs/`.
   - Respect `display_in_chat` flag.
6. Register tool:
   - Export from `src/tools/index.ts`; add to `ACTIVE_TOOLS` (default: enabled = true or staged false based on preference).
7. Documentation:
   - Update `README.md` with usage examples, permission modes, and requirements (Codex install, config, MCP web tool for search).
8. Validation:
   - Smoke test in `research` mode with a small task and `--files` glob.
   - Test `auto_edit` in a throwaway folder to confirm edits apply.
   - Validate `enable_web_search` with `--search` and (optionally) persistent TOML.

## Web Search Clarification
- `enable_web_search: true` behavior:
  - Add `-c tools.web_search=true` to enable model-side search in exec.
  - Optional persistent alternative: enable `~/.codex/config.toml` -> `[tools] web_search = true`.
  - Works under any approval policy; unrelated to shell networking.
  - Do not use `--search` in exec mode (ineffective).
  - Known benign log: `WARN ... WebSearchCall ... with response: None` may appear during searches.

## Usage Examples
- Research-only, attach codebase context:
```bash
codex -a untrusted -s read-only exec -c model_reasoning_effort=high --json \
  "Audit the tool registry for concurrency issues (I have inlined key files/context)"
```
- Auto-edit (safe), Azure provider:
```bash
codex exec -m my_gpt5_deploy \
  -c model_reasoning_effort=medium -a untrusted -s workspace-write --json --quiet \
  "Refactor the image tool to stream progress and add retry logic"
```
- Full auto with dangerous bypass (only in CI/trusted env):
```bash
codex exec --full-auto --dangerously-bypass-approvals-and-sandbox \
  --json --quiet "Upgrade dependencies and fix breaking changes"
```
 - Research + Web Search (CLI supports `--search`):
 ```bash
 codex exec --search -c model_reasoning_effort=medium -a untrusted -s read-only --json --quiet \
   "Find the latest RN 0.76 migration guide and summarize risks"
 ```
 - Research + Web Search (preferred flag via config):
 ```bash
 codex -c tools.web_search=true -a untrusted -s read-only exec \
   -c model_reasoning_effort=low \
   --output-last-message /tmp/last.txt \
   "Use web search to summarize the iPhone Air announcement (2025-09-09). Output plain text."
 cat /tmp/last.txt
 ```
 - Research + Web Search (fallback via TOML):
 ```toml
 # ~/.codex/config.toml
 [tools]
 web_search = true
 ```
 ```bash
 codex exec --reasoning medium -a suggest --json --quiet \
   "Find the latest RN 0.76 migration guide and summarize risks"
 ```

## Future Enhancements
- Session resume if Codex adds a stable flag (continue iterations).
- Structured extraction of token usage from JSON stream and session logs.
- Auto-detect configured MCP tools (web search) and surface availability in metadata.
- Optional `--json` passthrough mode to return raw event stream when needed by downstream tooling.
 - Attach session log path from `$CODEX_HOME/sessions/...` when available.
