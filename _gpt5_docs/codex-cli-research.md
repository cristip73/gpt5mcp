# Task:
Research how to properly call Codex CLI programmatically, especially in exec mode.

I need to verify:
1. What are the correct CLI flags for Codex exec mode?
2. How to enable web search - is it `--search` or `--enable web_search_request`?
3. How to set reasoning effort - is `-c model_reasoning_effort=high` correct?
4. How to set verbosity - is `-c text.verbosity=high` correct?
5. Are there any official examples of calling Codex from MCP or programmatically?

Search for:
- Codex CLI documentation
- Codex exec mode examples
- Codex MCP integration
- GitHub openai/codex repository docs

Focus on the official OpenAI Codex CLI (the new one, not the old Codex API).

## Full Output
Here’s what the *official* Codex docs and repo say for the new Codex CLI.

---

## 1. Correct CLI flags for `codex exec` (non‑interactive / “exec mode”)

The `exec` subcommand reuses the **global flags** plus some **exec‑specific** ones. The canonical form is:

```bash
codex exec [GLOBAL FLAGS] [EXEC FLAGS] "your task"
# or with stdin:
echo "your task" | codex exec -
```

### Global flags that also work with `exec`

From the CLI reference, these apply to `codex` and all subcommands, including `exec`: ([developers.openai.com](https://developers.openai.com/codex/cli/reference))  

- `--model, -m <string>` – override model (e.g. `gpt-5-codex`).
- `--oss` – use local OSS provider (Ollama).
- `--profile, -p <name>` – load a profile from `~/.codex/config.toml`.
- `--sandbox, -s {read-only|workspace-write|danger-full-access}` – sandbox policy.
- `--ask-for-approval, -a {untrusted|on-failure|on-request|never}` – approval behavior.
- `--full-auto` – preset: `--ask-for-approval on-failure` + `--sandbox workspace-write`.
- `--dangerously-bypass-approvals-and-sandbox`, `--yolo` – no approvals, no sandbox (dangerous).
- `--cd, -C <path>` – working directory for the agent.
- `--search` – enable web search (more on this below).
- `--add-dir <path>` – extra writable directories (repeatable).
- `--enable <feature>` / `--disable <feature>` – flip feature flags (e.g. `web_search_request`).
- `--config, -c key=value` – inline config override (values parsed as JSON when possible).

### Exec‑specific flags

From the `codex exec` section of the same reference: ([developers.openai.com](https://developers.openai.com/codex/cli/reference))  

- `PROMPT` – either a string or `-` to read from stdin.
- `--image, -i <path[,path...]>` – attach images to first message.
- `--skip-git-repo-check` – allow running outside a git repo.
- `--output-schema <path>` – JSON Schema for structured final output.
- `--color {always|never|auto}` – terminal color.
- `--json` / `--experimental-json` – emit newline‑delimited JSON events (JSONL).
- `--output-last-message, -o <path>` – save the final assistant message to a file.
- `-c, --config key=value` – exec‑scoped config overrides (repeatable).
- `codex exec resume [SESSION_ID] [PROMPT]` – resume a prior exec session; `--last` to resume most recent.

So if you’re scripting, something like:

```bash
codex exec \
  --search \
  --full-auto \
  --sandbox workspace-write \
  -c model_reasoning_effort="high" \
  -c model_verbosity="high" \
  "Summarize the architecture of this repo"
```

is fully aligned with the docs.

---

## 2. Enabling web search: `--search` vs `--enable web_search_request`

There are **two layers** that matter:

1. **CLI web search flag**

   Global option:

   ```bash
   codex exec --search "task..."
   ```

   The reference describes `--search` as:

   > Enable web search. When true, the agent can call the `web_search` tool without asking every time. ([developers.openai.com](https://developers.openai.com/codex/cli/reference))  

   This is the *main, user‑facing* flag to turn web search on for a run (including `exec`).

2. **Feature flag: `web_search_request`**

   In `config.toml` under `[features]` you can set: ([developers.openai.com](https://developers.openai.com/codex/local-config))  

   ```toml
   [features]
   web_search_request = true  # allow the model to issue web searches
   ```

   Or one‑shot from the CLI:

   ```bash
   codex exec --enable web_search_request "task..."
   ```

   The docs list `web_search_request` as a stable feature that “Allow[s] the model to issue web searches.” ([developers.openai.com](https://developers.openai.com/codex/local-config))  

**How they relate:**

- `--search` is the high‑level, recommended switch to give Codex web access for that session.
- `web_search_request` is the lower‑level feature toggle used in config / `--enable`.

In practice:

- **For a one‑off exec run:** use `--search`.
- **For a persistent setting:** set `[features].web_search_request = true` in `config.toml`, then optionally still use `--search` if you want “search always on” semantics for ad‑hoc runs.

So to answer your literal question:

- `--search` is the correct *flag* for enabling web search.
- `--enable web_search_request` is also valid but operates at the feature‑flag level; you’d usually touch it in config rather than per command.

---

## 3. Reasoning effort: is `-c model_reasoning_effort=high` correct?

Yes, that’s the right **config key**; the officially documented pattern is:

- In `config.toml`: ([developers.openai.com](https://developers.openai.com/codex/local-config))  

  ```toml
  model_reasoning_effort = "high"
  ```

- From CLI (applies to `codex` *and* `codex exec`):

  ```bash
  codex exec -c model_reasoning_effort="high" "task..."
  # or
  codex exec --config model_reasoning_effort="high" "task..."
  ```

Supported values for `model_reasoning_effort` mirror the OpenAI Responses API (e.g. `minimal`, `low`, `medium`, `high`); some community tools also use `xhigh` for newer models, but the official Codex docs explicitly show `"high"` as a typical setting. ([developers.openai.com](https://developers.openai.com/codex/local-config?utm_source=openai))  

So your syntax is conceptually correct; I’d just recommend quoting the string to be safe:

```bash
codex exec -c model_reasoning_effort="high" ...
```

---

## 4. Verbosity: is `-c text.verbosity=high` correct?

No — that’s mixing the **wire‑format field** (`text.verbosity` in the Responses API) with the **Codex config key**.

In Codex, the relevant setting is:

- Config key: `model_verbosity`  
- Example from official config docs: ([developers.openai.com](https://developers.openai.com/codex/local-config))  

  ```toml
  model_reasoning_summary = "none"          # disable summaries
  model_verbosity = "low"                   # shorten responses on Responses API providers
  model_supports_reasoning_summaries = true # ...
  ```

So you should use:

```bash
codex exec -c model_verbosity="high" "task..."
```

**Not** `text.verbosity`.

Under the hood, Codex translates `model_verbosity` into the appropriate `text: { verbosity: ... }` field on Responses‑API requests, but the CLI and `config.toml` never use `text.verbosity` as a key themselves. ([developers.openai.com](https://developers.openai.com/codex/local-config?utm_source=openai))  

As with reasoning effort, supported values are `low`, `medium`, `high` (default is effectively “medium” when unset).

---

## 5. Official examples of calling Codex programmatically / via MCP

Yes, there are several **official** examples:

### a) Codex SDK (TypeScript)

The Codex SDK docs show using Codex directly from TypeScript/Node: ([developers.openai.com](https://developers.openai.com/codex/sdk/))  

```ts
import { Codex } from "@openai/codex-sdk";

const codex = new Codex();
const thread = codex.startThread();

const result = await thread.run(
  "Make a plan to diagnose and fix the CI failures"
);
console.log(result);

// Continue same thread
const result2 = await thread.run("Implement the plan");
```

This is the primary “programmatic” interface beyond the CLI.

### b) Using `codex exec` programmatically

The same SDK page has a dedicated “Using Codex CLI programmatically” section, which recommends `codex exec` for non‑interactive automation: ([developers.openai.com](https://developers.openai.com/codex/sdk/))  

- Basic:

  ```bash
  codex exec "find any remaining TODOs and create a plan..."
  ```

- JSON event stream:

  ```bash
  codex exec --json "summarize the repo structure" | jq
  ```

- Structured output with `--output-schema`:

  ```bash
  codex exec "Extract project metadata" \
    --output-schema ./schema.json \
    -o ./project-metadata.json
  ```

This is exactly the officially recommended way to call Codex from CI, scripts, etc.

### c) Codex as an MCP server (for Agents / other MCP clients)

The **MCP configuration** page documents running Codex itself as an MCP server: ([developers.openai.com](https://developers.openai.com/codex/mcp))  

```bash
codex mcp-server
# or via MCP Inspector:
npx @modelcontextprotocol/inspector codex mcp-server
```

It exposes two tools:

- `codex` – start a Codex session (`prompt`, `model`, `sandbox`, `config`, etc.).
- `codex-reply` – continue a session (`conversationId`, `prompt`). ([developers.openai.com](https://developers.openai.com/codex/mcp))  

These tools are then consumable by any MCP‑aware client (including your own agents).

### d) Agents SDK + Codex MCP guide (multi‑agent workflows)

The “Use Codex with the Agents SDK” guide walks through using Codex CLI as an MCP server orchestrated by the OpenAI Agents SDK: ([developers.openai.com](https://developers.openai.com/codex/guides/agents-sdk))  

Minimal example of starting Codex MCP from Python:

```py
from agents import Agent, Runner
from agents.mcp import MCPServerStdio

async with MCPServerStdio(
    name="Codex CLI",
    params={"command": "npx", "args": ["-y", "codex", "mcp"]},
    client_session_timeout_seconds=360000,
) as codex_mcp_server:
    # use codex_mcp_server in Agent.mcp_servers
```

Then agents call Codex via MCP (`codex` / `codex-reply` tools) as part of a larger workflow.

### e) GitHub repo docs

The official `openai/codex` repo has an **“Automating Codex”** section linking to:

- `docs/exec.md` – non‑interactive mode (`codex exec`).
- A GitHub Action for running Codex in CI.
- Links back into the Codex SDK and CLI docs. ([github.com](https://github.com/openai/codex))  

These are all maintained by OpenAI and kept in sync with the published Codex docs.

---

### TL;DR for your specific questions

1. **Correct flags for exec mode:** use `codex exec` with global flags (`--model`, `--sandbox`, `--profile`, `--search`, `--enable`, `-c key=value`, etc.) plus exec‑specific flags (`--skip-git-repo-check`, `--output-schema`, `--json`, `-o`, etc.). ([developers.openai.com](https://developers.openai.com/codex/cli/reference))  
2. **Web search:** use `--search` for a run; optionally back it with `[features].web_search_request = true` or `--enable web_search_request`. ([developers.openai.com](https://developers.openai.com/codex/cli/reference))  
3. **Reasoning effort:** `-c model_reasoning_effort="high"` (or set `model_reasoning_effort = "high"` in `config.toml`) is correct. ([developers.openai.com](https://developers.openai.com/codex/local-config))  
4. **Verbosity:** use `-c model_verbosity="high"` (or `model_verbosity = "high"` in config). `text.verbosity` is not a Codex config key. ([developers.openai.com](https://developers.openai.com/codex/local-config))  
5. **Official programmatic/MCP examples:** yes – Codex SDK (TypeScript), CLI `exec` docs, Codex MCP server docs, and the “Use Codex with the Agents SDK” guide all show official patterns for programmatic and MCP-based use. ([developers.openai.com](https://developers.openai.com/codex/sdk/))  

If you tell me the exact invocation you plan to use (flags + environment), I can sanity‑check it against these docs line‑by‑line.

---
*Generated: 2025-12-20T00:27:09.923Z | Response ID: resp_075fa3652203c526006945ecc6a2788191a83848ec974a3e78 | Model: gpt-5.1 | Time: 152.2s | Iterations: 1 | Input: 51.7k | Output: 6.4k | Reasoning: 3.5k*