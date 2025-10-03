# Tool Prompt Condensation Proposal

## GPT5 Agent (`gpt5_agent`)

### Tool Summary
- **Current:** Execute autonomous agent tasks using GPT-5 with tool orchestration and persistent reasoning.
- **Proposed:** Autonomously completes tasks via GPT-5, coordinating registered tools and reasoning loops.

### System Prompt
- **Current:** "You are an autonomous agent. Continue working on the task until it is complete. Use available tools as needed to accomplish your goal. Be persistent and thorough, but also efficient." (When enabled it also appends "Provide brief status updates between tool calls." plus any caller-supplied system instructions.)
- **Proposed:** "You are an autonomous agent. Work until the task is done. Use available tools efficiently and keep status updates concise. Append extra system instructions below when provided."

### Parameter Text
| Field | Current | Proposed |
| --- | --- | --- |
| `task` | High-level task description for the agent to complete | Primary objective the agent must accomplish. |
| `reasoning_effort` | Reasoning depth: minimal (fast), low, medium (default), high (very slow & expensive - use only if explicitly requested) | Select reasoning depth; higher values trade speed for quality. |
| `verbosity` | Output length: low (concise), medium (default), high (comprehensive) | Set response length to low, medium, or high. |
| `model` | Model variant to use | Choose GPT-5 model variant. |
| `enable_web_search` | Enable web search capability (IMPORTANT: provides real-time, accurate information with sources) | Allow web search tool usage. |
| `enable_code_interpreter` | Enable code interpreter capability | Allow code interpreter tool. |
| `enable_file_operations` | Enable file operations capability | Allow file operations tool. |
| `max_iterations` | Maximum number of agent loop iterations | Cap agent loop iterations (1-20). |
| `max_execution_time_seconds` | Maximum wall-clock execution time for the agent (defaults scale with reasoning effort) | Cap wall-clock runtime in seconds (defaults follow reasoning effort). |
| `tool_timeout_seconds` | Per-tool execution timeout (defaults scale with reasoning effort) | Per-tool timeout in seconds (defaults follow reasoning effort). |
| `show_preambles` | Show status updates between tool calls | Emit status updates between tool calls. |
| `show_reasoning_summary` | Include reasoning summary in output | Include reasoning summary section. |
| `system_prompt` | Additional system instructions for the agent | Extra system directives to prepend. |
| `context` | Additional context for the task | Supplemental task context. |
| `previous_response_id` | ID from a previous response to continue the conversation | Resume session using prior response ID. |
| `quality_over_cost` | Maximize response quality and completeness regardless of token cost | Favor quality even if token usage increases. |
| `save_to_file` | Save output to markdown file in gpt5_docs folder | Write output markdown into `gpt5_docs`. |
| `display_in_chat` | Display full output in chat response | Return the full output in chat. |
| `file_path` | Absolute path to a file whose content will be appended to the prompt (max 100KB) | Absolute path to inline input file (≤100KB). |
| `files` | Multiple files to append to the prompt (max 100KB each, 200KB total) | Array of additional input files (≤100KB each, 200KB total). |
| `files[].path` | Absolute path to the file | Absolute file path. |
| `files[].label` | Optional label/description for the file | Optional display label for the file. |

## GPT5 Codex (`gpt5_codex`)

### Tool Summary
- **Current:** Run Codex CLI in headless exec mode to perform tasks with optional web search.
- **Proposed:** Runs Codex CLI exec via GPT-5-Codex with optional web search support.

### Parameter Text
| Field | Current | Proposed |
| --- | --- | --- |
| `task` | Task prompt for Codex CLI exec | Prompt passed to Codex exec. |
| `model` | Model id, e.g., gpt-5-codex, gpt-5-chat-latest | Codex or chat model identifier. |
| `profile` | Codex CLI config profile | Codex CLI profile name. |
| `reasoning_effort` | Reasoning depth hint mapped to -c model_reasoning_effort | Maps to `model_reasoning_effort` (-c). |
| `verbosity` | Text verbosity mapped to -c text.verbosity | Maps to `text.verbosity` (-c). |
| `edit_mode` | Autonomy/sandbox mapping for Codex CLI | Approval/sandbox level for Codex. |
| `file_path` | Absolute path to a file (text will be inlined; images will be attached) | Absolute path of primary file to inline or attach. |
| `files` | Multiple input files | Array of extra files to inline/attach. |
| `files[].path` | — (not documented) | Absolute file path. |
| `files[].label` | — (not documented) | Optional alias for the file. |
| `images` | Image paths to pass with -i | Absolute image paths forwarded with `-i` (exec mode limitation applies). |
| `enable_web_search` | Enable model-side web search via -c tools.web_search=true | Enable Codex `tools.web_search`. |
| `save_to_file` | Save final output to gpt5_docs | Persist last message in `gpt5_docs`. |
| `display_in_chat` | Return the content inline in chat | Return last message inline. |
| `timeout_sec` | Timeout for Codex process in seconds (default 300; auto-extended when reasoning is high) | Overall exec timeout in seconds (auto scales with reasoning effort). |
