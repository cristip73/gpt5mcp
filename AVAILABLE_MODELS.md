# Available Models for GPT-5 MCP Server

This document provides a comprehensive overview of all available models for the `gpt5_codex` and `gpt5_agent` tools in the GPT-5 MCP Server.

---

## 1. GPT5_CODEX Tool

### Overview
The `gpt5_codex` tool runs Codex CLI exec jobs with support for multiple GPT models. It provides autonomous coding capabilities with various reasoning levels and edit modes.

### Available Models

| Model ID | Description | Reasoning Support |
|----------|-------------|-------------------|
| `gpt-5.1-codex-max` | **Default model** - Maximum performance Codex model | High reasoning (low, medium, high, extra_high) |
| `gpt-5.2` | Next-generation GPT-5 model | High reasoning (low, medium, high, extra_high) |
| `gpt-5.1-codex` | Standard GPT-5.1 Codex model | High reasoning (low, medium, high, extra_high) |
| `gpt-5.1-codex-mini` | Lightweight Codex variant | High reasoning (low, medium, high, extra_high) |
| `o3` | OpenAI o3 model | High reasoning (low, medium, high, extra_high) |
| `o4-mini` | OpenAI o4-mini model | High reasoning (low, medium, high, extra_high) |

### Default Configuration
- **Default Model**: `gpt-5.1-codex-max`
- **Default Reasoning Effort**: `medium`
- **Default Edit Mode**: `auto_edit`
- **Default Timeout**: 300 seconds (5 minutes)
  - Auto-extended for high reasoning: 600s (10 minutes)
  - Auto-extended for extra_high reasoning: 900s (15 minutes)

### Reasoning Effort Levels

| Level | Description | Use Case | Auto Timeout |
|-------|-------------|----------|--------------|
| `low` | Fast, basic reasoning | Simple tasks, quick iterations | 300s (default) |
| `medium` | **Default** - Balanced reasoning | General purpose tasks | 300s (default) |
| `high` | Deep reasoning | Complex problems requiring careful analysis | 600s |
| `extra_high` | Maximum reasoning depth | Very complex problems, critical code | 900s |

### Edit Modes

| Mode | Approval | Sandbox | Description |
|------|----------|---------|-------------|
| `research` | `untrusted` | `read-only` | Read-only access, no file modifications |
| `auto_edit` | **Default** `on-request` | `workspace-write` | Can edit files with approval |
| `full_auto` | `never` | `workspace-write` | Automatic edits without approval |
| `dangerous` | Bypassed | No sandbox | **Warning: Full unsandboxed access** |

### Known Limitations

#### Image Support Issues
The Codex CLI exec mode has **known issues with image attachments** (GitHub issues #2323, #2473):
- May hang or fall back to interactive mode when images are attached via `-i` flag
- Images in `file_path`, `files[]`, or `images[]` parameters will trigger a warning
- **Workaround**: Use Codex interactively for image tasks or use a different tool

**Code Reference**: Lines 339-364 in `/Users/cristi/Downloads/CODING/gpt5mcp/src/tools/built-in/gpt5-codex.ts`

### File Input Capabilities

**Text Files:**
- Single file via `file_path`: Max 100KB
- Multiple files via `files[]`: Max 100KB each, 200KB total
- Automatically inlined into prompt with XML tags

**Images:**
- Supported formats: PNG, JPG, JPEG, WebP, GIF
- **Currently disabled due to CLI limitations**

### Output Options

**Save Format:**
- `standard` (default): Full metadata with task info, model, execution time
- `clean`: Raw output only, no metadata

**Output Customization:**
- Default folder: `_gpt5_docs`
- Custom folder: `output_folder` (supports absolute, relative, or `~/` paths)
- Custom filename: `output_filename` (auto-adds `.md` extension)
- Display control: `display_in_chat` (true/false)

---

## 2. GPT5_AGENT Tool

### Overview
The `gpt5_agent` tool provides autonomous task solving via GPT-5 models using the OpenAI Responses API. It orchestrates tools, web search, code interpreter, and file operations.

### Available Models

| Model ID | Type | Reasoning Support | Verbosity Support | Default |
|----------|------|-------------------|-------------------|---------|
| `gpt-5.1` | Reasoning | Yes (none, minimal, low, medium, high) | low, medium, high | **Default** |
| `gpt-5` | Reasoning | Yes (none, minimal, low, medium, high) | low, medium, high | |
| `gpt-5-mini` | Reasoning | Yes (none, minimal, low, medium, high) | low, medium, high | |
| `gpt-5-nano` | Reasoning | Yes (none, minimal, low, medium, high) | low, medium, high | |
| `gpt-5.1-chat-latest` | **Non-reasoning** | No | **medium only** | |

### Default Configuration
- **Default Model**: `gpt-5.1`
- **Default Reasoning Effort**: `medium`
- **Default Verbosity**: `medium`
- **Default Max Iterations**: Varies by reasoning effort (see table below)
- **Default Output Tokens**: 32,000 (64,000 in quality mode)

### Reasoning Effort Levels with Defaults

| Effort | Max Iterations | Max Execution Time | Tool Timeout | Use Case |
|--------|----------------|--------------------|--------------|--------------------|
| `none` | 5 | 90s | 15s | No reasoning, fast tool-calling |
| `minimal` | 6 | 120s | 20s | Fast responses |
| `low` | 8 | 180s | 30s | Simple tasks |
| `medium` | 10 | 240s | 45s | **Default** - General purpose |
| `high` | 12 | 420s | 60s | Complex tasks (very slow & expensive) |

**Note**: All timeouts are configurable via parameters and can be overridden up to maximum limits:
- Max iterations: 1-20
- Max execution time: 30-1800 seconds
- Tool timeout: 5-300 seconds

### Model-Specific Restrictions

#### gpt-5.1-chat-latest
This model has special restrictions:
- **No reasoning support** (non-reasoning model)
- **Verbosity locked to `medium`** - other values are silently overridden
- Faster responses but less capable for complex reasoning

**Code Reference**: Lines 599-602 in `/Users/cristi/Downloads/CODING/gpt5mcp/src/tools/built-in/gpt5-agent.ts`

### Adaptive Reasoning Optimization

The agent automatically optimizes reasoning effort based on input complexity:
- Estimates input tokens (1 token = 4 characters)
- Warns if high reasoning requested with >200k input tokens (potential overflow)
- Always respects user's requested effort level (quality-first approach)

**Code Reference**: Lines 341-352 in `/Users/cristi/Downloads/CODING/gpt5mcp/src/tools/built-in/gpt5-agent.ts`

### Reasoning Token Overflow Detection

The agent monitors reasoning token usage and warns when:
- Reasoning tokens exceed 90% of total output tokens
- Indicates potential reasoning overflow (inefficient token usage)

**Code Reference**: Lines 842-849 in `/Users/cristi/Downloads/CODING/gpt5mcp/src/tools/built-in/gpt5-agent.ts`

### File Input Capabilities

**Text Files:**
- Single file via `file_path`: Max 100KB
- Multiple files via `files[]`: Max 100KB each, 200KB total
- Automatically formatted into XML tags with path and label

**Images:**
- **Full support** for multimodal input
- Supported formats: PNG, JPG, JPEG, WebP, GIF
- Max size: 10MB per image
- Converted to base64 data URLs
- Sent as separate `input_image` content parts

**Code Reference**: Lines 628-709 in `/Users/cristi/Downloads/CODING/gpt5mcp/src/tools/built-in/gpt5-agent.ts`

### Tool Capabilities

Enable/disable capabilities via parameters:
- `enable_web_search` (default: `true`) - Web search with sources
- `enable_code_interpreter` (default: `false`) - Python code execution
- `enable_file_operations` (default: `false`) - File read/write operations

### Output Options

**Quality Settings:**
- `quality_over_cost`: false (32k max tokens) vs true (64k max tokens)

**Save Format:**
- `standard` (default): Full metadata with task, summary, execution stats
- `clean`: Raw output only, no metadata

**Output Customization:**
- Default folder: `_gpt5_docs`
- Custom folder: `output_folder` (supports absolute, relative, or `~/` paths)
- Custom filename: `output_filename` (auto-adds `.md` extension)
- Display control: `display_in_chat` (true/false)

**Response Continuation:**
- `previous_response_id`: Continue from a previous response
- All responses are stored for potential future continuation

### Size Limits

**Response Limits:**
- Max response size: 10MB
- Max output text: 50KB (truncated with warning if exceeded)
- Max final result: 60KB (truncated with warning if exceeded)

**Tool Records:**
- Status updates limited to 5 most recent
- Tool executions limited to 10 most recent in display

---

## Tool Activation Status

According to `/Users/cristi/Downloads/CODING/gpt5mcp/src/tools/index.ts`:

| Tool | Status |
|------|--------|
| `gpt5_agent` | **Active** |
| `gpt5_codex` | **Active** |
| `web_search` | Disabled |
| `file_operations` | Disabled |
| `function_definition` | Disabled |
| `list_functions` | Disabled |
| `execute_custom_function` | Disabled |
| `code_interpreter` | Disabled |
| `image_generation` | Disabled |

**Note**: While `web_search`, `code_interpreter`, and `file_operations` are disabled at the MCP server level, they can still be enabled **within** the `gpt5_agent` tool via parameters (`enable_web_search`, `enable_code_interpreter`, `enable_file_operations`).

---

## Quick Reference

### When to Use Each Tool

**Use `gpt5_codex` when:**
- You need deep code analysis and editing
- Working with codebases (uses Codex CLI)
- Need high reasoning for coding tasks
- Want auto-edit capabilities with workspace control
- **Not working with images** (due to CLI limitations)

**Use `gpt5_agent` when:**
- Need web search with real-time information
- Want to orchestrate multiple tools
- Working with images (multimodal support)
- Need code execution (code_interpreter)
- Want conversation continuation
- Need faster, more flexible tool orchestration

### Model Selection Guidelines

**For Codex:**
- Default to `gpt-5.1-codex-max` for best results
- Use `gpt-5.2` for experimental next-gen features
- Use `gpt-5.1-codex-mini` for faster, cheaper operations
- Use `o3` or `o4-mini` for OpenAI's latest reasoning models

**For Agent:**
- Default to `gpt-5.1` for general tasks
- Use `gpt-5` for stable, well-tested behavior
- Use `gpt-5-mini` or `gpt-5-nano` for faster, cheaper operations
- Use `gpt-5.1-chat-latest` only for simple, non-reasoning chat tasks

---

## Environment Variables

Both tools require:
- `OPENAI_API_KEY` - Your OpenAI API key (stored in `.env`)

Optional:
- `CODEX_BIN` - Custom path to Codex CLI binary (for gpt5_codex)

---

## References

- **gpt5_codex implementation**: `/Users/cristi/Downloads/CODING/gpt5mcp/src/tools/built-in/gpt5-codex.ts`
- **gpt5_agent implementation**: `/Users/cristi/Downloads/CODING/gpt5mcp/src/tools/built-in/gpt5-agent.ts`
- **Tool registry**: `/Users/cristi/Downloads/CODING/gpt5mcp/src/tools/index.ts`
- **Codex CLI issues**: GitHub #2323, #2473 (image attachment problems)
