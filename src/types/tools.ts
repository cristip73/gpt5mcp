export interface ToolCall {
  id: string;
  type: "function" | "web_search" | "file_search" | "code_interpreter";
  function?: {
    name: string;
    arguments: string;
  };
  web_search?: {
    query: string;
    max_results?: number;
  };
  file_search?: {
    query: string;
    file_types?: string[];
  };
  code_interpreter?: {
    code: string;
    language?: "python" | "javascript";
  };
}

export interface ToolResult {
  tool_call_id: string;
  output: string;
  error?: string;
  metadata?: Record<string, any>;
  status: "success" | "error" | "timeout";
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
  type: "function" | "web_search" | "file_search" | "code_interpreter";
}

export interface ToolExecutionContext {
  apiKey: string;
  timeout?: number;
  maxRetries?: number;
  sandboxMode?: boolean;
}

export abstract class Tool {
  abstract name: string;
  abstract description: string;
  abstract parameters: Record<string, any>;
  abstract type: ToolDefinition['type'];

  abstract execute(
    args: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolResult>;

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
      type: this.type
    };
  }
}