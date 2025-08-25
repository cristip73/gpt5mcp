# GPT-5 MCP Server

A powerful Model Context Protocol (MCP) server providing direct access to OpenAI's GPT-5 API with advanced tool capabilities. Built for Claude Code with selective tool activation.

## 🚀 Quick Setup

1. **Install dependencies**: `npm install`
2. **Build**: `npm run build` 
3. **Configure API key**: Add `OPENAI_API_KEY=your-key` to `.env`
4. **Add to Claude Code**: `claude mcp add gpt5-server -e OPENAI_API_KEY=your-key -- node /path/to/build/index.js`

## 🔥 Active Tools

### GPT-5 Agent
**`mcp__gpt5-server__gpt5_agent`** - Autonomous agent with tool orchestration and persistent reasoning

Execute complex multi-step tasks with GPT-5's reasoning capabilities. The agent can use tools, maintain conversation state, and iterate through problems autonomously.

**Parameters:**
- `task` (required) - High-level task description for the agent to complete
- `model` - Model variant: `gpt-5` (default), `gpt-5-mini`, `gpt-5-nano`
- `reasoning_effort` - Reasoning depth: `minimal`, `low`, `medium` (default), `high`
- `verbosity` - Output length: `low`, `medium` (default), `high`
- `max_iterations` - Maximum agent loop iterations (default: 10, max: 20)
- `system_prompt` - Additional system instructions for the agent
- `context` - Additional context for the task
- `previous_response_id` - Continue from a previous conversation
- `quality_over_cost` - Maximize quality regardless of token cost (default: false)
- `show_preambles` - Show status updates between tool calls (default: true)
- `show_reasoning_summary` - Include reasoning summary (default: true)
- `enable_web_search` - Enable web search capability (default: false)
- `enable_file_operations` - Enable file operations capability (default: false)
- `enable_code_interpreter` - Enable code interpreter capability (default: false)

**Example:**
```json
{
  "task": "Create a Python script that analyzes CSV data and generates visualizations",
  "reasoning_effort": "high",
  "enable_code_interpreter": true,
  "enable_file_operations": true,
  "quality_over_cost": true
}
```

### Image Generation
**`mcp__gpt5-server__image_generation`** - Generate high-quality images using DALL-E 3 or GPT-4o

Create stunning images from text descriptions with advanced AI models. Images are automatically saved to `_IMAGES` folder.

**Parameters:**
- `prompt` (required) - Text description of desired image (max 4000 chars)
- `model` - Generation model: `dall-e-3` (default), `gpt-image-1`
- `size` - Image dimensions:
  - DALL-E 3: `1024x1024` (default), `1024x1792`, `1792x1024`
  - GPT-Image-1: `1024x1024` (default), `1024x1536`, `1536x1024`
- `quality` - Image quality:
  - DALL-E 3: `standard` (default), `hd`
  - GPT-Image-1: `low`, `medium`, `high`
- `style` - DALL-E 3 only: `vivid` (default), `natural`
- `n` - Number of images (currently only 1 supported)

**Example:**
```json
{
  "prompt": "A futuristic cityscape at sunset with flying cars and neon lights reflecting off glass buildings",
  "model": "dall-e-3",
  "size": "1792x1024",
  "quality": "hd",
  "style": "vivid"
}
```

### GPT-5 Messages
**`mcp__gpt5-server__gpt5_messages`** - Direct GPT-5 API access with structured conversations

Generate text using GPT-5 with full control over conversation history, reasoning, and parameters.

**Parameters:**
- `messages` (required) - Array of conversation messages with role and content
- `model` - Model variant: `gpt-5` (default), `gpt-5-mini`, `gpt-5-nano`
- `instructions` - System instructions to guide model behavior
- `reasoning_effort` - Reasoning depth: `low`, `medium`, `high`
- `verbosity` - Output length control: `low`, `medium`, `high`
- `max_tokens` - Max output tokens (1-128000)
- `temperature` - Randomness (0-2, NOT SUPPORTED by GPT-5)
- `top_p` - Nucleus sampling (0-1)
- `parallel_tool_calls` - Allow multiple tool calls in parallel
- `store` - Store conversation for model improvement (default: true)
- `enable_tools` - Enable tool calling capabilities (default: false)
- `previous_response_id` - Continue from previous response (stateful mode)

**Message Format:**
```json
{
  "messages": [
    {"role": "user", "content": "Explain quantum computing"},
    {"role": "assistant", "content": "Quantum computing is..."},
    {"role": "user", "content": "How does it differ from classical computing?"}
  ],
  "reasoning_effort": "high",
  "enable_tools": true
}
```

## 💤 Inactive Tools

The following tools are available in the codebase but **disabled by default** for performance:

### Web Search
**`mcp__gpt5-server__web_search`** - Search the web for current information
- `query` (required) - Search query
- `max_results` - Number of results (default: 5, max: 10)
- `time_range` - Time filter: `day`, `week`, `month` (default), `year`

### File Operations
**`mcp__gpt5-server__file_operations`** - File system operations
- `operation` (required) - Operation type: `read`, `write`, `list`, `delete`, `exists`
- `path` (required) - File or directory path
- `content` - Content to write (for write operation)
- `encoding` - File encoding: `utf8` (default), `base64`

### Code Interpreter
**`mcp__gpt5-server__code_interpreter`** - Execute code in secure environment
- `code` (required) - Code to execute
- `language` - Programming language: `python` (default), `javascript`
- `timeout` - Request timeout in seconds (default: 30, max: 120)

### Function Definition Tools
**Custom JavaScript functions for reuse:**
- `mcp__gpt5-server__define_function` - Define custom functions
- `mcp__gpt5-server__list_functions` - List defined functions
- `mcp__gpt5-server__execute_function` - Execute custom functions

## ⚙️ Tool Configuration

### Enable Additional Tools

Edit `src/tools/index.ts` to activate tools:

```typescript
const ACTIVE_TOOLS = {
  web_search: true,          // Enable web search
  file_operations: true,     // Enable file operations
  code_interpreter: true,    // Enable code execution
  image_generation: true,    // Already active
  gpt5_agent: true,         // Already active
} as const;
```

After changes: `npm run build` and restart Claude Code.

### Programmatic Control

```typescript
import { setToolStatus } from './tools/index.js';

// Enable web search
setToolStatus('web_search', true);

// Disable image generation
setToolStatus('image_generation', false);
```

## 🎯 Usage Examples

### Complex Task Automation
```json
{
  "task": "Analyze the performance of my Python application and suggest optimizations",
  "enable_file_operations": true,
  "enable_code_interpreter": true,
  "reasoning_effort": "high",
  "max_iterations": 15
}
```

### Creative Image Generation
```json
{
  "prompt": "An abstract representation of artificial intelligence, featuring interconnected neural networks with glowing nodes, rendered in a cyberpunk aesthetic with electric blues and purples",
  "model": "gpt-image-1",
  "quality": "high",
  "size": "1536x1024"
}
```

### Advanced Conversation
```json
{
  "messages": [
    {"role": "user", "content": "I need to build a REST API for a blog system"}
  ],
  "instructions": "You are a senior backend developer. Provide detailed, production-ready solutions.",
  "reasoning_effort": "high",
  "enable_tools": true,
  "verbosity": "high"
}
```

## 🛠 Development

### Build & Run
```bash
npm run build    # Compile TypeScript
npm start        # Start server
```

### Project Structure
```
src/
├── index.ts              # MCP server implementation
├── utils.ts              # GPT-5 API utilities
├── types/               # TypeScript definitions
├── tools/
│   ├── index.ts         # Tool registration & config
│   ├── registry.ts      # Tool registry system
│   ├── base.ts          # Base tool classes
│   └── built-in/        # Individual tool implementations
│       ├── gpt5-agent.ts
│       ├── image-generation.ts
│       ├── web-search.ts
│       └── ...
```

## 🔧 Troubleshooting

### Server not found
```bash
claude mcp remove gpt5-server
claude mcp add gpt5-server -e OPENAI_API_KEY=your-key -- node /path/to/build/index.js
```

### API key issues
- Verify GPT-5 API access with OpenAI
- Check `.env` file contains `OPENAI_API_KEY=your-key`
- Ensure correct environment path in `src/index.ts`

### Tool not available
- Check `ACTIVE_TOOLS` configuration in `src/tools/index.ts`
- Run `npm run build` after changes
- Restart Claude Code MCP server

---

**Built with MCP by Anthropic • Powered by OpenAI GPT-5**