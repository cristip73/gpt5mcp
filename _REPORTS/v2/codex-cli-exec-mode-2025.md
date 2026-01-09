Codex CLI exec mode (2025): concise best‑practices summary

1) Key exec mode flags
- Core exec usage: `codex exec <prompt>` runs the prompt non‑interactively and prints the final answer. The exec stream is sent to stderr, while the final response is on stdout. citeturn8view2
- Output control: `--output-format json` returns JSON‑lines; `--output-schema <file>` enforces a JSON schema for the response; `--output-last-message` prints the final assistant message only. citeturn5view0turn7view0
- Model/profile: `-m/--model` selects the model; `-p/--profile` loads a profile from config; `-c/--config` overrides config values. citeturn5view0
- Autonomy & approvals: `--full-auto` sets workspace‑write sandboxing and approval mode “on‑failure”; `--ask-for-approval` (or `-y` for “never”) controls how the CLI asks for approvals. citeturn5view0
- Workspace & context: `-C/--cd` changes working directory; `--add-dir` extends the accessible filesystem; `--skip-git-repo-check` bypasses the “must be a git repo” check. citeturn5view0
- Search: `--search` allows web search during execution (if enabled in your environment). citeturn5view0
- Iteration: `codex resume` restarts from a previous conversation. citeturn5view0

2) Recommended configurations
- Prefer read‑only by default for non‑interactive runs; exec defaults to read‑only to keep runs safe and reproducible. citeturn8view2
- Use `--full-auto` only when edits are required and you can tolerate automated writes; it deliberately widens permissions (workspace‑write). citeturn5view0
- For CI/pipelines, use `--output-format json` (optionally with `--output-schema`) so downstream tooling can parse deterministic output. citeturn5view0
- When running in monorepos or multi‑root setups, use `-C` and `--add-dir` to explicitly scope the working tree rather than widening the sandbox globally. citeturn5view0
- Use profiles (`-p`) and config overrides (`-c`) to standardize org‑wide defaults (model, approval style, environment) across non‑interactive invocations. citeturn5view0

3) Common pitfalls to avoid
- Assuming exec will edit files by default: it is read‑only unless you grant write access (e.g., `--full-auto`). citeturn8view2turn5view0
- Forgetting output separation: the live exec stream goes to stderr; only the final response is on stdout, so piping stdout alone can miss intermediate logs. citeturn8view2
- Using `--skip-git-repo-check` casually: you lose the guardrail that ensures the tool has a clear project root. citeturn5view0
- Relying on interactive approvals in exec mode: in automated contexts you should set `--ask-for-approval` explicitly to avoid unexpected prompts. citeturn5view0
- Expecting structured output without the JSON flags: without `--output-format json` and (if needed) `--output-schema`, parsing output is brittle. citeturn5view0

