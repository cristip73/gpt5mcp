import { Tool, ToolDefinition, ToolExecutionContext, ToolResult } from '../types/tools.js';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
    console.error(`Registered tool: ${tool.name} (${tool.type})`);
  }

  unregister(toolName: string): boolean {
    const removed = this.tools.delete(toolName);
    if (removed) {
      console.error(`Unregistered tool: ${toolName}`);
    }
    return removed;
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  getToolDefinitions(): ToolDefinition[] {
    return this.getAllTools().map(tool => tool.getDefinition());
  }

  async executeTool(
    toolName: string,
    args: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const tool = this.getTool(toolName);
    if (!tool) {
      return {
        tool_call_id: `error_${Date.now()}`,
        output: '',
        error: `Tool '${toolName}' not found`,
        status: 'error'
      };
    }

    try {
      console.error(`Executing tool: ${toolName} with args:`, JSON.stringify(args, null, 2));
      const timeoutMs = context.timeout && context.timeout > 0 ? context.timeout : undefined;

      let timeoutHandle: NodeJS.Timeout | undefined;
      const executionPromise = tool.execute(args, context);

      const timeoutPromise = timeoutMs
        ? new Promise<ToolResult>((resolve) => {
            timeoutHandle = setTimeout(() => {
              resolve({
                tool_call_id: `timeout_${Date.now()}`,
                output: '',
                error: `Tool '${toolName}' timed out after ${timeoutMs}ms`,
                status: 'timeout'
              });
            }, timeoutMs);
          })
        : null;

      const result = timeoutPromise
        ? await Promise.race([executionPromise, timeoutPromise])
        : await executionPromise;

      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      if (timeoutPromise && result.status === 'timeout') {
        executionPromise.catch((err) => {
          console.error(`Tool ${toolName} continued running after timeout:`, err);
        });
      }

      console.error(`Tool ${toolName} completed with status: ${result.status}`);
      return result;
    } catch (error) {
      console.error(`Tool ${toolName} execution failed:`, error);
      return {
        tool_call_id: `error_${Date.now()}`,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        status: 'error'
      };
    }
  }

  listAvailableTools(): string[] {
    return Array.from(this.tools.keys());
  }

  getToolsForGPT5(): Array<{
    type: 'function' | 'web_search_preview' | 'file_search';
    function?: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  }> {
    return this.getAllTools().map(tool => {
      if (tool.type === 'function') {
        return {
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }
        };
      } else if (tool.type === 'web_search') {
        return {
          type: 'web_search_preview' as const
        };
      } else if (tool.type === 'file_search') {
        return {
          type: 'file_search' as const
        };
      } else {
        // Default to function type for other tools
        return {
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }
        };
      }
    });
  }
}

// Global tool registry instance
export const globalToolRegistry = new ToolRegistry();