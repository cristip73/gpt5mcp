import { Tool, ToolExecutionContext, ToolResult } from '../base.js';
import fetch from 'node-fetch';

interface CodeInterpreterArgs {
  code: string;
  language?: 'python' | 'javascript';
  timeout?: number;
}

interface OpenAIResponsesAPIRequest {
  model: string;
  input: Array<{
    role: 'user';
    content: string;
  }>;
  tools: Array<{
    type: 'code_interpreter';
    container?: Record<string, any>;
  }>;
  max_output_tokens?: number;
  stream?: boolean;
}

interface OpenAICodeInterpreterOutput {
  type: 'code_interpreter_call';
  input: string;
  output?: string;
  error?: string;
}

export class CodeInterpreterTool extends Tool {
  name = 'code_interpreter';
  description = 'Execute code in OpenAI\'s secure hosted environment (Python or JavaScript)';
  type = 'code_interpreter' as const;

  parameters = {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'The code to execute in OpenAI\'s hosted environment'
      },
      language: {
        type: 'string',
        enum: ['python', 'javascript'],
        description: 'Programming language (default: python). Note: Executed in OpenAI\'s hosted sandbox.',
        default: 'python'
      },
      timeout: {
        type: 'number',
        description: 'Request timeout in seconds (default: 30)',
        minimum: 1,
        maximum: 120,
        default: 30
      }
    },
    required: ['code'],
    additionalProperties: false
  };

  async execute(args: CodeInterpreterArgs, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const { code, language = 'python', timeout = 30 } = args;
      
      console.error(`Code interpreter: executing ${language} code via OpenAI hosted environment`);

      // Validate code length
      if (code.length > 10000) {
        throw new Error('Code is too long (max 10000 characters for hosted execution)');
      }

      if (code.trim().length === 0) {
        throw new Error('Code cannot be empty');
      }

      // Prepare the prompt based on language
      let prompt: string;
      if (language === 'python') {
        prompt = `Execute this Python code and provide the output:\n\n\`\`\`python\n${code}\n\`\`\``;
      } else if (language === 'javascript') {
        prompt = `Execute this JavaScript code and provide the output:\n\n\`\`\`javascript\n${code}\n\`\`\``;
      } else {
        throw new Error(`Unsupported language: ${language}. Supported: python, javascript`);
      }

      // Prepare request for OpenAI Responses API with code interpreter
      const requestBody: OpenAIResponsesAPIRequest = {
        model: 'gpt-4o', // Use GPT-4o for best code interpreter support
        input: [
          {
            role: 'user',
            content: prompt
          }
        ],
        tools: [
          {
            type: 'code_interpreter',
            container: {
              type: 'auto'
            }
          }
        ],
        max_output_tokens: 4000,
        stream: false
      };

      console.error('Making OpenAI Responses API request for code execution:', {
        model: requestBody.model,
        language,
        code_length: code.length,
        has_tools: true
      });

      // Make API request to OpenAI's hosted code interpreter
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${context.apiKey}`,
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `OpenAI Responses API error: ${response.status} ${response.statusText}`;
        
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

      const data = await response.json() as any;
      console.error('OpenAI Responses API response received');
      console.error('Full response data:', JSON.stringify(data, null, 2));

      // Extract code execution results
      let executionOutput = '';
      let executionError = '';
      let hasCodeExecution = false;

      // Parse the response for code interpreter output  
      if (data.output && Array.isArray(data.output)) {
        for (const item of data.output) {
          console.error('Found output item:', { type: item.type, id: item.id, status: item.status });
          
          // Check various possible code interpreter response types
          if (item.type === 'code_interpreter_call' || 
              item.type === 'message' && item.content && Array.isArray(item.content)) {
            
            if (item.type === 'code_interpreter_call') {
              hasCodeExecution = true;
              console.error('Found code_interpreter_call in response');
              
              if (item.output) {
                executionOutput += item.output;
              }
              if (item.error) {
                executionError += item.error;
              }
            }
            
            // Also check message content for code execution results
            if (item.type === 'message' && item.content) {
              for (const contentItem of item.content) {
                console.error('Content item:', { type: contentItem.type });
                if (contentItem.type === 'code_interpreter_call' || 
                    contentItem.type === 'code_execution' ||
                    contentItem.code || contentItem.output) {
                  hasCodeExecution = true;
                  console.error('Found code execution in message content');
                  
                  if (contentItem.output) {
                    executionOutput += contentItem.output;
                  }
                  if (contentItem.error) {
                    executionError += contentItem.error;
                  }
                }
              }
            }
          }
        }
      }

      // Also check the main output text for code execution results
      let finalOutput = '';
      if (data.output_text) {
        finalOutput = data.output_text;
      }

      // Format the result
      let result = '';
      
      if (hasCodeExecution) {
        result = `🐍 **Code Execution Results** (OpenAI Hosted Environment)\n\n`;
        result += `**Language**: ${language}\n`;
        result += `**Code Length**: ${code.length} characters\n\n`;
        
        if (executionOutput) {
          result += `**Output**:\n\`\`\`\n${executionOutput.trim()}\n\`\`\`\n\n`;
        }
        
        if (executionError) {
          result += `**Errors**:\n\`\`\`\n${executionError.trim()}\n\`\`\`\n\n`;
        }
        
        if (finalOutput && finalOutput !== executionOutput) {
          result += `**Analysis**:\n${finalOutput}\n`;
        }
        
        if (!executionOutput && !executionError) {
          result += `**Status**: Code executed successfully with no output.\n`;
        }
        
        result += `\n✅ **Executed in OpenAI's secure hosted environment**`;
      } else if (finalOutput) {
        // Fallback: Model processed the code but didn't execute it via code interpreter
        result = `📝 **Code Analysis** (No Execution)\n\n`;
        result += `**Language**: ${language}\n\n`;
        result += `**Response**: ${finalOutput}\n\n`;
        result += `⚠️  **Note**: Code was analyzed but not executed. Try with simpler code or check syntax.`;
      } else {
        result = `❌ **No Execution Results**\n\nThe code interpreter tool did not return any execution results. This may indicate:\n- Code syntax issues\n- Unsupported operations\n- API limitations\n\nPlease check your code and try again.`;
      }

      return {
        tool_call_id: `code_interpreter_${Date.now()}`,
        output: result,
        status: (hasCodeExecution && !executionError) ? 'success' : (executionError ? 'error' : 'success'),
        metadata: {
          language,
          hosted_execution: true,
          code_length: code.length,
          has_output: !!executionOutput,
          has_errors: !!executionError,
          model_used: 'gpt-4o',
          execution_environment: 'OpenAI Hosted'
        }
      };

    } catch (error) {
      console.error('Code interpreter error:', error);
      
      let errorMessage = error instanceof Error ? error.message : String(error);
      
      // Handle common error types
      if (errorMessage.includes('rate_limit_exceeded')) {
        errorMessage = 'Rate limit exceeded for code execution. Please wait a moment before trying again.';
      } else if (errorMessage.includes('insufficient_quota')) {
        errorMessage = 'Insufficient quota for code execution. Please check your OpenAI account usage.';
      } else if (errorMessage.includes('model_not_found')) {
        errorMessage = 'Code interpreter model not available. Please try again later.';
      } else if (errorMessage.includes('content_policy_violation')) {
        errorMessage = 'Code execution blocked by content policy. Please ensure your code follows OpenAI\'s usage guidelines.';
      }

      return {
        tool_call_id: `code_interpreter_error_${Date.now()}`,
        output: '',
        error: `Code execution failed: ${errorMessage}`,
        status: 'error',
        metadata: {
          language: args.language || 'python',
          hosted_execution: true,
          error_type: 'api_error'
        }
      };
    }
  }
}