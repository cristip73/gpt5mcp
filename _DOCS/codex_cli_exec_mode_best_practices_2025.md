Codex CLI exec mode best practices (latest docs, Dec 2025)

1) Key exec mode flags
- `codex exec` (alias `codex e`) runs non-interactively; progress streams to stderr while the final assistant message goes to stdout. This is the core behavior for scripting. citeturn1view0turn2view0
- Output/automation: `--json` for JSONL event streams, `--output-last-message/-o` to write the final message to a file, and `--output-schema <path>` to enforce structured JSON output. citeturn1view0turn2view1turn2view3
- Workspace control: `--cd/-C` sets the workspace root, and `--skip-git-repo-check` bypasses the default Git-repo requirement (use sparingly). citeturn2view3turn1view0
- Autonomy & safety: `--sandbox` (read-only | workspace-write | danger-full-access), `--ask-for-approval` (untrusted | on-failure | on-request | never), and `--full-auto` (preset for workspace-write + on-failure). citeturn2view5turn2view8
- Scope & features: `--add-dir` to grant extra write roots, `--search` to allow web search, and `--enable`/`--disable` to toggle feature flags. citeturn2view9turn4view0
- Config plumbing: `--profile` to load a named config profile and `-c/--config key=value` for one-off overrides. citeturn2view5turn2view0turn4view0

2) Recommended configurations
- Start least-privileged: `codex exec` defaults to read-only (no edits or network). Only elevate permissions when your task requires it. citeturn1view0
- For unattended local runs, prefer `--full-auto` (workspace-write + approvals on-failure) rather than full access; it balances autonomy with guardrails. citeturn2view5turn2view8
- For stricter control in scripts, pair `--sandbox read-only` with `--ask-for-approval never` for analysis-only jobs, or `--sandbox workspace-write --ask-for-approval untrusted` for edits with gated command execution. citeturn3view0
- In CI, use `--json` for machine-readable streams and `--output-last-message` (or `--output-schema`) for deterministic artifacts. citeturn1view0turn2view1turn2view3
- Use profiles in `~/.codex/config.toml` to standardize models, reasoning depth, and safety defaults across environments; override per-run with `-c`. citeturn4view0turn2view0

3) Common pitfalls to avoid
- Avoid `--dangerously-bypass-approvals-and-sandbox` / `--yolo` unless you are inside a hardened, isolated runner. citeturn2view5turn3view0
- Don’t assume exec can edit or use the network by default; it starts read-only, so missing permissions is a common source of “no-op” runs. citeturn1view0
- Skipping the Git repo check (`--skip-git-repo-check`) removes a safety net; only do this in controlled, disposable directories. citeturn1view0turn2view3
- Forgetting that progress logs are on stderr can break pipelines; capture stdout for results and stderr for live status. citeturn1view0
- Expanding scope too broadly: grant extra write paths with `--add-dir` rather than flipping to `danger-full-access`. citeturn2view9turn2view5
