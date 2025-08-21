import { Tool, ToolExecutionContext, ToolResult } from '../base.js';
import { promises as fs } from 'fs';
import path from 'path';

interface FileOperationArgs {
  operation: 'read' | 'write' | 'list' | 'delete' | 'exists';
  path: string;
  content?: string;
  encoding?: 'utf8' | 'base64';
}

export class FileOperationsTool extends Tool {
  name = 'file_operations';
  description = 'Perform file system operations: read, write, list, delete files and directories';
  type = 'function' as const;

  parameters = {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['read', 'write', 'list', 'delete', 'exists'],
        description: 'The file operation to perform'
      },
      path: {
        type: 'string',
        description: 'The file or directory path'
      },
      content: {
        type: 'string',
        description: 'Content to write (required for write operation)'
      },
      encoding: {
        type: 'string',
        enum: ['utf8', 'base64'],
        description: 'File encoding (default: utf8)',
        default: 'utf8'
      }
    },
    required: ['operation', 'path'],
    additionalProperties: false
  };

  private validatePath(filePath: string): { isValid: boolean; error?: string } {
    // Security checks
    const normalizedPath = path.normalize(filePath);
    
    // Prevent path traversal attacks
    if (normalizedPath.includes('..')) {
      return { isValid: false, error: 'Path traversal not allowed' };
    }

    // Restrict to safe directories (can be configured)
    const allowedPaths = [
      process.cwd(),
      '/tmp',
      '/var/tmp'
    ];

    const isInAllowedPath = allowedPaths.some(allowedPath => 
      normalizedPath.startsWith(path.normalize(allowedPath))
    );

    if (!isInAllowedPath) {
      return { isValid: false, error: 'Access to this path is not allowed' };
    }

    return { isValid: true };
  }

  async execute(args: FileOperationArgs, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const { operation, path: filePath, content, encoding = 'utf8' } = args;
      
      console.error(`File operation: ${operation} on ${filePath}`);

      // Validate path for security
      const pathValidation = this.validatePath(filePath);
      if (!pathValidation.isValid) {
        throw new Error(pathValidation.error);
      }

      const resolvedPath = path.resolve(filePath);
      let result = '';

      switch (operation) {
        case 'read': {
          try {
            const fileContent = await fs.readFile(resolvedPath, encoding);
            result = `File content of ${filePath}:\n\n${fileContent}`;
          } catch (error) {
            throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
          }
          break;
        }

        case 'write': {
          if (!content) {
            throw new Error('Content is required for write operation');
          }
          try {
            // Ensure directory exists
            const dir = path.dirname(resolvedPath);
            await fs.mkdir(dir, { recursive: true });
            
            await fs.writeFile(resolvedPath, content, encoding);
            result = `Successfully wrote ${content.length} characters to ${filePath}`;
          } catch (error) {
            throw new Error(`Failed to write file: ${error instanceof Error ? error.message : String(error)}`);
          }
          break;
        }

        case 'list': {
          try {
            const stats = await fs.stat(resolvedPath);
            if (stats.isDirectory()) {
              const files = await fs.readdir(resolvedPath, { withFileTypes: true });
              const fileList = files.map(file => {
                const type = file.isDirectory() ? 'directory' : 'file';
                return `${type}: ${file.name}`;
              }).join('\n');
              result = `Contents of directory ${filePath}:\n\n${fileList}`;
            } else {
              const fileStats = await fs.stat(resolvedPath);
              result = `File info for ${filePath}:\nSize: ${fileStats.size} bytes\nModified: ${fileStats.mtime.toISOString()}`;
            }
          } catch (error) {
            throw new Error(`Failed to list directory: ${error instanceof Error ? error.message : String(error)}`);
          }
          break;
        }

        case 'delete': {
          try {
            const stats = await fs.stat(resolvedPath);
            if (stats.isDirectory()) {
              await fs.rmdir(resolvedPath, { recursive: true });
              result = `Successfully deleted directory ${filePath}`;
            } else {
              await fs.unlink(resolvedPath);
              result = `Successfully deleted file ${filePath}`;
            }
          } catch (error) {
            throw new Error(`Failed to delete: ${error instanceof Error ? error.message : String(error)}`);
          }
          break;
        }

        case 'exists': {
          try {
            const stats = await fs.stat(resolvedPath);
            const type = stats.isDirectory() ? 'directory' : 'file';
            result = `${filePath} exists as a ${type}`;
          } catch (error) {
            result = `${filePath} does not exist`;
          }
          break;
        }

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      return {
        tool_call_id: `file_op_${Date.now()}`,
        output: result,
        status: 'success',
        metadata: {
          operation,
          path: filePath,
          encoding,
          resolved_path: resolvedPath
        }
      };

    } catch (error) {
      console.error('File operation error:', error);
      return {
        tool_call_id: `file_op_error_${Date.now()}`,
        output: '',
        error: `File operation failed: ${error instanceof Error ? error.message : String(error)}`,
        status: 'error'
      };
    }
  }
}