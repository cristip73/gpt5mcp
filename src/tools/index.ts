// Export all tools for easy registration
import { WebSearchTool } from './built-in/web-search.js';
import { FileOperationsTool } from './built-in/file-operations.js';
import { 
  FunctionDefinitionTool, 
  ListFunctionsTool, 
  ExecuteCustomFunctionTool 
} from './built-in/function-definition.js';
import { CodeInterpreterTool } from './built-in/code-interpreter.js';
import { ImageGenerationTool } from './built-in/image-generation.js';
import { GPT5AgentTool } from './built-in/gpt5-agent.js';
import { globalToolRegistry } from './registry.js';

// Re-export for external use
export { WebSearchTool } from './built-in/web-search.js';
export { FileOperationsTool } from './built-in/file-operations.js';
export { 
  FunctionDefinitionTool, 
  ListFunctionsTool, 
  ExecuteCustomFunctionTool 
} from './built-in/function-definition.js';
export { CodeInterpreterTool } from './built-in/code-interpreter.js';
export { ImageGenerationTool } from './built-in/image-generation.js';
export { GPT5AgentTool } from './built-in/gpt5-agent.js';

// Export registry and base classes
export { globalToolRegistry, ToolRegistry } from './registry.js';
export { Tool, ToolDefinition, ToolExecutionContext, ToolResult, ToolCall } from './base.js';

// Tool activation configuration
const ACTIVE_TOOLS = {
  web_search: false,
  file_operations: false,
  function_definition: false,
  list_functions: false,
  execute_custom_function: false,
  code_interpreter: false,
  image_generation: true,
  gpt5_agent: true,
} as const;

// Utility function to register all built-in tools
export function registerAllBuiltInTools() {
  // Register only active tools
  if (ACTIVE_TOOLS.web_search) {
    globalToolRegistry.register(new WebSearchTool());
  }
  if (ACTIVE_TOOLS.file_operations) {
    globalToolRegistry.register(new FileOperationsTool());
  }
  if (ACTIVE_TOOLS.function_definition) {
    globalToolRegistry.register(new FunctionDefinitionTool());
  }
  if (ACTIVE_TOOLS.list_functions) {
    globalToolRegistry.register(new ListFunctionsTool());
  }
  if (ACTIVE_TOOLS.execute_custom_function) {
    globalToolRegistry.register(new ExecuteCustomFunctionTool());
  }
  if (ACTIVE_TOOLS.code_interpreter) {
    globalToolRegistry.register(new CodeInterpreterTool());
  }
  if (ACTIVE_TOOLS.image_generation) {
    globalToolRegistry.register(new ImageGenerationTool());
  }
  if (ACTIVE_TOOLS.gpt5_agent) {
    globalToolRegistry.register(new GPT5AgentTool());
  }

  console.error(`Registered ${globalToolRegistry.listAvailableTools().length} built-in tools`);
}

// Helper function to enable/disable tools easily
export function setToolStatus(toolName: keyof typeof ACTIVE_TOOLS, enabled: boolean) {
  (ACTIVE_TOOLS as any)[toolName] = enabled;
}