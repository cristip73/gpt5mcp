Here’s a concise “API-style controls” cheat-sheet for **Codex CLI**—what you can tune via args and config, with quick examples.

# Model & reasoning

* **Model**: `-m, --model <id>`

  * Example: `codex --model gpt-5 "Explain the router setup"`
  * (You can also set it in `~/.codex/config.toml`.) ([OpenAI Developers][1])
* **Reasoning effort** (API’s `reasoning.effort`): `--reasoning <low|medium|high>`

  * Example: `codex --reasoning high "Refactor auth middleware"`
  * Persistent config:

    ````toml
    model = "gpt-5"
    model_reasoning_effort = "high"
    ``` :contentReference[oaicite:1]{index=1}
    ````
  * (Some releases add a `minimal` level—treat as version-dependent.) ([GitHub][2])
* **Other reasoning toggles** (advanced): ephemeral overrides with `-c key=value`, e.g.
  `codex -c model=o4-mini -c model_reasoning_summary=none ...` (maps to API request options). ([GitHub][3])

# Non-interactive / verbosity

* **Headless execution**: `codex exec "…"` (no TUI). ([OpenAI Developers][1])
* **Quiet / machine-readable**:

  * `--quiet, -q` disables the TUI;
  * `--json` outputs a stream you can parse in CI.
    Examples:
    `codex -q "explain this project"`
    `codex exec --json "run tests and fix failures"` ([GitHub][4])
* **Verbose logging**: `--verbose` and/or `RUST_LOG=debug|trace` env var.
  Example: `RUST_LOG=trace codex --oss` ([GitHub][5])

# Approvals & sandbox (agent autonomy)

* **Approval mode**: `-a, --approval-mode <suggest|auto-edit|full-auto>`
  Example: `codex -a auto-edit "upgrade Prisma and fix breakages"` ([GitHub][6])
* **Bypass everything (dangerous)**:
  `--dangerously-bypass-approvals-and-sandbox` (use only in trusted repos/CI). ([GitHub][3])
* Conceptually maps to “Read-only / Auto / Full access” from docs. ([OpenAI Developers][1])

# Files, context & attachments

* **Attach specific files/globs as context**: `--files "<glob1> <glob2> …"`
  Example:
  `codex exec --files "src/**/*.ts tests/**/*.ts" "fix failing tests"` ([GitHub][7])
* **Attach images** (errors, diagrams): `-i path` or `--image img1.png,img2.jpg`
  Example: `codex -i screenshot.png "Explain the stacktrace"` ([OpenAI Developers][1])
* **Mention files in TUI**: type `@` then a filename to reference; handy when not using `exec`. ([GitHub][8])

# Providers (API/backends)

* **Select provider** (OpenAI default; others supported): `--provider <openai|azure|…>`
  Example: `codex --provider azure --model my-deployment "migrate to .NET 9"`
  (On Azure, the “model” is your **deployment name**, not the base model ID.) ([GitHub][5])
* **Open-source/local** (OSS/Ollama): `--oss` to target local models. ([GitHub][9])

# Web search / browsing

* **Local CLI**: no stable `--web-search` flag. Use an **MCP server** that gives Codex a web tool (e.g., Bright Data’s Web MCP) or enable the built-in web tool via config when your version supports it.

  * MCP route (recommended & stable): configure an MCP “web” server in `~/.codex/config.toml`. ([Bright Data][10])
  * Config key (version-dependent):

    ```toml
    [tools]
    web_search = true
    ```

    (Works in TUI and `exec` per recent updates; CLI flag `--search` is **not** recognized in all builds.) ([GitHub][11])
* **Cloud tasks**: Internet access is controlled per environment (off by default; you can enable it). This is separate from the local CLI. ([OpenAI Developers][12])

# Useful odds & ends

* **Session/log output for CI**: `exec --json` prints events; full JSONL logs are written under
  `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl`. ([GitHub][13])

---

## Handy one-liners

* High-reasoning, auto-edit, headless, with files:

````bash
codex exec --reasoning high -a auto-edit \
  --files "src/**/*.ts tests/**/*.ts" \
  "Fix flaky E2E tests and commit"
``` :contentReference[oaicite:19]{index=19}
- Quiet + JSON for CI parsing:
```bash
codex exec --quiet --json "Run unit tests and fix failures"
``` :contentReference[oaicite:20]{index=20}
- Azure provider with deployment-name model:
```bash
codex --provider azure --model my_gpt5_deploy "Add healthcheck to API"
``` :contentReference[oaicite:21]{index=21}

If you want, I can spit out a minimal `~/.codex/config.toml` tailored to your stack (model, reasoning, approvals, MCP web tool) so you can just drop it in and go.
::contentReference[oaicite:22]{index=22}
````

[1]: https://developers.openai.com/codex/cli/ "Codex CLI"
[2]: https://github.com/openai/codex/issues/2296?utm_source=chatgpt.com "Add \"minimal\" reasoning effort for GPT 5 models #2296"
[3]: https://github.com/openai/codex/issues/2510?utm_source=chatgpt.com "`model_reasoning_summary=none` no longer works (400 ..."
[4]: https://github.com/openai/codex/issues/585?utm_source=chatgpt.com "bug: quiet mode still printing json formatted text to terminal · ..."
[5]: https://github.com/openai/codex/issues/1332?utm_source=chatgpt.com "401 Unauthorized from v0.dev API when using Codex CLI"
[6]: https://github.com/openai/codex/issues/950?utm_source=chatgpt.com "history doesn't work in headless mode #950 - openai/codex"
[7]: https://github.com/openai/codex/issues/690?utm_source=chatgpt.com "Codex CLI exits abruptly on `rate_limit_exceeded`; should ..."
[8]: https://github.com/openai/codex/issues/2867?utm_source=chatgpt.com "When using @ to mention files, it should default to showing ..."
[9]: https://github.com/openai/codex/issues/2248?utm_source=chatgpt.com "Messages are not written to codex-tui.log if Codex exits too ..."
[10]: https://brightdata.com/blog/ai/codex-cli-with-web-mcp?utm_source=chatgpt.com "OpenAI Codex CLI with the Bright Data Web MCP Server"
[11]: https://github.com/openai/codex/issues/2760?utm_source=chatgpt.com "Updated Keys · Issue #2760 · openai/codex - Config.toml"
[12]: https://developers.openai.com/codex/cloud/internet-access/?utm_source=chatgpt.com "Agent internet access"
[13]: https://github.com/openai/codex/issues/1673?utm_source=chatgpt.com "Provide JSON Schema for --json flag output · Issue #1673"
