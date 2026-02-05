# GPT5 Tool Model Inventory (as of 2025-12-16)

## gpt5_codex tool
- File: src/tools/built-in/gpt5-codex.ts
- Default model: `gpt-5.2-codex-max` (parameter default at line ~247).
- Model options exposed via docs/parameter description (line ~53):
  - `gpt-5.2-codex-max` (default)
  - `gpt-5.2`
  - `gpt-5.1-codex`
  - `gpt-5.1-codex-mini`
  - `o3`
  - `o4-mini`
- Implementation accepts any string for `model` (no runtime validation beyond optional presence), but the above list is the intended set surfaced in the description and help text.

## gpt5_agent tool
- File: src/tools/built-in/gpt5-agent.ts
- Default model: `gpt-5.1` (parameter default at line ~113 and runtime default at line ~582).
- Allowed models (enum-enforced in parameter schema at line ~113):
  - `gpt-5`
  - `gpt-5.1`
  - `gpt-5.2` (default)
  - `gpt-5-mini`
  - `gpt-5-nano`
  - `gpt-5.1-chat-latest` (non-reasoning; verbosity forced to `medium`).
- The tool sends the selected `model` directly to the Responses API; only the enum limits the allowed values.

## Notes
- No additional model lists or overrides are defined elsewhere in `src/tools`.
- Both tools pass the `model` string straight through to their respective backends (Codex CLI or Responses API); changing available models requires updating the parameter descriptions/enums.
