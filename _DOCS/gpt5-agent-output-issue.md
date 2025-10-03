# GPT-5 Agent Tool - Output Display Issue

## Problem Description

The `gpt5-agent` tool successfully executes tasks and completes API calls, but the actual response content from GPT-5 is not being displayed to the user. The tool shows token usage and execution metrics, but the main output is missing.

## Current Behavior

When running the agent:
```typescript
await gpt5_agent({
  task: "What is 50 + 50?",
  reasoning_effort: "minimal",
  verbosity: "low"
});
```

**Expected Output:**
```
## 🤖 GPT-5 Agent Task Completed
**Task**: What is 50 + 50?
**Model**: gpt-5
**Iterations**: 1

### 📝 Result
100

### 📊 Token Usage
- Input: 54 tokens
- Output: 7 tokens
```

**Actual Output:**
```
## 🤖 GPT-5 Agent Task Completed
**Task**: What is 50 + 50?
**Model**: gpt-5
**Iterations**: 1

### ⚠️ Note
Agent completed the task but the response wasn't captured properly.

### 📊 Token Usage
- Input: 54 tokens
- Output: 7 tokens
```

## Technical Details

### API Endpoint
- Using OpenAI Responses API: `https://api.openai.com/v1/responses`
- Method: POST
- Headers: Standard OpenAI authentication

### Request Structure
```typescript
{
  model: "gpt-5",
  input: [
    { role: "system", content: "..." },
    { role: "user", content: "What is 50 + 50?" }
  ],
  reasoning: {
    effort: "minimal"
  },
  text: {
    verbosity: "low"
  },
  max_output_tokens: 4000,
  stream: false
}
```

### Response Parsing Attempts

The code currently checks multiple possible locations for the output:

1. **`data.output_text`** - Primary expected field
2. **`data.text`** - Alternative field (could be string or object)
3. **`data.output`** array - Looking for message objects with role="assistant"
4. **`data.choices`** - Chat Completions format fallback

### Debug Information

The tool logs show:
- Response received with 0-1 output items
- Token usage is tracked correctly (input/output tokens)
- No error messages from the API
- Response ID is captured for `previous_response_id`

## Code Location

**File**: `/src/tools/built-in/gpt5-agent.ts`

**Key sections**:
- Lines 290-310: Response parsing and debug logging
- Lines 320-401: Output extraction logic
- Lines 365-401: Multiple fallback checks for output location

## What We Need

1. **Actual Response Structure**: Need to see the exact JSON structure returned by the Responses API when tools are NOT used (simple question-answer tasks)

2. **Field Identification**: Identify which field contains the actual text response for non-tool responses

3. **Parsing Fix**: Update the parsing logic to correctly extract the response text

## Debugging Added

Current debug logs show:
```javascript
console.error('Full response keys:', Object.keys(data));
console.error('Response data sample:', JSON.stringify({
  id: data.id,
  object: data.object,
  model: data.model,
  has_output: !!data.output,
  has_output_text: !!data.output_text,
  has_text: !!data.text,
  has_choices: !!data.choices,
  other_keys: Object.keys(data).filter(...)
}, null, 2));
```

## Hypothesis

The response structure might be different when:
1. No tools are enabled/used
2. Using `reasoning_effort: "minimal"`
3. The response comes in a different format than documented

## Solution Needed

1. Capture and analyze the actual response structure
2. Identify the correct field containing the response text
3. Update the parsing logic in `gpt5-agent.ts`
4. Test with various configurations (with/without tools, different reasoning levels)

## Related Files

- `/src/tools/built-in/gpt5-agent.ts` - Main implementation
- `/src/tools/built-in/web-search.ts` - Working example that uses `output_text`
- `/docs/gpt5-agent-tool-prd.md` - Original requirements

## Testing Commands

After fixing, test with:
```typescript
// Simple math
gpt5_agent({ task: "What is 25 + 75?", reasoning_effort: "minimal", verbosity: "low" })

// With reasoning
gpt5_agent({ task: "Explain why 2+2=4", reasoning_effort: "high", verbosity: "high" })

// With tools
gpt5_agent({ task: "Search for weather in Paris", enable_web_search: true })
```

## Environment

- Node.js 18+
- TypeScript 5.x
- OpenAI API with GPT-5 access
- MCP Server framework

---

**Priority**: High - Core functionality is working but output is not visible to users

**Impact**: The tool executes correctly but users cannot see the results, making it unusable for practical purposes