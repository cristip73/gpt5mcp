# GPT-5 Agent File Output Feature Plan

## Overview
Enable GPT-5 agent to save its final outputs directly to markdown files in `gpt5_docs/` folder, with optional control over whether the LLM receives the full content or just a file reference.

## Problem Solved
- **Token Conservation**: Large agent outputs consume significant context tokens
- **Persistent Storage**: Agent outputs are preserved for future reference
- **User Accessibility**: Users can browse/read outputs independently
- **Selective Reading**: LLM can read specific parts of saved outputs later
- **Better UX**: Clean separation between metadata and content

## Feature Design

### New Parameters for `gpt5_agent` tool

```typescript
interface GPT5AgentArgs {
  // ... existing parameters ...
  
  // New file output parameters
  save_to_file?: boolean;      // Save final output to markdown file (default: false)
  file_output_only?: boolean;   // Send only file path to LLM, not content (default: false)
}
```

### File Naming Convention

```
gpt5_docs/
├── agent_output_20250825_163045_task-summary.md
├── agent_output_20250825_164512_research-results.md
└── agent_output_20250825_165230_code-analysis.md
```

**Format**: `agent_output_YYYYMMDD_HHMMSS_task-slug.md`
- Timestamp for uniqueness and chronological ordering
- Task slug (first 30 chars, kebab-case) for human readability
- Always `.md` extension for markdown

### File Content Structure

```markdown
---
task: "Original task description here"
model: gpt-5
timestamp: 2025-08-25T16:30:45Z
response_id: resp_abc123xyz
execution_time: 12.5s
iterations: 3
reasoning_effort: medium
input_tokens: 15234
output_tokens: 4521
reasoning_tokens: 8920
tool_calls: 5
---

# Task: [Original Task]

## Summary
[Executive summary if available]

## Output
[Full agent output content]

## Metadata
- Model: gpt-5
- Iterations: 3/10
- Execution Time: 12.5s
- Token Usage: 15.2k input / 4.5k output / 8.9k reasoning
```

### Response Behavior Matrix

| save_to_file | file_output_only | LLM Receives | User Sees |
|-------------|------------------|--------------|-----------|
| false | false | Full content + metadata | Full content (default) |
| true | false | Full content + metadata + file path | Full content + "Saved to file" |
| true | true | Metadata + file path only | File path + "Output saved" |

### LLM Response Format

#### When `file_output_only = false` (default)
```
[Full agent output content]

---
📄 Saved to: gpt5_docs/agent_output_20250825_163045_task-summary.md
Response ID: resp_abc123xyz
Execution: 12.5s, 3 iterations
Tokens: 15.2k input / 4.5k output / 8.9k reasoning
```

#### When `file_output_only = true`
```
✅ Task completed successfully

📄 Output saved to: gpt5_docs/agent_output_20250825_163045_task-summary.md
File size: 4.2 KB

---
Response ID: resp_abc123xyz
Model: gpt-5
Execution: 12.5s, 3 iterations
Tokens: 15.2k input / 4.5k output / 8.9k reasoning
Tool calls: 5

To read the output: Use Read tool with the file path above
```

## Implementation Steps

### Phase 1: Core File Output
1. Add new parameters to GPT5AgentTool schema
2. Create `gpt5_docs/` directory if it doesn't exist
3. Implement file naming logic with timestamp and task slug
4. Write agent output to markdown with frontmatter metadata
5. Return file path in tool response

### Phase 2: Conditional LLM Response
1. Implement `file_output_only` logic
2. When true: Return only metadata and file path
3. When false: Return full content plus file info
4. Always include essential metadata (response_id, tokens, etc.)

### Phase 3: UX Enhancements
1. Add file size information
2. Include execution summary in file-only mode
3. Add helpful instructions for reading saved files
4. Ensure clean formatting for both modes

## Usage Examples

### Example 1: Large Research Task (Save & Reference)
```json
{
  "task": "Research and analyze the top 10 JavaScript frameworks of 2025",
  "reasoning_effort": "high",
  "save_to_file": true,
  "file_output_only": true,
  "enable_web_search": true
}
```
**Result**: Large research output saved to file, LLM receives only file path and metadata

### Example 2: Code Generation (Save & Display)
```json
{
  "task": "Generate a complete REST API for a blog system",
  "save_to_file": true,
  "file_output_only": false,
  "enable_code_interpreter": true
}
```
**Result**: Code saved to file AND displayed in LLM response

### Example 3: Quick Query (Default Behavior)
```json
{
  "task": "Explain the difference between TCP and UDP"
}
```
**Result**: Normal inline response, no file saved

## Benefits

### For Users
- **Persistent History**: All agent outputs preserved in `gpt5_docs/`
- **Easy Browsing**: Can open files directly in editor
- **Better Organization**: Chronological, searchable file names
- **Token Savings**: Large outputs don't consume context

### For LLM
- **Selective Reading**: Can read specific files when needed
- **Context Preservation**: Metadata always available
- **Efficient Memory**: Large outputs don't fill context window
- **Continuation Support**: Can reference previous outputs by file

### For System
- **Performance**: Reduced memory pressure from large outputs
- **Scalability**: Handles unlimited output sizes
- **Debugging**: File outputs serve as execution logs
- **Archival**: Natural audit trail of agent activities

## Edge Cases & Considerations

1. **Directory Creation**: Auto-create `gpt5_docs/` if missing
2. **File Conflicts**: Timestamp ensures uniqueness, but add counter if needed
3. **Error Handling**: If file write fails, fallback to inline response
4. **Size Limits**: No limit on file size, but warn if >1MB
5. **Cleanup**: Consider max file age or count (future enhancement)

## Success Metrics

- **Token Reduction**: 50-90% context savings for large outputs
- **User Satisfaction**: Clean separation of content and metadata
- **Performance**: No noticeable latency from file operations
- **Reliability**: 100% fallback to inline if file write fails

## Future Enhancements

1. **File Formats**: Support JSON, YAML exports
2. **Compression**: Gzip for very large outputs
3. **Indexing**: Searchable metadata index
4. **Versioning**: Track output iterations for same task
5. **Cleanup Policy**: Auto-archive old files
6. **Categories**: Organize by task type or date folders

## Decision Points

### Why Markdown?
- Human readable
- Supports frontmatter metadata
- Renders nicely in editors
- Compatible with documentation tools

### Why Both Flags?
- `save_to_file`: User wants persistent storage
- `file_output_only`: User wants to save tokens
- Independent control for maximum flexibility

### Why Always Include Metadata?
- Response ID crucial for continuation
- Token usage important for monitoring
- Execution stats valuable for debugging
- Minimal token overhead (~100 tokens)