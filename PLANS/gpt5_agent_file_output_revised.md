# GPT-5 Agent File Output Feature - Implementation Plan

## Core Concept
Enable GPT-5 agent to automatically save outputs to markdown files in `gpt5_docs/` folder, with control over whether the full content appears in the chat response.

## New Parameters

```typescript
interface GPT5AgentArgs {
  // ... existing parameters ...
  
  // File output parameters
  save_to_file?: boolean;      // Save output to markdown file (default: true)
  display_in_chat?: boolean;   // Show full content in chat (default: true)
}
```

## Behavior Matrix

| save_to_file | display_in_chat | LLM Receives | File Created |
|--------------|-----------------|--------------|--------------|
| true (default) | true (default) | Full content + metadata + "📄 Saved to: path" | Yes |
| true | false | Metadata + file path only | Yes |
| false | true | Full content + metadata | No |
| false | false | Full content + metadata (ignore display flag) | No |

**Logic**: When `save_to_file` is false, always display content regardless of `display_in_chat` setting.

## File Structure

### Directory Layout
```
gpt5_docs/
├── agent_20250825_163045_weather-forecast.md
├── agent_20250825_164512_code-analysis.md
└── agent_20250825_165230_research-javascript.md
```

### File Naming
**Format**: `agent_YYYYMMDD_HHMMSS_task-slug.md`
- Timestamp for uniqueness
- Task slug: first 30 chars, kebab-case, alphanumeric only
- Always `.md` extension

### File Content (Simple & Clean)
```markdown
# Task: Research JavaScript frameworks

## Summary
Analysis of top JavaScript frameworks in 2025...

## Full Output
[Complete agent response here]

---
*Generated: 2025-08-25 16:30:45 | Response ID: resp_abc123xyz | Model: gpt-5 | Tokens: 15.2k/4.5k/8.9k*
```

## Response Formats

### Case 1: save_to_file=true, display_in_chat=true (Default)
```
[Full agent output content]

📄 Saved to: gpt5_docs/agent_20250825_163045_task-summary.md
─────────────────────────────────────────
Response ID: resp_abc123xyz
Execution: 12.5s, 3 iterations
Tokens: 15.2k input / 4.5k output / 8.9k reasoning
```

### Case 2: save_to_file=true, display_in_chat=false
```
✅ Task completed successfully

📄 Output saved to: gpt5_docs/agent_20250825_163045_task-summary.md
File size: 4.2 KB

─────────────────────────────────────────
Response ID: resp_abc123xyz
Model: gpt-5
Execution: 12.5s, 3 iterations
Tokens: 15.2k input / 4.5k output / 8.9k reasoning
Tool calls: 5

💡 To read the output: Use Read tool with the file path above
```

### Case 3: save_to_file=false, display_in_chat=true/false
```
[Full agent output content]

─────────────────────────────────────────
Response ID: resp_abc123xyz
Execution: 12.5s, 3 iterations
Tokens: 15.2k input / 4.5k output / 8.9k reasoning
```

## Implementation Steps

### Step 1: Add Parameters to Schema
```typescript
// In gpt5-agent.ts
save_to_file: {
  type: 'boolean',
  description: 'Save output to markdown file in gpt5_docs folder',
  default: true
},
display_in_chat: {
  type: 'boolean', 
  description: 'Display full output in chat response',
  default: true
}
```

### Step 2: File Saving Function
```typescript
private async saveAgentOutput(
  task: string,
  output: string,
  summary: string | null,
  metadata: {
    response_id: string;
    model: string;
    execution_time: number;
    iterations: number;
    tokens: { input: number; output: number; reasoning: number };
  }
): Promise<{ filePath: string; fileSize: number }> {
  // Create directory if needed
  const docsDir = path.join(process.cwd(), 'gpt5_docs');
  await fs.mkdir(docsDir, { recursive: true });
  
  // Generate filename
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const slug = task.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 30);
  const filename = `agent_${timestamp}_${slug}.md`;
  const filePath = path.join(docsDir, filename);
  
  // Build file content
  const content = [
    `# Task: ${task}`,
    '',
    summary ? '## Summary\n' + summary + '\n' : '',
    '## Full Output',
    output,
    '',
    '---',
    `*Generated: ${new Date().toISOString()} | Response ID: ${metadata.response_id} | Model: ${metadata.model} | Tokens: ${Math.round(metadata.tokens.input/1000)}k/${Math.round(metadata.tokens.output/1000)}k/${Math.round(metadata.tokens.reasoning/1000)}k*`
  ].join('\n');
  
  // Write file
  await fs.writeFile(filePath, content, 'utf8');
  const stats = await fs.stat(filePath);
  
  return {
    filePath: path.relative(process.cwd(), filePath),
    fileSize: stats.size
  };
}
```

### Step 3: Modify Tool Response Building
```typescript
// At the end of execute() method
const {
  save_to_file = true,
  display_in_chat = true
} = args;

// Extract final output and summary
const finalOutput = /* extract from results */;
const summary = reasoningSummary || null;

// Save to file if requested
let fileInfo = null;
if (save_to_file) {
  try {
    fileInfo = await this.saveAgentOutput(
      task,
      finalOutput,
      summary,
      {
        response_id: previousResponseId,
        model,
        execution_time: (Date.now() - startTime) / 1000,
        iterations,
        tokens: { input: totalInputTokens, output: totalOutputTokens, reasoning: totalReasoningTokens }
      }
    );
  } catch (err) {
    console.error('Failed to save output to file:', err);
    // Continue without file save
  }
}

// Build response based on display_in_chat
if (!save_to_file || display_in_chat) {
  // Include full content
  parts.push(finalOutput);
  parts.push('');
  
  if (fileInfo) {
    parts.push(`📄 Saved to: ${fileInfo.filePath}`);
  }
} else {
  // Only metadata and file reference
  parts.push('✅ Task completed successfully\n');
  parts.push(`📄 Output saved to: ${fileInfo.filePath}`);
  parts.push(`File size: ${(fileInfo.fileSize / 1024).toFixed(1)} KB\n`);
}

// Always add metadata
parts.push('─────────────────────────────────────────');
parts.push(`Response ID: ${previousResponseId}`);
// ... rest of metadata
```

## Error Handling

1. **Directory Creation Failure**: Log error, continue without save
2. **File Write Failure**: Log error, fallback to inline display
3. **Invalid Task Name**: Sanitize aggressively, use timestamp only if needed
4. **Huge Output (>10MB)**: Warn in logs but still save
5. **Filesystem Full**: Catch ENOSPC, show inline with warning

## Testing Scenarios

### Test 1: Default Behavior
```json
{ "task": "Explain Docker" }
```
Expected: Full output in chat + file saved

### Test 2: Token Conservation Mode
```json
{ 
  "task": "Research top 20 programming languages",
  "display_in_chat": false
}
```
Expected: Only metadata in chat + file saved

### Test 3: No File Save
```json
{ 
  "task": "Quick calculation",
  "save_to_file": false
}
```
Expected: Full output in chat, no file

### Test 4: Large Output
```json
{
  "task": "Generate complete API documentation",
  "enable_code_interpreter": true
}
```
Expected: Handle gracefully, save large file

## Benefits

### Immediate
- **Token savings**: Up to 90% reduction for large outputs
- **Persistent history**: All outputs preserved
- **User control**: Choose display mode per request
- **Simple defaults**: Works great out of the box

### Future Potential
- Search across saved outputs
- Output versioning for same tasks
- Automatic categorization
- Integration with documentation tools

## Success Criteria
- ✅ Files save reliably with unique names
- ✅ Correct behavior for all parameter combinations  
- ✅ Graceful error handling
- ✅ No performance impact (<100ms overhead)
- ✅ Clean, readable file format
- ✅ Intuitive UX with helpful messages