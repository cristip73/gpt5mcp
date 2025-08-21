import { Tool, ToolExecutionContext, ToolResult } from '../base.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

interface CodeInterpreterArgs {
  code: string;
  language?: 'python' | 'javascript' | 'nodejs';
  timeout?: number;
}

export class CodeInterpreterTool extends Tool {
  name = 'code_interpreter';
  description = 'Execute code in a secure environment (Python or JavaScript/Node.js)';
  type = 'code_interpreter' as const;

  parameters = {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'The code to execute'
      },
      language: {
        type: 'string',
        enum: ['python', 'javascript', 'nodejs'],
        description: 'Programming language (default: python)',
        default: 'python'
      },
      timeout: {
        type: 'number',
        description: 'Execution timeout in seconds (default: 10, max: 30)',
        minimum: 1,
        maximum: 30,
        default: 10
      }
    },
    required: ['code'],
    additionalProperties: false
  };

  private async executeCode(code: string, language: string, timeout: number): Promise<{ stdout: string; stderr: string; success: boolean }> {
    const tempDir = '/tmp';
    const sessionId = randomUUID();
    
    let command: string;
    let args: string[];
    let fileExtension: string;
    let tempFile: string;

    // Prepare execution environment based on language
    switch (language) {
      case 'python':
        fileExtension = '.py';
        command = 'python3';
        break;
      case 'javascript':
      case 'nodejs':
        fileExtension = '.js';
        command = 'node';
        break;
      default:
        throw new Error(`Unsupported language: ${language}`);
    }

    tempFile = path.join(tempDir, `code_${sessionId}${fileExtension}`);

    try {
      // Write code to temporary file
      await fs.writeFile(tempFile, code, 'utf8');
      args = [tempFile];

      return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        
        console.error(`Executing ${language} code in ${tempFile}`);
        
        const childProcess = spawn(command, args, {
          timeout: timeout * 1000,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PYTHONPATH: '/tmp', // Restrict Python path
            NODE_PATH: '/tmp'   // Restrict Node path
          }
        });

        childProcess.stdout.on('data', (data: any) => {
          stdout += data.toString();
        });

        childProcess.stderr.on('data', (data: any) => {
          stderr += data.toString();
        });

        childProcess.on('close', (code: any) => {
          resolve({
            stdout,
            stderr,
            success: code === 0
          });
        });

        childProcess.on('error', (error: any) => {
          resolve({
            stdout,
            stderr: stderr + error.message,
            success: false
          });
        });

        // Handle timeout
        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill('SIGKILL');
            resolve({
              stdout,
              stderr: stderr + 'Execution timed out',
              success: false
            });
          }
        }, timeout * 1000 + 1000);
      });

    } finally {
      // Cleanup: Remove temporary file
      try {
        await fs.unlink(tempFile);
      } catch (error) {
        console.error('Failed to cleanup temp file:', error);
      }
    }
  }

  async execute(args: CodeInterpreterArgs, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const { code, language = 'python', timeout = 10 } = args;
      
      console.error(`Code interpreter: executing ${language} code`);
      
      // Basic security checks
      if (code.length > 10000) {
        throw new Error('Code is too long (max 10000 characters)');
      }

      // Restricted patterns (basic security)
      const restrictedPatterns = [
        /import\s+os/gi,
        /import\s+subprocess/gi,
        /import\s+sys/gi,
        /require\s*\(\s*['"]fs['"]/gi,
        /require\s*\(\s*['"]child_process['"]/gi,
        /exec\s*\(/gi,
        /eval\s*\(/gi,
        /file\s*\(/gi,
        /open\s*\(/gi
      ];

      for (const pattern of restrictedPatterns) {
        if (pattern.test(code)) {
          throw new Error('Code contains restricted operations');
        }
      }

      const result = await this.executeCode(code, language, timeout);
      
      let output = '';
      if (result.stdout) {
        output += `Output:\n${result.stdout}\n`;
      }
      if (result.stderr) {
        output += `Errors:\n${result.stderr}\n`;
      }
      
      if (!output) {
        output = 'Code executed successfully with no output.';
      }

      return {
        tool_call_id: `code_interpreter_${Date.now()}`,
        output: output.trim(),
        status: result.success ? 'success' : 'error',
        metadata: {
          language,
          execution_time: timeout,
          exit_code: result.success ? 0 : 1
        }
      };

    } catch (error) {
      console.error('Code interpreter error:', error);
      return {
        tool_call_id: `code_interpreter_error_${Date.now()}`,
        output: '',
        error: `Code execution failed: ${error instanceof Error ? error.message : String(error)}`,
        status: 'error'
      };
    }
  }
}