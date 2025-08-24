import { Tool, ToolExecutionContext, ToolResult } from '../base.js';
import fetch from 'node-fetch';
import { globalToolRegistry } from '../registry.js';

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
  
  // Optional Context
  system_prompt?: string;
  context?: string;
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
        description: 'Reasoning depth: minimal (fast), low, medium (default), high (thorough)',
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
        description: 'Enable web search capability',
        default: true
      },
      enable_code_interpreter: {
        type: 'boolean',
        description: 'Enable code interpreter capability',
        default: true
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
      }
    },
    required: ['task'],
    additionalProperties: false
  };

  private buildToolsArray(args: GPT5AgentArgs): Array<any> {
    const tools = [];
    
    // Add built-in tools based on configuration
    if (args.enable_web_search !== false) {
      tools.push({ type: 'web_search_preview' });
    }
    
    if (args.enable_code_interpreter !== false) {
      tools.push({
        type: 'code_interpreter',
        container: { type: 'auto' }
      });
    }
    
    // Add function tools from registry
    if (args.enable_file_operations) {
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
    
    // Add custom function tools
    const customTools = ['image_generation', 'define_function', 'list_functions', 'execute_function'];
    for (const toolName of customTools) {
      const tool = globalToolRegistry.getTool(toolName);
      if (tool && tool.type === 'function') {
        tools.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
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

  async execute(args: GPT5AgentArgs, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const startTime = Date.now();
      const {
        task,
        reasoning_effort = 'medium',
        verbosity = 'medium',
        model = 'gpt-5',
        max_iterations = 10,
        show_preambles = true,
        show_reasoning_summary = true,
        context: taskContext
      } = args;
      
      console.error(`GPT-5 Agent: Starting task "${task}" with ${model}`);
      console.error(`Configuration: reasoning=${reasoning_effort}, verbosity=${verbosity}, max_iterations=${max_iterations}`);
      
      // Build tools array
      const tools = this.buildToolsArray(args);
      console.error(`Enabled tools: ${tools.length} tools available`);
      
      // Build initial input
      const systemPrompt = this.buildSystemPrompt(args);
      let userPrompt = task;
      if (taskContext) {
        userPrompt += `\n\nContext: ${taskContext}`;
      }
      
      // Initial request to Responses API
      const initialRequest: ResponsesAPIRequest = {
        model,
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: tools.length > 0 ? tools : undefined,
        reasoning: {
          effort: reasoning_effort,
          summary: show_reasoning_summary ? 'auto' : undefined
        },
        text: {
          verbosity
        },
        max_output_tokens: 4000,
        stream: false
      };
      
      console.error('Making initial Responses API request');
      
      // Track execution
      let iterations = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalReasoningTokens = 0;
      const toolCallRecords = [];
      const statusUpdates = [];
      let previousResponseId: string | undefined;
      let finalOutput = '';
      let reasoningSummary = '';
      
      // Agent loop
      while (iterations < max_iterations) {
        iterations++;
        console.error(`Agent iteration ${iterations}/${max_iterations}`);
        
        // Prepare request
        const request: ResponsesAPIRequest = iterations === 1 ? initialRequest : {
          model,
          input: [], // Will be populated with tool outputs
          previous_response_id: previousResponseId,
          reasoning: {
            effort: reasoning_effort,
            summary: show_reasoning_summary ? 'auto' : undefined
          },
          text: {
            verbosity
          },
          max_output_tokens: 4000,
          stream: false
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
        
        const data = await response.json() as ResponsesAPIResponse;
        console.error(`Response received with ${data.output?.length || 0} output items`);
        
        // Store response ID for next iteration
        previousResponseId = data.id;
        
        // Update token usage
        if (data.usage) {
          totalInputTokens += data.usage.input_tokens || 0;
          totalOutputTokens += data.usage.output_tokens || 0;
          totalReasoningTokens += data.usage.reasoning_tokens || 0;
        }
        
        // Extract reasoning summary if available
        if (data.reasoning_summary) {
          reasoningSummary = data.reasoning_summary;
        }
        
        // Process output items
        const toolCalls = [];
        let hasMessage = false;
        
        if (data.output && Array.isArray(data.output)) {
          for (const item of data.output) {
            // Check for tool calls
            if (item.type === 'function_call') {
              console.error(`Found function call: ${item.name}`);
              toolCalls.push(item);
            }
            
            // Check for messages (preambles or final)
            if (item.type === 'message' && item.role === 'assistant') {
              hasMessage = true;
              if (item.content && Array.isArray(item.content)) {
                for (const content of item.content) {
                  if (content.type === 'text' && content.text) {
                    // This could be a preamble or final message
                    if (show_preambles && toolCalls.length > 0) {
                      statusUpdates.push(content.text);
                      console.error(`[Status] ${content.text}`);
                    } else {
                      finalOutput += content.text + '\n';
                    }
                  }
                }
              }
            }
          }
        }
        
        // Also check output_text for final output
        if (data.output_text) {
          finalOutput = data.output_text;
          hasMessage = true;
        }
        
        // If no tool calls and has message, we're done
        if (toolCalls.length === 0 && hasMessage) {
          console.error('Agent completed - no more tool calls');
          break;
        }
        
        // If no tool calls and no message, something went wrong
        if (toolCalls.length === 0 && !hasMessage) {
          console.error('Warning: No tool calls and no message in response');
          break;
        }
        
        // Execute tool calls
        const toolOutputs = [];
        for (const call of toolCalls) {
          console.error(`Executing tool: ${call.name}`);
          
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
            context
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
        if (toolOutputs.length > 0 && iterations < max_iterations) {
          request.input = toolOutputs;
        } else if (toolOutputs.length > 0) {
          console.error('Reached max iterations with pending tool calls');
          break;
        }
      }
      
      // Format final result
      let result = `## 🤖 GPT-5 Agent Task Completed\n\n`;
      result += `**Task**: ${task}\n`;
      result += `**Model**: ${model}\n`;
      result += `**Iterations**: ${iterations}\n`;
      result += `**Execution Time**: ${((Date.now() - startTime) / 1000).toFixed(1)}s\n\n`;
      
      if (statusUpdates.length > 0 && show_preambles) {
        result += `### 📊 Status Updates\n`;
        statusUpdates.forEach((update, index) => {
          result += `${index + 1}. ${update}\n`;
        });
        result += '\n';
      }
      
      if (finalOutput) {
        result += `### 📝 Result\n${finalOutput.trim()}\n\n`;
      }
      
      if (reasoningSummary && show_reasoning_summary) {
        result += `### 🧠 Reasoning Summary\n${reasoningSummary}\n\n`;
      }
      
      if (toolCallRecords.length > 0) {
        result += `### 🛠️ Tool Executions\n`;
        toolCallRecords.forEach((record, index) => {
          result += `${index + 1}. **${record.tool}** - ${record.status}\n`;
        });
        result += '\n';
      }
      
      result += `### 📊 Token Usage\n`;
      result += `- Input: ${totalInputTokens.toLocaleString()} tokens\n`;
      result += `- Output: ${totalOutputTokens.toLocaleString()} tokens\n`;
      if (totalReasoningTokens > 0) {
        result += `- Reasoning: ${totalReasoningTokens.toLocaleString()} tokens\n`;
      }
      result += `- Total: ${(totalInputTokens + totalOutputTokens + totalReasoningTokens).toLocaleString()} tokens\n`;
      
      return {
        tool_call_id: `agent_${Date.now()}`,
        output: result,
        status: 'success',
        metadata: {
          task,
          model,
          iterations,
          tool_calls: toolCallRecords.length,
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