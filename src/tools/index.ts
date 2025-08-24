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

// Utility function to register all built-in tools
export function registerAllBuiltInTools() {
  // Register all built-in tools
  globalToolRegistry.register(new WebSearchTool());
  globalToolRegistry.register(new FileOperationsTool());
  globalToolRegistry.register(new FunctionDefinitionTool());
  globalToolRegistry.register(new ListFunctionsTool());
  globalToolRegistry.register(new ExecuteCustomFunctionTool());
  globalToolRegistry.register(new CodeInterpreterTool());
  globalToolRegistry.register(new ImageGenerationTool());
  globalToolRegistry.register(new GPT5AgentTool());

  console.error(`Registered ${globalToolRegistry.listAvailableTools().length} built-in tools`);
}