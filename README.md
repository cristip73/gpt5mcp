# GPT-5 MCP Server

A Model Context Protocol (MCP) server providing access to OpenAI's GPT-5 API with SSE streaming and tool orchestration. Built for Claude Code.

## Quick Setup

```bash
npm install
npm run build
```

Configure `.env`:
```
OPENAI_API_KEY=sk-...
CODEX_BIN=/opt/homebrew/bin/codex  # Optional, for gpt5_codex
```

Add to Claude Code:
```bash
claude mcp add gpt5-server -e OPENAI_API_KEY=sk-... -- node /path/to/build/index.js
```

## Active Tools

### GPT-5 Agent (`gpt5_agent`)

Autonomous agent with SSE streaming that solves complex multi-step tasks. Supports tool orchestration, web search, code interpreter, and file operations.

**Key Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `task` | required | Task description |
| `model` | `gpt-5.2` | Model: `gpt-5.2`, `gpt-5.1`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano` |
| `reasoning_effort` | `medium` | `none`, `minimal`, `low`, `medium`, `high` |
| `verbosity` | `medium` | `low`, `medium`, `high` |
| `max_iterations` | 10 | Max agent loops (1-20) |
| `enable_web_search` | true | Enable web search |
| `enable_code_interpreter` | false | Enable code execution |
| `enable_file_operations` | false | Enable file read/write |
| `save_to_file` | true | Save output to `gpt5_docs/` |
| `previous_response_id` | - | Continue previous conversation |

**Examples:**
```json
{
  "task": "Research the latest AI developments in 2026",
  "reasoning_effort": "high",
  "enable_web_search": true
}
```

```json
{
  "task": "Analyze this Python code for performance issues",
  "file_path": "/path/to/code.py",
  "enable_code_interpreter": true
}
```

### GPT-5 Codex (`gpt5_codex`)

Deep code analysis via Codex CLI. Spawns `codex` binary for autonomous code editing.

**Key Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `prompt` | required | Task for Codex |
| `model` | `gpt-5.2-codex` | Model: `gpt-5.2-codex`, `gpt-5.1-codex`, `o3`, `o4-mini` |
| `reasoning` | `medium` | `low`, `medium`, `high`, `extra_high` |
| `edit_mode` | `auto_edit` | `research`, `auto_edit`, `full_auto`, `dangerous` |
| `file_path` | - | Single file input (100KB max) |
| `files` | - | Multiple files (200KB total) |
| `output_format` | `standard` | `standard` (with metadata) or `clean` |

**Edit Modes:**
- `research` - Read-only analysis, no file changes
- `auto_edit` - Prompts before each edit
- `full_auto` - Auto-applies safe edits
- `dangerous` - No restrictions (use with caution)

**Example:**
```json
{
  "prompt": "Refactor this module to use async/await",
  "file_path": "/path/to/module.ts",
  "reasoning": "high",
  "edit_mode": "auto_edit"
}
```

## Inactive Tools

Disabled by default for performance. Enable in `src/tools/index.ts`:

| Tool | Description |
|------|-------------|
| `web_search` | Web search via OpenAI Responses API |
| `file_operations` | File read/write/delete |
| `code_interpreter` | Execute Python/JavaScript |
| `image_generation` | DALL-E 3 / GPT-Image-1 |
| `function_definition` | Define custom reusable functions |

**To enable:**
```typescript
// src/tools/index.ts
const ACTIVE_TOOLS = {
  gpt5_agent: true,
  gpt5_codex: true,
  image_generation: true,  // ← set to true
  // ...
};
```
Then: `npm run build` and restart Claude Code.

## Architecture

```
src/
├── index.ts              # MCP server entry point
├── utils.ts              # GPT-5 API utilities
├── types/
│   ├── responses.ts      # API response types
│   └── tools.ts          # Tool interface definitions
└── tools/
    ├── index.ts          # Tool registration & activation
    ├── registry.ts       # Tool registry (singleton)
    ├── base.ts           # Base tool class
    └── built-in/
        ├── gpt5-agent.ts     # ✅ Active
        ├── gpt5-codex.ts     # ✅ Active
        ├── web-search.ts
        ├── file-operations.ts
        ├── code-interpreter.ts
        ├── image-generation.ts
        └── function-definition.ts
```

## Streaming Implementation

GPT-5 Agent uses SSE (Server-Sent Events) to prevent MCP timeout:
- Activity timeout: 120 seconds without data
- Request timeout: up to 15 minutes for complex tasks
- Activated when `reasoning_effort` is not `none` or `minimal`

## Troubleshooting

**Server not found:**
```bash
claude mcp remove gpt5-server
claude mcp add gpt5-server -e OPENAI_API_KEY=sk-... -- node /path/to/build/index.js
```

**Socket hang up errors:**
- Ensure `.mcp.json` points to `build/index.js` (not `dist/`)
- SSE streaming handles long-running requests

**Codex not working:**
- Install Codex CLI: check `CODEX_BIN` environment variable
- Image support disabled in Codex (known CLI limitation)

---

**Built with MCP • Powered by OpenAI GPT-5**
