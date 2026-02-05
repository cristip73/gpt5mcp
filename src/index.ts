#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { callGPT5WithMessages } from './utils.js';
import { registerAllBuiltInTools, globalToolRegistry } from './tools/index.js';
import { appendFileSync } from 'fs';

// Simple diagnostic log file
const DIAG_LOG = '/Users/cristi/Downloads/CODING/gpt5mcp/mcp-diagnostic.log';
const diagLog = (msg: string) => {
  try {
    appendFileSync(DIAG_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
};

// Initialize environment from parent directory
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = path.join(__dirname, '../.env');
dotenv.config({ path: envPath });
console.error("Environment loaded from:", envPath);

// Schema definition
const GPT5MessagesSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'developer', 'assistant']).describe("Role: 'user' for human input, 'developer' for system context, 'assistant' for AI responses"),
    content: z.string().describe("Message text content")
  })).describe("Conversation history as array of role/content pairs. When using previous_response_id, only include new messages"),
  previous_response_id: z.string().optional().describe("ID from a previous response to continue the conversation (stateful mode). When provided, messages should only contain new messages, not the full history"),
  model: z.enum(['gpt-5', 'gpt-5-mini', 'gpt-5-nano']).optional().default("gpt-5").describe("Model variant: gpt-5 (best quality), gpt-5-mini (cost-effective), gpt-5-nano (ultra-fast)"),
  instructions: z.string().optional().describe("System instructions to guide model behavior"),
  reasoning_effort: z.enum(['low', 'medium', 'high']).optional().describe("Reasoning depth: 'low' for minimal (recommended), 'medium' for balanced (default if reasoning depth omitted), 'high' for thorough"),
  verbosity: z.enum(['low', 'medium', 'high']).optional().describe("Output length control: 'low' for concise, 'medium' for standard, 'high' for comprehensive"),
  max_tokens: z.number().min(1).max(128000).optional().describe("Max output tokens (1-128000). Default varies by model"),
  temperature: z.number().min(0).max(2).optional().default(1).describe("Randomness (0-2): 0=deterministic, 1=balanced, 2=creative (NOT SUPPORTED by GPT-5 - will cause error)"),
  top_p: z.number().min(0).max(1).optional().default(1).describe("Nucleus sampling (0-1): lower=focused, higher=diverse"),
  parallel_tool_calls: z.boolean().optional().describe("Allow multiple tool calls in parallel"),
  store: z.boolean().optional().default(true).describe("Store conversation for model improvement"),
  enable_tools: z.boolean().optional().default(false).describe("Enable tool calling capabilities (web search, file operations, code interpreter, etc.)")
});


// Type definition
type GPT5MessagesArgs = z.infer<typeof GPT5MessagesSchema>;

// Main function
async function main() {
  // Check if OPENAI_API_KEY is set
  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable is not set');
    console.error('Please set it in .env file or as an environment variable');
    process.exit(1);
  }

  // Register all built-in tools
  registerAllBuiltInTools();

  // Create MCP server
  const server = new Server({
    name: "gpt5mcp",
    version: "0.1.0"
  }, {
    capabilities: {
      tools: {}
    }
  });

  // Set up error handling
  server.onerror = (error) => {
    console.error("MCP Server Error:", error);
  };

  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  // Set up tool handlers
  server.setRequestHandler(
    ListToolsRequestSchema,
    async () => {
      console.error("Handling ListToolsRequest");
      
      const tools = [];
      
      // Add all registered tools
      const registeredTools = globalToolRegistry.getToolDefinitions();
      for (const tool of registeredTools) {
        tools.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.parameters,
        });
      }
      
      console.error(`Exposing ${tools.length} tools`);
      
      return { tools };
    }
  );

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request) => {
      console.error("Handling CallToolRequest:", JSON.stringify(request.params));
      
      try {
        // Check if it's a registered tool
        const tool = globalToolRegistry.getTool(request.params.name);
        if (tool) {
          console.error(`Executing tool: ${request.params.name}`);
          
          const toolResult = await globalToolRegistry.executeTool(
            request.params.name,
            request.params.arguments as Record<string, any>,
            { apiKey: process.env.OPENAI_API_KEY! }
          );
          
          if (toolResult.status === 'error') {
            // Surface both the structured error and any textual output (stderr, notes)
            const combined = [
              toolResult.error || 'Tool execution failed',
              toolResult.output && toolResult.output.trim().length > 0 ? `\n\nDetails:\n${toolResult.output}` : ''
            ].join('');
            return {
              content: [{
                type: "text",
                text: combined
              }],
              isError: true
            };
          } else {
            return {
              content: [{
                type: "text",
                text: toolResult.output
              }]
            };
          }
        }
        
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      } catch (error) {
        console.error("ERROR during GPT-5 API call:", error);
        
        return {
          content: [{
            type: "text",
            text: `GPT-5 API error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Start the server
  console.error("Starting GPT-5 MCP server");
  
  try {
    const transport = new StdioServerTransport();
    console.error("StdioServerTransport created");
    
    await server.connect(transport);
    console.error("Server connected to transport");
    
    console.error("GPT-5 MCP server running on stdio");
  } catch (error) {
    console.error("ERROR starting server:", error);
    throw error;
  }
}

// Main execution
main().catch(error => {
  console.error("Server runtime error:", error);
  process.exit(1);
});
