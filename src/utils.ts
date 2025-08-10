import fetch from 'node-fetch';

interface GPT5ResponseRequest {
  model: string;
  input: string | Array<{
    role: 'user' | 'developer' | 'assistant';
    content: string | Array<{
      type: 'input_text' | 'input_image' | 'input_file';
      text?: string;
      image_url?: string;
      file_id?: string;
      file_url?: string;
    }>;
  }>;
  instructions?: string;
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
  };
  text?: {
    verbosity?: 'low' | 'medium' | 'high';
  };
  tools?: Array<{
    type: 'web_search_preview' | 'file_search' | 'function';
    [key: string]: any;
  }>;
  stream?: boolean;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  parallel_tool_calls?: boolean;
  store?: boolean;
  previous_response_id?: string;
}

interface GPT5Response {
  id: string;
  object: string;
  created_at: number;
  status: string;
  output: Array<{
    id: string;
    type: 'message' | 'reasoning';
    role?: string;
    content?: Array<{
      type: 'output_text' | 'text';
      text: string;
      annotations?: any[];
    }>;
    summary?: any[];
  }>;
  output_text?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    input_tokens_details?: {
      cached_tokens: number;
    };
    output_tokens_details?: {
      reasoning_tokens: number;
    };
  };
  model?: string;
  text?: {
    format?: {
      type: string;
    };
    verbosity?: string;
  };
}

export async function callGPT5(
  apiKey: string,
  input: string,
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
    tools?: Array<{
      type: 'web_search_preview' | 'file_search' | 'function';
      [key: string]: any;
    }>;
  } = {}
): Promise<{ content: string; usage?: any; response_id?: string; raw_response?: any }> {
  const requestBody: GPT5ResponseRequest = {
    model: options.model || 'gpt-5',
    input,
    ...(options.instructions && { instructions: options.instructions }),
    ...(options.reasoning_effort && { reasoning: { effort: options.reasoning_effort } }),
    ...(options.verbosity && { text: { verbosity: options.verbosity } }),
    ...(options.tools && { tools: options.tools }),
    ...(options.max_tokens && { max_output_tokens: options.max_tokens }),
    ...(options.temperature !== undefined && { temperature: options.temperature }),
    ...(options.top_p !== undefined && { top_p: options.top_p }),
    ...(options.parallel_tool_calls !== undefined && { parallel_tool_calls: options.parallel_tool_calls }),
    ...(options.store !== undefined && { store: options.store }),
    // Streaming is disabled for MCP compatibility - MCP requires complete responses
    stream: false
  };

  console.error('Making GPT-5 API request:', JSON.stringify(requestBody, null, 2));

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

  const data = await response.json() as any;
  console.error('GPT-5 API response:', JSON.stringify(data, null, 2));

  // Try to extract text content from various possible locations
  let textContent = '';
  
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
    usage: data.usage,
    response_id: data.id,
    raw_response: data
  };
}

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
  } = {}
): Promise<{ content: string; usage?: any; response_id?: string; raw_response?: any }> {
  const requestBody: GPT5ResponseRequest = {
    model: options.model || 'gpt-5',
    input: messages,
    ...(options.instructions && { instructions: options.instructions }),
    ...(options.reasoning_effort && { reasoning: { effort: options.reasoning_effort } }),
    ...(options.verbosity && { text: { verbosity: options.verbosity } }),
    ...(options.tools && { tools: options.tools }),
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

  const data = await response.json() as any;
  console.error('GPT-5 API response:', JSON.stringify(data, null, 2));

  // Try to extract text content from various possible locations
  let textContent = '';
  
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
    usage: data.usage,
    response_id: data.id,
    raw_response: data
  };
}

