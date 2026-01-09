import { GPT5ResponseRequest, GPT5Response, EnhancedGPT5Response } from './types/responses.js';
import { ToolCall, ToolResult } from './types/tools.js';
import { globalToolRegistry } from './tools/registry.js';

export async function callGPT5WithMessages(
  apiKey: string,
  messages: Array<{
    role: 'user' | 'developer' | 'assistant';
    content: string | Array<{
      type: 'input_text' | 'input_image' | 'input_file';
      text?: string;
      image_url?: string;
      file_id?: string;
      file_url?: string;
    }>;
  }>,
  options: {
    model?: string;
    instructions?: string;
    reasoning_effort?: 'low' | 'medium' | 'high';
    verbosity?: 'low' | 'medium' | 'high';
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    parallel_tool_calls?: boolean;
    store?: boolean;
    previous_response_id?: string;
    tools?: Array<{
      type: 'web_search_preview' | 'file_search' | 'function';
      [key: string]: any;
    }>;
    enable_tools?: boolean;
  } = {}
): Promise<EnhancedGPT5Response> {
  // Prepare tools for GPT-5 if enabled
  let gpt5Tools: Array<{ type: 'web_search_preview' | 'file_search' | 'function'; [key: string]: any }> | undefined;
  
  if (options.enable_tools) {
    gpt5Tools = options.tools || globalToolRegistry.getToolsForGPT5();
    console.error(`Using ${gpt5Tools.length} tools for GPT-5`);
  }

  const requestBody: GPT5ResponseRequest = {
    model: options.model || 'gpt-5',
    input: messages,
    ...(options.instructions && { instructions: options.instructions }),
    ...(options.reasoning_effort && { reasoning: { effort: options.reasoning_effort } }),
    ...(options.verbosity && { text: { verbosity: options.verbosity } }),
    ...(gpt5Tools && gpt5Tools.length > 0 && { tools: gpt5Tools }),
    ...(options.max_tokens && { max_output_tokens: options.max_tokens }),
    ...(options.temperature !== undefined && { temperature: options.temperature }),
    ...(options.top_p !== undefined && { top_p: options.top_p }),
    ...(options.parallel_tool_calls !== undefined && { parallel_tool_calls: options.parallel_tool_calls }),
    ...(options.store !== undefined && { store: options.store }),
    ...(options.previous_response_id && { previous_response_id: options.previous_response_id }),
    // Streaming is disabled for MCP compatibility - MCP requires complete responses
    stream: false
  };

  console.error('Making GPT-5 API request with messages:', JSON.stringify(requestBody, null, 2));

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GPT-5 API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json() as GPT5Response;
  console.error('GPT-5 API response:', JSON.stringify(data, null, 2));

  // Extract text content and tool calls
  let textContent = '';
  let toolCalls: ToolCall[] = [];
  let toolResults: ToolResult[] = [];
  
  // Check for direct output_text field
  if (data.output_text) {
    textContent = data.output_text;
  }
  // Check for text in output array with message type
  else if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === 'message' && item.content) {
        for (const content of item.content) {
          if ((content.type === 'output_text' || content.type === 'text') && content.text) {
            textContent += content.text;
          }
        }
      }
      
      // Extract tool calls if present
      if (item.tool_calls && Array.isArray(item.tool_calls)) {
        toolCalls = item.tool_calls;
      }
    }
  }

  // Execute tool calls if present and tools are enabled
  if (toolCalls.length > 0 && options.enable_tools) {
    console.error(`Processing ${toolCalls.length} tool calls`);
    
    for (const toolCall of toolCalls) {
      try {
        let toolResult: ToolResult;
        
        if (toolCall.type === 'function' && toolCall.function) {
          // Execute function tool
          const args = JSON.parse(toolCall.function.arguments);
          toolResult = await globalToolRegistry.executeTool(
            toolCall.function.name,
            args,
            { apiKey }
          );
          toolResult.tool_call_id = toolCall.id;
        } else {
          // Handle other tool types (web_search, file_search, etc.)
          toolResult = {
            tool_call_id: toolCall.id,
            output: `Tool type '${toolCall.type}' not yet implemented`,
            error: `Unsupported tool type: ${toolCall.type}`,
            status: 'error'
          };
        }
        
        toolResults.push(toolResult);
        
        // Append tool result to text content
        if (toolResult.output) {
          textContent += `\n\nTool Result (${toolCall.function?.name || toolCall.type}):\n${toolResult.output}`;
        }
        if (toolResult.error) {
          textContent += `\n\nTool Error: ${toolResult.error}`;
        }
        
      } catch (error) {
        console.error(`Error executing tool call ${toolCall.id}:`, error);
        toolResults.push({
          tool_call_id: toolCall.id,
          output: '',
          error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
          status: 'error'
        });
      }
    }
  }
  
  // If still no text, check if the response indicates incomplete status
  if (!textContent && data.status === 'incomplete') {
    textContent = `Response incomplete: ${data.incomplete_details?.reason || 'unknown reason'}`;
  }
  
  // If still no text, provide a debug message
  if (!textContent) {
    textContent = `No text content in response. Status: ${data.status}, Model: ${data.model}`;
    console.error('Warning: No text content found in GPT-5 response');
  }

  return {
    content: textContent,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    tool_results: toolResults.length > 0 ? toolResults : undefined,
    usage: data.usage,
    response_id: data.id,
    raw_response: data
  };
}

