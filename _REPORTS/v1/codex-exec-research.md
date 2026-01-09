## 🤖 GPT-5 Codex Task Completed

**Task**: Research the latest best practices for Codex CLI exec mode in 2025.

Search the web for:
- Codex CLI exec mode documentation
- Best practices for non-interactive Codex usage
- Common flags and configurations

Write a concise summary (max 500 words) with:
1. Key exec mode flags
2. Recommended configurations
3. Common pitfalls to avoid

Save your findings to the output file.
**Model**: gpt-5.1-codex-max
**Mode**: auto_edit
**Execution Time**: 93.5s

### 📝 Result
Here’s the concise 500‑word summary, plus the saved file path.

1) Key exec mode flags  
- `codex exec` (alias `codex e`) is the non‑interactive command; progress streams to stderr and the final assistant output goes to stdout. citeturn1view0turn2view0  
- Automation/output: `--json` (JSONL event stream), `--output-last-message/-o` (write final message to a file), and `--output-schema <path>` (force structured JSON output). citeturn1view0turn2view1turn2view3  
- Workspace control: `--cd/-C` to set workspace root, `--skip-git-repo-check` to bypass the default Git repo requirement. citeturn2view3turn1view0  
- Autonomy & safety: `--sandbox` (read-only | workspace-write | danger-full-access), `--ask-for-approval` (untrusted | on-failure | on-request | never), and `--full-auto` (preset for workspace-write + on-failure). citeturn2view5turn2view8  
- Scope & feature toggles: `--add-dir` for extra writable paths, `--search` to enable web search, `--enable/--disable` for feature flags. citeturn2view9turn4view0  
- Config plumbing: `--profile` for named config profiles and `-c/--config key=value` overrides. citeturn2view5turn2view0turn4view0  

2) Recommended configurations  
- Start least‑privileged: `codex exec` defaults to read‑only, so elevate only if the task truly needs edits or network access. citeturn1view0  
- For unattended local runs, prefer `--full-auto` (workspace-write + approvals on-failure) over full access; it balances autonomy with guardrails. citeturn2view5turn2view8  
- For tighter control in scripts, use `--sandbox read-only --ask-for-approval never` for analysis-only jobs or `--sandbox workspace-write --ask-for-approval untrusted` for edits with gated commands. citeturn3view0  
- In CI, use `--json` for machine‑readable streams and `--output-last-message` or `--output-schema` for deterministic artifacts. citeturn1view0turn2view1turn2view3  
- Standardize environments with `~/.codex/config.toml` profiles; override per run with `-c` when needed. citeturn4view0turn2view0  

3) Common pitfalls to avoid  
- Avoid `--dangerously-bypass-approvals-and-sandbox` / `--yolo` unless you’re inside a hardened, isolated runner. citeturn2view5turn3view0  
- Don’t assume exec can edit or use the network by default; it starts read‑only. citeturn1view0  
- Skipping Git checks (`--skip-git-repo-check`) removes a safety net; use only in controlled, disposable directories. citeturn1view0turn2view3  
- Pipelines can break if you forget progress is on stderr; capture stdout for results and stderr for live logs. citeturn1view0  
- Over‑broad permissions: use `--add-dir` for specific extra paths rather than `danger-full-access`. citeturn2view9turn2view5  

Saved to `codex_cli_exec_mode_best_practices_2025.md`.

*Generated: 2025-12-20T00:36:45.358Z*