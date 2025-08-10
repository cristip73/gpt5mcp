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
import { callGPT5, callGPT5WithMessages } from './utils.js';

// Initialize environment from parent directory
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = path.join(__dirname, '../../.env');
dotenv.config({ path: envPath });
console.error("Environment loaded from:", envPath);

// Schema definitions
const GPT5GenerateSchema = z.object({
  input: z.string().describe("The input text or prompt for GPT-5"),
  model: z.enum(['gpt-5', 'gpt-5-mini', 'gpt-5-nano']).optional().default("gpt-5").describe("Model variant: gpt-5 (best quality), gpt-5-mini (cost-effective), gpt-5-nano (ultra-fast)"),
  instructions: z.string().optional().describe("System instructions to guide model behavior"),
  reasoning_effort: z.enum(['low', 'medium', 'high']).optional().describe("Reasoning depth: omit for no reasoning, 'low' for minimal, 'medium' for balanced, 'high' for thorough. NOTE: Do not set by default - let the model decide"),
  verbosity: z.enum(['low', 'medium', 'high']).optional().describe("Output length control: 'low' for concise, 'medium' for standard, 'high' for comprehensive"),
  max_tokens: z.number().min(1).max(128000).optional().describe("Max output tokens (1-128000). Default varies by model"),
  temperature: z.number().min(0).max(2).optional().default(1).describe("Randomness (0-2): 0=deterministic, 1=balanced, 2=creative (NOT SUPPORTED by GPT-5 - will cause error)"),
  top_p: z.number().min(0).max(1).optional().default(1).describe("Nucleus sampling (0-1): lower=focused, higher=diverse"),
  parallel_tool_calls: z.boolean().optional().describe("Allow multiple tool calls in parallel"),
  store: z.boolean().optional().default(true).describe("Store conversation for model improvement")
});
// Note: Streaming is disabled for MCP compatibility - MCP requires complete responses

const GPT5MessagesSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'developer', 'assistant']).describe("Role: 'user' for human input, 'developer' for system context, 'assistant' for AI responses"),
    content: z.string().describe("Message text content")
  })).describe("Conversation history as array of role/content pairs. When using previous_response_id, only include new messages"),
  previous_response_id: z.string().optional().describe("ID from a previous response to continue the conversation (stateful mode). When provided, messages should only contain new messages, not the full history"),
  model: z.enum(['gpt-5', 'gpt-5-mini', 'gpt-5-nano']).optional().default("gpt-5").describe("Model variant: gpt-5 (best quality), gpt-5-mini (cost-effective), gpt-5-nano (ultra-fast)"),
  instructions: z.string().optional().describe("System instructions to guide model behavior"),
  reasoning_effort: z.enum(['low', 'medium', 'high']).optional().describe("Reasoning depth: omit for no reasoning, 'low' for minimal, 'medium' for balanced, 'high' for thorough. NOTE: Do not set by default - let the model decide"),
  verbosity: z.enum(['low', 'medium', 'high']).optional().describe("Output length control: 'low' for concise, 'medium' for standard, 'high' for comprehensive"),
  max_tokens: z.number().min(1).max(128000).optional().describe("Max output tokens (1-128000). Default varies by model"),
  temperature: z.number().min(0).max(2).optional().default(1).describe("Randomness (0-2): 0=deterministic, 1=balanced, 2=creative (NOT SUPPORTED by GPT-5 - will cause error)"),
  top_p: z.number().min(0).max(1).optional().default(1).describe("Nucleus sampling (0-1): lower=focused, higher=diverse"),
  parallel_tool_calls: z.boolean().optional().describe("Allow multiple tool calls in parallel"),
  store: z.boolean().optional().default(true).describe("Store conversation for model improvement")
});


// Type definitions
type GPT5GenerateArgs = z.infer<typeof GPT5GenerateSchema>;
type GPT5MessagesArgs = z.infer<typeof GPT5MessagesSchema>;

// Main function
async function main() {
  // Check if OPENAI_API_KEY is set
  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable is not set');
    console.error('Please set it in .env file or as an environment variable');
    process.exit(1);
  }

  // Create MCP server
  const server = new Server({
    name: "gpt5-server",
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
      return {
        tools: [
          {
            name: "gpt5_generate",
            description: "Generate text using OpenAI GPT-5 API with a simple input prompt",
            inputSchema: zodToJsonSchema(GPT5GenerateSchema),
          },
          {
            name: "gpt5_messages",
            description: "Generate text using GPT-5 with structured conversation messages",
            inputSchema: zodToJsonSchema(GPT5MessagesSchema),
          },
        ]
      };
    }
  );

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request) => {
      console.error("Handling CallToolRequest:", JSON.stringify(request.params));
      
      try {
        switch (request.params.name) {
          case "gpt5_generate": {
            const args = GPT5GenerateSchema.parse(request.params.arguments) as GPT5GenerateArgs;
            console.error(`GPT-5 Generate: "${args.input.substring(0, 100)}..."`);
            
            const result = await callGPT5(process.env.OPENAI_API_KEY!, args.input, {
              model: args.model,
              instructions: args.instructions,
              reasoning_effort: args.reasoning_effort,
              verbosity: args.verbosity,
              max_tokens: args.max_tokens,
              temperature: args.temperature,
              top_p: args.top_p,
              parallel_tool_calls: args.parallel_tool_calls,
              store: args.store
            });
            
            return {
              content: [{
                type: "text",
                text: JSON.stringify(result.raw_response, null, 2)
              }]
            };
          }
          
          case "gpt5_messages": {
            const args = GPT5MessagesSchema.parse(request.params.arguments) as GPT5MessagesArgs;
            console.error(`GPT-5 Messages: ${args.messages.length} messages${args.previous_response_id ? ' (stateful mode)' : ''}`);
            
            const result = await callGPT5WithMessages(process.env.OPENAI_API_KEY!, args.messages, {
              model: args.model,
              instructions: args.instructions,
              reasoning_effort: args.reasoning_effort,
              verbosity: args.verbosity,
              max_tokens: args.max_tokens,
              temperature: args.temperature,
              top_p: args.top_p,
              parallel_tool_calls: args.parallel_tool_calls,
              store: args.store,
              previous_response_id: args.previous_response_id
            });
            
            return {
              content: [{
                type: "text",
                text: JSON.stringify(result.raw_response, null, 2)
              }]
            };
          }
          
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
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