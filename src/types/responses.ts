import { ToolCall, ToolResult } from './tools.js';

export interface GPT5ResponseRequest {
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
    function?: {
      name: string;
      description?: string;
      parameters?: Record<string, any>;
    };
    web_search?: {
      max_results?: number;
    };
    file_search?: {
      max_results?: number;
    };
  }>;
  stream?: boolean;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  parallel_tool_calls?: boolean;
  store?: boolean;
  previous_response_id?: string;
}

export interface GPT5ResponseOutput {
  id: string;
  type: 'message' | 'reasoning';
  role?: string;
  content?: Array<{
    type: 'output_text' | 'text';
    text: string;
    annotations?: any[];
  }>;
  tool_calls?: ToolCall[];
  summary?: any[];
}

export interface GPT5Response {
  id: string;
  object: string;
  created_at: number;
  status: string;
  output: GPT5ResponseOutput[];
  output_text?: string;
  incomplete_details?: {
    reason?: string;
  };
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

export interface EnhancedGPT5Response {
  content: string;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
  usage?: GPT5Response['usage'];
  response_id?: string;
  raw_response?: GPT5Response;
}