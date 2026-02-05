# GPT-5 MCP Server

**gpt5-server** - OpenAI GPT-5 API integration via MCP protocol for Claude Code.

## Active Tools

### `gpt5_agent`
Autonomous agent with SSE streaming, tool orchestration, and persistent reasoning.
- Default model: `gpt-5.2`
- Features: web search, code interpreter, file operations, conversation continuation
- Output: saved to `gpt5_docs/` folder

### `gpt5_codex`
Codex CLI integration for deep code analysis and autonomous editing.
- Default model: `gpt-5.2-codex`
- Modes: `research` (read-only), `auto_edit`, `full_auto`, `dangerous`

## Inactive Tools (disabled for performance)
`web_search`, `file_operations`, `code_interpreter`, `image_generation`, `function_definition`

Enable in `src/tools/index.ts` → `ACTIVE_TOOLS` object, then `npm run build`.

## Environment Variables
```
OPENAI_API_KEY=sk-...          # Required
CODEX_BIN=/opt/homebrew/bin/codex  # Optional, for gpt5_codex
```

## Build & Run
```bash
npm install && npm run build
node build/index.js
```

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.