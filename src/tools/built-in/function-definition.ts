import { Tool, ToolExecutionContext, ToolResult } from '../base.js';

interface FunctionDefinitionArgs {
  name: string;
  description: string;
  parameters: Record<string, any>;
  implementation: string;
}

interface DefinedFunction {
  name: string;
  description: string;
  parameters: Record<string, any>;
  implementation: string;
  created_at: string;
}

// Simple in-memory storage for defined functions
const definedFunctions = new Map<string, DefinedFunction>();

export class FunctionDefinitionTool extends Tool {
  name = 'define_function';
  description = 'Define custom functions that can be used in subsequent conversations';
  type = 'function' as const;

  parameters = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the function to define',
        pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$'
      },
      description: {
        type: 'string',
        description: 'Description of what the function does'
      },
      parameters: {
        type: 'object',
        description: 'JSON Schema for function parameters'
      },
      implementation: {
        type: 'string',
        description: 'JavaScript implementation of the function'
      }
    },
    required: ['name', 'description', 'parameters', 'implementation'],
    additionalProperties: false
  };

  async execute(args: FunctionDefinitionArgs, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const { name, description, parameters, implementation } = args;
      
      console.error(`Defining function: ${name}`);

      // Basic validation
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        throw new Error('Function name must be a valid identifier');
      }

      // Validate implementation is valid JavaScript (basic check)
      try {
        new Function('args', implementation);
      } catch (error) {
        throw new Error(`Invalid JavaScript implementation: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Store the function definition
      const functionDef: DefinedFunction = {
        name,
        description,
        parameters,
        implementation,
        created_at: new Date().toISOString()
      };

      definedFunctions.set(name, functionDef);

      const result = `Successfully defined function '${name}':
Description: ${description}
Parameters: ${JSON.stringify(parameters, null, 2)}

The function is now available for use in future tool calls.`;

      return {
        tool_call_id: `define_function_${Date.now()}`,
        output: result,
        status: 'success',
        metadata: {
          function_name: name,
          created_at: functionDef.created_at,
          total_functions: definedFunctions.size
        }
      };

    } catch (error) {
      console.error('Function definition error:', error);
      return {
        tool_call_id: `define_function_error_${Date.now()}`,
        output: '',
        error: `Function definition failed: ${error instanceof Error ? error.message : String(error)}`,
        status: 'error'
      };
    }
  }
}

// Tool to list defined functions
export class ListFunctionsTool extends Tool {
  name = 'list_functions';
  description = 'List all currently defined custom functions';
  type = 'function' as const;

  parameters = {
    type: 'object',
    properties: {},
    additionalProperties: false
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (definedFunctions.size === 0) {
        return {
          tool_call_id: `list_functions_${Date.now()}`,
          output: 'No custom functions are currently defined.',
          status: 'success',
          metadata: { function_count: 0 }
        };
      }

      const functionsList = Array.from(definedFunctions.values())
        .map(func => `• **${func.name}**: ${func.description} (created: ${func.created_at})`)
        .join('\n');

      const result = `Defined custom functions (${definedFunctions.size}):\n\n${functionsList}`;

      return {
        tool_call_id: `list_functions_${Date.now()}`,
        output: result,
        status: 'success',
        metadata: { function_count: definedFunctions.size }
      };

    } catch (error) {
      console.error('List functions error:', error);
      return {
        tool_call_id: `list_functions_error_${Date.now()}`,
        output: '',
        error: `Failed to list functions: ${error instanceof Error ? error.message : String(error)}`,
        status: 'error'
      };
    }
  }
}

// Tool to execute defined functions
export class ExecuteCustomFunctionTool extends Tool {
  name = 'execute_function';
  description = 'Execute a previously defined custom function';
  type = 'function' as const;

  parameters = {
    type: 'object',
    properties: {
      function_name: {
        type: 'string',
        description: 'Name of the function to execute'
      },
      arguments: {
        type: 'object',
        description: 'Arguments to pass to the function'
      }
    },
    required: ['function_name'],
    additionalProperties: false
  };

  async execute(args: { function_name: string; arguments?: Record<string, any> }, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const { function_name, arguments: funcArgs = {} } = args;
      
      const functionDef = definedFunctions.get(function_name);
      if (!functionDef) {
        throw new Error(`Function '${function_name}' is not defined`);
      }

      console.error(`Executing custom function: ${function_name}`);

      // Create and execute the function
      // Use eval to execute the complete function declaration then call it
      const functionCode = `
        ${functionDef.implementation}
        ${function_name}(${JSON.stringify(funcArgs)});
      `;
      const result = eval(functionCode);

      return {
        tool_call_id: `execute_function_${Date.now()}`,
        output: `Result of ${function_name}(${JSON.stringify(funcArgs)}):\n${String(result)}`,
        status: 'success',
        metadata: {
          function_name,
          executed_at: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Custom function execution error:', error);
      return {
        tool_call_id: `execute_function_error_${Date.now()}`,
        output: '',
        error: `Function execution failed: ${error instanceof Error ? error.message : String(error)}`,
        status: 'error'
      };
    }
  }
}