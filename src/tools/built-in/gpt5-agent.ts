import { Tool, ToolExecutionContext, ToolResult } from '../base.js';
import fetch from 'node-fetch';
import { globalToolRegistry } from '../registry.js';
import { promises as fs } from 'fs';
import path from 'path';

interface GPT5AgentArgs {
  // Required
  task: string;
  
  // Optional Configuration
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high';
  verbosity?: 'low' | 'medium' | 'high';
  
  // Optional Model Selection
  model?: 'gpt-5' | 'gpt-5-mini' | 'gpt-5-nano';
  
  // Optional Tool Configuration
  enable_web_search?: boolean;
  enable_code_interpreter?: boolean;
  enable_file_operations?: boolean;
  
  // Optional Behavior Settings
  max_iterations?: number;
  show_preambles?: boolean;
  show_reasoning_summary?: boolean;
  max_execution_time_seconds?: number;
  tool_timeout_seconds?: number;
  
  // Optional Context
  system_prompt?: string;
  context?: string;
  
  // Optional Continuation
  previous_response_id?: string;
  
  // Optional Quality Settings
  quality_over_cost?: boolean;
  
  // Optional File Output Settings
  save_to_file?: boolean;
  display_in_chat?: boolean;
  
  // Optional File Input
  file_path?: string;
  files?: Array<{
    path: string;
    label?: string;
  }>;
}

interface ResponsesAPIRequest {
  model: string;
  input: any;
  tools?: Array<any>;
  reasoning?: {
    effort?: string;
    summary?: string;
  };
  text?: {
    verbosity?: string;
  };
  previous_response_id?: string;
  max_output_tokens?: number;
  stream?: boolean;
  store?: boolean;
}

interface ResponsesAPIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  output: Array<any>;
  output_text?: string;
  reasoning_summary?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens?: number;
    total_tokens: number;
  };
}

export class GPT5AgentTool extends Tool {
  name = 'gpt5_agent';
  description = 'Execute autonomous agent tasks using GPT-5 with tool orchestration and persistent reasoning';
  type = 'function' as const;
  
  parameters = {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'High-level task description for the agent to complete'
      },
      reasoning_effort: {
        type: 'string',
        enum: ['minimal', 'low', 'medium', 'high'],
        description: 'Reasoning depth: minimal (fast), low, medium (default), high (very slow & expensive - use only if explicitly requested)',
        default: 'medium'
      },
      verbosity: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Output length: low (concise), medium (default), high (comprehensive)',
        default: 'medium'
      },
      model: {
        type: 'string',
        enum: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'],
        description: 'Model variant to use',
        default: 'gpt-5'
      },
      enable_web_search: {
        type: 'boolean',
        description: 'Enable web search capability (IMPORTANT: provides real-time, accurate information with sources)',
        default: true
      },
      enable_code_interpreter: {
        type: 'boolean',
        description: 'Enable code interpreter capability',
        default: false
      },
      enable_file_operations: {
        type: 'boolean',
        description: 'Enable file operations capability',
        default: false
      },
      max_iterations: {
        type: 'number',
        description: 'Maximum number of agent loop iterations',
        minimum: 1,
        maximum: 20,
        default: 10
      },
      max_execution_time_seconds: {
        type: 'number',
        description: 'Maximum wall-clock execution time for the agent (defaults scale with reasoning effort)',
        minimum: 30,
        maximum: 1800
      },
      tool_timeout_seconds: {
        type: 'number',
        description: 'Per-tool execution timeout (defaults scale with reasoning effort)',
        minimum: 5,
        maximum: 300
      },
      show_preambles: {
        type: 'boolean',
        description: 'Show status updates between tool calls',
        default: true
      },
      show_reasoning_summary: {
        type: 'boolean',
        description: 'Include reasoning summary in output',
        default: true
      },
      system_prompt: {
        type: 'string',
        description: 'Additional system instructions for the agent'
      },
      context: {
        type: 'string',
        description: 'Additional context for the task'
      },
      previous_response_id: {
        type: 'string',
        description: 'ID from a previous response to continue the conversation'
      },
      quality_over_cost: {
        type: 'boolean',
        description: 'Maximize response quality and completeness regardless of token cost',
        default: false
      },
      save_to_file: {
        type: 'boolean',
        description: 'Save output to markdown file in gpt5_docs folder',
        default: true
      },
      display_in_chat: {
        type: 'boolean',
        description: 'Display full output in chat response',
        default: true
      },
      file_path: {
        type: 'string',
        description: 'Absolute path to a file whose content will be appended to the prompt (max 100KB)'
      },
      files: {
        type: 'array',
        description: 'Multiple files to append to the prompt (max 100KB each, 200KB total)',
        items: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the file'
            },
            label: {
              type: 'string',
              description: 'Optional label/description for the file'
            }
          },
          required: ['path'],
          additionalProperties: false
        }
      }
    },
    required: ['task'],
    additionalProperties: false
  };

  private buildToolsArray(args: GPT5AgentArgs): Array<any> {
    const tools = [];
    
    // Add built-in tools based on configuration
    if (args.enable_web_search === true) {
      tools.push({ type: 'web_search_preview' });
    }
    
    if (args.enable_code_interpreter === true) {
      tools.push({
        type: 'code_interpreter',
        container: { type: 'auto' }
      });
    }
    
    // Add function tools from registry only if explicitly enabled
    if (args.enable_file_operations === true) {
      const fileOpsTool = globalToolRegistry.getTool('file_operations');
      if (fileOpsTool) {
        tools.push({
          type: 'function',
          function: {
            name: fileOpsTool.name,
            description: fileOpsTool.description,
            parameters: fileOpsTool.parameters
          }
        });
      }
    }
    
    return tools;
  }

  private buildSystemPrompt(args: GPT5AgentArgs): string {
    let prompt = "You are an autonomous agent. Continue working on the task until it is complete. ";
    prompt += "Use available tools as needed to accomplish your goal. ";
    prompt += "Be persistent and thorough, but also efficient. ";
    
    if (args.show_preambles) {
      prompt += "Provide brief status updates between tool calls. ";
    }
    
    if (args.system_prompt) {
      prompt += "\n\nAdditional instructions: " + args.system_prompt;
    }
    
    return prompt;
  }

  private isImageFile(filePath: string): boolean {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    const ext = path.extname(filePath).toLowerCase();
    return imageExtensions.includes(ext);
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private calculateOptimalReasoningEffort(
    estimatedInputTokens: number, 
    requestedEffort: 'minimal' | 'low' | 'medium' | 'high'
  ): 'minimal' | 'low' | 'medium' | 'high' {
    // Quality-first approach: respect user's requested reasoning effort
    // Only warn about potential overflow, don't reduce quality
    if (estimatedInputTokens > 200000 && requestedEffort === 'high') {
      console.warn(`⚠️  High reasoning effort requested with ${Math.round(estimatedInputTokens/1000)}k input tokens - may cause overflow`);
    }
    
    return requestedEffort;  // Always use user's requested effort level
  }

  private extractOutputText(resp: any): string | null {
    // Max output size to prevent memory issues (50KB)
    const MAX_OUTPUT_SIZE = 50000;
    
    // 1) SDK convenience (present only if you're using official SDK objects)
    if (typeof resp?.output_text === "string" && resp.output_text.trim()) {
      const text = resp.output_text;
      return text.length > MAX_OUTPUT_SIZE 
        ? text.substring(0, MAX_OUTPUT_SIZE) + "\n\n⚠️ Output truncated due to size limit"
        : text;
    }

    // 2) Raw Responses API shape - THIS IS WHAT WE NEED
    if (Array.isArray(resp?.output)) {
      const chunks: string[] = [];
      let totalLength = 0;
      
      for (const item of resp.output) {
        if (item?.type === "message" && (item.role === "assistant" || !item.role)) {
          const parts = Array.isArray(item.content) ? item.content : [];
          for (const part of parts) {
            let textToAdd = "";
            
            // canonical text location
            if (part?.type === "output_text" && typeof part.text === "string") {
              textToAdd = part.text;
            }
            // (defensive) handle any unexpected plain-text parts
            else if (part?.type === "text" && typeof part.text === "string") {
              textToAdd = part.text;
            }
            
            // Check size limit before adding
            if (textToAdd) {
              if (totalLength + textToAdd.length > MAX_OUTPUT_SIZE) {
                const remainingSpace = MAX_OUTPUT_SIZE - totalLength;
                if (remainingSpace > 100) {
                  chunks.push(textToAdd.substring(0, remainingSpace));
                  chunks.push("\n\n⚠️ Output truncated due to size limit");
                }
                break;
              }
              chunks.push(textToAdd);
              totalLength += textToAdd.length;
            }
          }
          if (totalLength >= MAX_OUTPUT_SIZE) break;
        }
      }
      const text = chunks.join("");
      if (text.trim()) return text;
    }

    // 3) Fallback for Chat Completions responses (if someone swaps endpoints)
    if (Array.isArray(resp?.choices) && resp.choices.length) {
      const ch = resp.choices[0];
      const text = ch?.message?.content || ch?.text;
      if (text) {
        return typeof text === "string" && text.length > MAX_OUTPUT_SIZE
          ? text.substring(0, MAX_OUTPUT_SIZE) + "\n\n⚠️ Output truncated due to size limit"
          : text;
      }
    }

    return null;
  }

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
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[-:T]/g, '')
      .replace(/\.\d{3}Z/, '')
      .slice(0, 15);
    
    const slug = task.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 30);
    
    const filename = `agent_${timestamp}_${slug}.md`;
    const filePath = path.join(docsDir, filename);
    
    // Build file content
    const contentParts = [
      `# Task:`,
      task,
      ''
    ];
    
    if (summary) {
      contentParts.push('## Summary');
      contentParts.push(summary);
      contentParts.push('');
    }
    
    contentParts.push('## Full Output');
    contentParts.push(output);
    contentParts.push('');
    contentParts.push('---');
    
    const inputTokens = `Input: ${(metadata.tokens.input/1000).toFixed(1)}k`;
    const outputTokens = `Output: ${(metadata.tokens.output/1000).toFixed(1)}k`;
    const reasoningTokens = `Reasoning: ${(metadata.tokens.reasoning/1000).toFixed(1)}k`;
    const tokenInfo = `${inputTokens} | ${outputTokens} | ${reasoningTokens}`;
    
    const executionInfo = `Time: ${metadata.execution_time.toFixed(1)}s | Iterations: ${metadata.iterations}`;
    
    contentParts.push(`*Generated: ${now.toISOString()} | Response ID: ${metadata.response_id} | Model: ${metadata.model} | ${executionInfo} | ${tokenInfo}*`);
    
    const content = contentParts.join('\n');
    
    // Write file
    await fs.writeFile(filePath, content, 'utf8');
    const stats = await fs.stat(filePath);
    
    return {
      filePath: path.relative(process.cwd(), filePath),
      fileSize: stats.size
    };
  }

  private async validateAndReadTextFile(filePath: string): Promise<{ content: string; size: number }> {
    // Validate absolute path
    if (!path.isAbsolute(filePath)) {
      throw new Error(`File path must be absolute, got: ${filePath}`);
    }
    
    // Check file exists and get stats
    const stats = await fs.stat(filePath);
    
    // Validate file size (100KB limit for text files)
    const maxSize = 100 * 1024; // 100KB
    if (stats.size > maxSize) {
      throw new Error(`Text file too large: ${filePath} is ${(stats.size / 1024).toFixed(1)}KB (max: 100KB)`);
    }
    
    // Read file content as UTF-8 text
    const content = await fs.readFile(filePath, 'utf-8');
    
    return { content, size: stats.size };
  }

  private async validateAndReadImageFile(filePath: string): Promise<{ content: string; size: number; mimeType: string }> {
    // Validate absolute path
    if (!path.isAbsolute(filePath)) {
      throw new Error(`File path must be absolute, got: ${filePath}`);
    }
    
    // Check file exists and get stats
    const stats = await fs.stat(filePath);
    
    // Validate file size (10MB limit for images)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (stats.size > maxSize) {
      throw new Error(`Image file too large: ${filePath} is ${(stats.size / 1024 / 1024).toFixed(1)}MB (max: 10MB)`);
    }
    
    // Get MIME type
    const mimeType = this.getMimeType(filePath);
    
    // Validate supported image format
    if (!mimeType.startsWith('image/')) {
      throw new Error(`Unsupported file format: ${filePath}. Supported: PNG, JPEG, WebP, GIF`);
    }
    
    // Read file content as binary buffer and convert to base64
    const buffer = await fs.readFile(filePath);
    const base64Content = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Content}`;
    
    return { content: dataUrl, size: stats.size, mimeType };
  }

  private async validateAndReadFile(filePath: string): Promise<{ content: string; size: number; isImage: boolean; mimeType?: string }> {
    if (this.isImageFile(filePath)) {
      const result = await this.validateAndReadImageFile(filePath);
      return { ...result, isImage: true };
    } else {
      const result = await this.validateAndReadTextFile(filePath);
      return { ...result, isImage: false };
    }
  }

  async execute(args: GPT5AgentArgs, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const startTime = Date.now();
      const {
        task,
        reasoning_effort = 'medium',
        verbosity = 'medium',
        model = 'gpt-5',
        max_iterations,
        max_execution_time_seconds,
        tool_timeout_seconds,
        show_preambles = true,
        show_reasoning_summary = true,
        context: taskContext,
        quality_over_cost = false,
        save_to_file = true,
        display_in_chat = true
      } = args;
      
      const reasoningDefaults: Record<'minimal' | 'low' | 'medium' | 'high', {
        maxIterations: number;
        maxExecutionSeconds: number;
        toolTimeoutSeconds: number;
      }> = {
        minimal: { maxIterations: 6, maxExecutionSeconds: 120, toolTimeoutSeconds: 20 },
        low: { maxIterations: 8, maxExecutionSeconds: 180, toolTimeoutSeconds: 30 },
        medium: { maxIterations: 10, maxExecutionSeconds: 240, toolTimeoutSeconds: 45 },
        high: { maxIterations: 12, maxExecutionSeconds: 420, toolTimeoutSeconds: 60 }
      };

      const defaults = reasoningDefaults[reasoning_effort];

      const effectiveMaxIterations = Math.min(20, Math.max(1, max_iterations ?? defaults.maxIterations));
      const effectiveMaxExecutionSeconds = Math.min(1800, Math.max(30, max_execution_time_seconds ?? defaults.maxExecutionSeconds));
      const effectiveToolTimeoutMs = Math.max(5000, Math.min(300000, (tool_timeout_seconds ?? defaults.toolTimeoutSeconds) * 1000));

      const overallDeadline = Date.now() + effectiveMaxExecutionSeconds * 1000;

      // Build initial input to estimate token count for adaptive reasoning effort
      const systemPrompt = this.buildSystemPrompt(args);
      
      // Build user content array with mixed text/image support
      const userContent: Array<{
        type: 'input_text' | 'input_image';
        text?: string;
        image_url?: string;
      }> = [];
      
      // Add main task as text content
      let taskText = task;
      if (taskContext) {
        taskText += `\n\nContext: ${taskContext}`;
      }
      
      // Handle file inputs
      let totalTextFileSize = 0;
      const maxTextTotalSize = 200 * 1024; // 200KB total limit for text files
      const processedFiles: string[] = [];
      
      // Process single file input (backward compatibility)
      if (args.file_path) {
        try {
          const fileResult = await this.validateAndReadFile(args.file_path);
          processedFiles.push(args.file_path);
          
          if (fileResult.isImage) {
            // Add image as separate content part
            userContent.push({
              type: 'input_image',
              image_url: fileResult.content
            });
          } else {
            // Add text file content to task text
            totalTextFileSize += fileResult.size;
            taskText += `\n\n<file>\npath: ${args.file_path}\ncontent:\n${fileResult.content}\n</file>`;
          }
        } catch (error: any) {
          if (error.code === 'ENOENT') {
            throw new Error(`File not found: ${args.file_path}`);
          }
          throw error;
        }
      }
      
      // Process multiple files input
      if (args.files && args.files.length > 0) {
        for (const file of args.files) {
          try {
            const fileResult = await this.validateAndReadFile(file.path);
            processedFiles.push(file.path);
            
            if (fileResult.isImage) {
              // Add image as separate content part
              userContent.push({
                type: 'input_image',
                image_url: fileResult.content
              });
            } else {
              // Check text file size limits
              totalTextFileSize += fileResult.size;
              if (totalTextFileSize > maxTextTotalSize) {
                throw new Error(`Total text file size exceeds limit: ${(totalTextFileSize / 1024).toFixed(1)}KB (max: 200KB)`);
              }
              
              // Use label if provided, otherwise use filename
              const label = file.label || path.basename(file.path);
              
              // Add text file content to task text
              taskText += `\n\n<file>\npath: ${file.path}\nlabel: ${label}\ncontent:\n${fileResult.content}\n</file>`;
            }
          } catch (error: any) {
            if (error.code === 'ENOENT') {
              throw new Error(`File not found: ${file.path}`);
            }
            throw error;
          }
        }
      }
      
      // Always add the task text as the first content part
      userContent.unshift({
        type: 'input_text',
        text: taskText
      });
      
      // Rough token estimation (1 token ≈ 4 chars)
      // For mixed content, estimate text tokens only (images have separate token calculations)
      let textLength = systemPrompt.length;
      for (const content of userContent) {
        if (content.type === 'input_text' && content.text) {
          textLength += content.text.length;
        }
      }
      const estimatedInputTokens = Math.ceil(textLength / 4);
      
      // Adaptive reasoning effort based on input complexity (from real user research)
      const adaptiveReasoningEffort = this.calculateOptimalReasoningEffort(estimatedInputTokens, reasoning_effort);
      
      // Set max output tokens based on quality preference
      const maxOutputTokens = quality_over_cost ? 64000 : 32000;
      
      // Build tools array
      const tools = this.buildToolsArray(args);
      
      // Initial request to Responses API with multimodal content support
      const initialRequest: ResponsesAPIRequest = {
        model,
        input: [
          { role: 'system', content: systemPrompt },  // Always include instructions
          { role: 'user', content: userContent }  // Mixed text/image content array
        ],
        tools: tools.length > 0 ? tools : undefined,
        reasoning: {
          effort: adaptiveReasoningEffort,
          summary: show_reasoning_summary ? 'auto' : undefined
        },
        text: {
          verbosity
        },
        max_output_tokens: maxOutputTokens,
        stream: false,
        store: !args.previous_response_id,  // Store new conversations for continuation
        previous_response_id: args.previous_response_id  // Use provided ID if continuing
      } as ResponsesAPIRequest;
      
      // Track execution
      let iterations = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalReasoningTokens = 0;
      const toolCallRecords: Array<{tool: string; arguments: any; result: any; status: string}> = [];
      const statusUpdates: string[] = [];
      let previousResponseId: string | undefined = args.previous_response_id;
      let finalOutput = '';
      let reasoningSummary = '';
      
      // Agent loop
      while (iterations < effectiveMaxIterations) {
        iterations++;

        if (Date.now() > overallDeadline) {
          return {
            tool_call_id: `agent_timeout_${Date.now()}`,
            output: '',
            error: `Agent exceeded maximum execution time of ${effectiveMaxExecutionSeconds}s`,
            status: 'timeout'
          };
        }
        
        // Prepare request
        const request: ResponsesAPIRequest = iterations === 1 ? initialRequest : {
          model,
          input: [], // Will be populated with tool outputs
          previous_response_id: previousResponseId,
          reasoning: {
            effort: adaptiveReasoningEffort,
            summary: show_reasoning_summary ? 'auto' : undefined
          },
          text: {
            verbosity
          },
          max_output_tokens: maxOutputTokens,
          stream: false,
          store: true  // Continue storing for potential future continuations
        };
        
        // Make API request
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${context.apiKey}`,
          },
          body: JSON.stringify(request)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `Responses API error: ${response.status} ${response.statusText}`;
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error?.message) {
              errorMessage = errorData.error.message;
            }
          } catch {
            errorMessage += ` - ${errorText}`;
          }
          throw new Error(errorMessage);
        }
        
        // Check response size before parsing to prevent memory issues
        const contentLength = response.headers.get('content-length');
        const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB limit
        
        if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
          throw new Error(`Response too large: ${(parseInt(contentLength) / 1024 / 1024).toFixed(1)}MB (max: ${MAX_RESPONSE_SIZE / 1024 / 1024}MB)`);
        }
        
        const data = await response.json() as any;
        
        // Store response ID for next iteration
        previousResponseId = data.id;
        
        // Update token usage and detect reasoning overflow
        if (data.usage) {
          totalInputTokens += data.usage.input_tokens || 0;
          totalOutputTokens += data.usage.output_tokens || 0;
          totalReasoningTokens += data.usage.output_tokens_details?.reasoning_tokens || 0;
          
          // Detect reasoning token overflow (from real user research)
          const reasoningTokens = data.usage.output_tokens_details?.reasoning_tokens || 0;
          const outputTokens = data.usage.output_tokens || 0;
          const overflowRatio = outputTokens > 0 ? reasoningTokens / outputTokens : 0;
          
          if (overflowRatio > 0.9) {
            console.warn(`⚠️  Reasoning token overflow detected: ${reasoningTokens} reasoning vs ${outputTokens} output tokens (${(overflowRatio * 100).toFixed(1)}% reasoning)`);
          }
        }
        
        // Extract reasoning summary if available
        if (data.reasoning_summary) {
          reasoningSummary = data.reasoning_summary;
        }
        
        // Process output items for tool calls
        const toolCalls = [];
        let hasMessage = false;
        
        // Check for tool calls in output array
        if (data.output && Array.isArray(data.output)) {
          for (const item of data.output) {
            // Check for tool calls
            if (item.type === 'function_call') {
              toolCalls.push(item);
            }
          }
        }
        
        // Extract the actual text output using our helper function
        const extractedText = this.extractOutputText(data);
        if (extractedText) {
          finalOutput = extractedText;
          hasMessage = true;
        }
        
        // If no tool calls and has message, we're done
        if (toolCalls.length === 0 && hasMessage) {
          break;
        }
        
        // If no tool calls and no message, something went wrong
        if (toolCalls.length === 0 && !hasMessage) {
          break;
        }
        
        // Execute tool calls
        const toolOutputs = [];
        for (const call of toolCalls) {
          
          // Parse arguments
          let toolArgs = {};
          if (call.arguments) {
            try {
              toolArgs = typeof call.arguments === 'string' 
                ? JSON.parse(call.arguments) 
                : call.arguments;
            } catch (e) {
              console.error(`Failed to parse tool arguments: ${e}`);
            }
          }
          
          // Execute tool through registry
          const toolResult = await globalToolRegistry.executeTool(
            call.name,
            toolArgs,
            { ...context, timeout: effectiveToolTimeoutMs }
          );
          
          // Record tool call
          toolCallRecords.push({
            tool: call.name,
            arguments: toolArgs,
            result: toolResult.output || toolResult.error,
            status: toolResult.status
          });
          
          // Prepare output for next iteration
          toolOutputs.push({
            type: 'function_call_output',
            call_id: call.call_id || call.id,
            output: toolResult.output || '',
            error: toolResult.error
          });
        }
        
        // Set up next iteration with tool outputs
        if (toolOutputs.length > 0 && iterations < effectiveMaxIterations) {
          request.input = toolOutputs;
        } else if (toolOutputs.length > 0) {
          break;
        }
      }
      
      // Check if response_id exists, log if missing
      if (!previousResponseId) {
        console.warn("Warning: No response_id available", { previousResponseId });
      }
      
      // Format final result with size management
      const MAX_RESULT_SIZE = 60000; // 60KB total result limit
      const parts = [];
      
      // Header (always included)
      parts.push(`## 🤖 GPT-5 Agent Task Completed\n\n`);
      
      // Add response_id first for easy access
      if (previousResponseId) {
        parts.push(`**Response ID**: ${previousResponseId}\n`);
        parts.push(`─────────────────────────────────────────\n`);
      }
      
      parts.push(`**Task**: ${task}\n`);
      parts.push(`**Model**: ${model}\n`);
      parts.push(`**Iterations**: ${iterations}\n`);
      parts.push(`**Execution Time**: ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`);
      parts.push(`**Reasoning Effort**: ${adaptiveReasoningEffort}\n`);
      parts.push(`**Max Output Tokens**: ${maxOutputTokens.toLocaleString()}${quality_over_cost ? ' (quality mode)' : ''}\n\n`);
      parts.push(`**Max Iterations Allowed**: ${effectiveMaxIterations}\n`);
      parts.push(`**Time Budget**: ${effectiveMaxExecutionSeconds}s\n`);
      parts.push(`**Tool Timeout**: ${(effectiveToolTimeoutMs / 1000).toFixed(0)}s\n\n`);
      
      // Status updates (limited)
      if (statusUpdates.length > 0 && show_preambles) {
        parts.push(`### 📊 Status Updates\n`);
        const maxUpdates = Math.min(statusUpdates.length, 5); // Limit to 5 updates
        for (let i = 0; i < maxUpdates; i++) {
          parts.push(`${i + 1}. ${statusUpdates[i]}\n`);
        }
        if (statusUpdates.length > maxUpdates) {
          parts.push(`... and ${statusUpdates.length - maxUpdates} more updates\n`);
        }
        parts.push('\n');
      }
      
      // Main result (priority content)
      if (finalOutput && finalOutput.trim()) {
        parts.push(`### 📝 Result\n${finalOutput.trim()}\n\n`);
      } else {
        parts.push(`### ⚠️ Note\nAgent completed the task but the response wasn't captured properly.\n\n`);
      }
      
      // Check current size before adding optional sections
      let currentSize = parts.join('').length;
      
      // Reasoning summary (if space allows)
      if (reasoningSummary && show_reasoning_summary && currentSize < MAX_RESULT_SIZE * 0.8) {
        const summarySection = `### 🧠 Reasoning Summary\n${reasoningSummary}\n\n`;
        if (currentSize + summarySection.length < MAX_RESULT_SIZE) {
          parts.push(summarySection);
          currentSize += summarySection.length;
        }
      }
      
      // Tool executions (always include but limit)
      if (toolCallRecords.length > 0 && currentSize < MAX_RESULT_SIZE * 0.9) {
        parts.push(`### 🛠️ Tool Executions\n`);
        const maxTools = Math.min(toolCallRecords.length, 10); // Limit to 10 tool calls
        for (let i = 0; i < maxTools; i++) {
          const record = toolCallRecords[i];
          parts.push(`${i + 1}. **${record.tool}** - ${record.status}\n`);
        }
        if (toolCallRecords.length > maxTools) {
          parts.push(`... and ${toolCallRecords.length - maxTools} more tool calls\n`);
        }
        parts.push('\n');
      }
      
      // Token usage (always included)
      parts.push(`### 📊 Token Usage\n`);
      parts.push(`- Input: ${totalInputTokens.toLocaleString()} tokens\n`);
      parts.push(`- Output: ${totalOutputTokens.toLocaleString()} tokens\n`);
      parts.push(`- Reasoning: ${totalReasoningTokens.toLocaleString()} tokens\n`);
      parts.push(`- Total: ${(totalInputTokens + totalOutputTokens + totalReasoningTokens).toLocaleString()} tokens\n`);
      
      // Extract the final output for file saving
      const outputForFile = finalOutput && finalOutput.trim() ? finalOutput.trim() : 'Agent completed the task but the response wasn\'t captured properly.';
      
      // Save to file if requested
      let fileInfo = null;
      if (save_to_file) {
        try {
          fileInfo = await this.saveAgentOutput(
            task,
            outputForFile,
            reasoningSummary || null,
            {
              response_id: previousResponseId || 'unknown',
              model,
              execution_time: (Date.now() - startTime) / 1000,
              iterations,
              tokens: { 
                input: totalInputTokens, 
                output: totalOutputTokens, 
                reasoning: totalReasoningTokens 
              }
            }
          );
        } catch (err) {
          console.error('Failed to save output to file:', err);
          // Continue without file save
        }
      }
      
      // Build response based on display_in_chat setting
      let result = '';
      
      if (!save_to_file || display_in_chat) {
        // Include full content
        result = parts.join('');
        
        if (fileInfo) {
          result += '\n📄 Saved to: ' + fileInfo.filePath + '\n';
        }
        
        if (result.length > MAX_RESULT_SIZE) {
          result = result.substring(0, MAX_RESULT_SIZE - 100) + "\n\n⚠️ Response truncated due to size limit";
        }
      } else {
        // Only metadata and file reference
        const metaParts = [];
        metaParts.push('✅ Task completed successfully\n');
        
        if (fileInfo) {
          metaParts.push(`📄 Output saved to: ${fileInfo.filePath}`);
          metaParts.push(`File size: ${(fileInfo.fileSize / 1024).toFixed(1)} KB\n`);
        }
        
        metaParts.push('─────────────────────────────────────────');
        
        if (previousResponseId) {
          metaParts.push(`Response ID: ${previousResponseId}`);
        }
        metaParts.push(`Model: ${model}`);
        metaParts.push(`Execution: ${((Date.now() - startTime) / 1000).toFixed(1)}s, ${iterations} iterations`);
        metaParts.push(`Tokens: ${Math.round(totalInputTokens/1000)}k input / ${Math.round(totalOutputTokens/1000)}k output / ${Math.round(totalReasoningTokens/1000)}k reasoning`);
        
        if (toolCallRecords.length > 0) {
          metaParts.push(`Tool calls: ${toolCallRecords.length}`);
        }
        
        metaParts.push('\n📖 Read the file only if instructed for full content');
        
        result = metaParts.join('\n');
      }
      
      return {
        tool_call_id: `agent_${Date.now()}`,
        output: result,
        status: 'success',
        metadata: {
          response_id: previousResponseId,  // Expose for continuation
          task,
          model,
          iterations,
          max_iterations_allowed: effectiveMaxIterations,
          tool_calls: toolCallRecords.length,
          max_execution_time_seconds: effectiveMaxExecutionSeconds,
          tool_timeout_ms: effectiveToolTimeoutMs,
          execution_time_ms: Date.now() - startTime,
          tokens: {
            input: totalInputTokens,
            output: totalOutputTokens,
            reasoning: totalReasoningTokens,
            total: totalInputTokens + totalOutputTokens + totalReasoningTokens
          }
        }
      };
      
    } catch (error) {
      console.error('GPT-5 Agent error:', error);
      
      let errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        tool_call_id: `agent_error_${Date.now()}`,
        output: '',
        error: `Agent execution failed: ${errorMessage}`,
        status: 'error'
      };
    }
  }
}