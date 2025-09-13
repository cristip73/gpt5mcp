import { Tool, ToolExecutionContext, ToolResult } from '../base.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

interface CodexFileItem {
  path: string;
  label?: string;
}

interface GPT5CodexArgs {
  // Required
  task: string;

  // Optional Model/Config
  model?: string; // e.g., gpt-5, gpt-5-chat-latest
  profile?: string;
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high';
  verbosity?: 'low' | 'medium' | 'high';

  // Permissions / Modes
  edit_mode?: 'research' | 'auto_edit' | 'full_auto' | 'dangerous';

  // Inputs
  file_path?: string; // absolute; will be inlined for text; images attached via -i
  files?: CodexFileItem[]; // multiple inputs
  images?: string[]; // absolute paths to images to pass via -i

  // Features
  enable_web_search?: boolean;

  // Output controls
  save_to_file?: boolean;
  display_in_chat?: boolean;

  // Exec
  timeout_sec?: number;
}

export class GPT5CodexTool extends Tool {
  name = 'gpt5_codex';
  description = 'Run Codex CLI in headless exec mode to perform tasks with optional web search';
  type = 'function' as const;

  parameters = {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'Task prompt for Codex CLI exec' },
      model: { type: 'string', description: 'Model id, e.g., gpt-5, gpt-5-chat-latest', default: 'gpt-5' },
      profile: { type: 'string', description: 'Codex CLI config profile' },
      reasoning_effort: {
        type: 'string',
        enum: ['minimal', 'low', 'medium', 'high'],
        description: 'Reasoning depth hint mapped to -c model_reasoning_effort',
        default: 'medium'
      },
      verbosity: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Text verbosity mapped to -c text.verbosity'
      },
      edit_mode: {
        type: 'string',
        enum: ['research', 'auto_edit', 'full_auto', 'dangerous'],
        description: 'Autonomy/sandbox mapping for Codex CLI',
        default: 'auto_edit'
      },
      file_path: { type: 'string', description: 'Absolute path to a file (text will be inlined; images will be attached)' },
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            label: { type: 'string' }
          },
          required: ['path'],
          additionalProperties: false
        },
        description: 'Multiple input files'
      },
      images: { type: 'array', items: { type: 'string' }, description: 'Image paths to pass with -i' },
      enable_web_search: { type: 'boolean', description: 'Enable model-side web search via -c tools.web_search=true', default: false },
      save_to_file: { type: 'boolean', description: 'Save final output to gpt5_docs', default: true },
      display_in_chat: { type: 'boolean', description: 'Return the content inline in chat', default: true },
      timeout_sec: { type: 'number', description: 'Timeout for Codex process in seconds', default: 300 }
    },
    required: ['task'],
    additionalProperties: false
  };

  private isImageFile(p: string) {
    const ext = path.extname(p).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
  }

  private async inlineTextFile(absPath: string, label?: string): Promise<string> {
    const stats = await fs.stat(absPath);
    const maxSize = 100 * 1024; // 100KB per file
    if (stats.size > maxSize) {
      throw new Error(`Text file too large to inline: ${absPath} is ${(stats.size / 1024).toFixed(1)}KB (max 100KB)`);
    }
    const content = await fs.readFile(absPath, 'utf8');
    const title = label || path.basename(absPath);
    return `\n\n<file>\npath: ${absPath}\nlabel: ${title}\ncontent:\n${content}\n</file>`;
  }

  private mapEditMode(editMode?: GPT5CodexArgs['edit_mode']): string[] {
    // Map our tool's edit_mode to Codex CLI approval/sandbox flags.
    // Both approval (-a) and sandbox (-s) are global flags
    switch (editMode) {
      case 'auto_edit':
        return ['-a', 'on-request', '-s', 'workspace-write'];
      case 'full_auto':
        return ['-a', 'never', '-s', 'workspace-write'];
      case 'dangerous':
        // Use the explicit bypass flag for full, unsandboxed access
        return ['--dangerously-bypass-approvals-and-sandbox'];
      case 'research':
      default:
        return ['-a', 'untrusted', '-s', 'read-only'];
    }
  }

  private mapReasoningEffort(effort?: GPT5CodexArgs['reasoning_effort']): string | undefined {
    if (!effort) return undefined;
    const mapped = effort === 'minimal' ? 'low' : effort;
    return `model_reasoning_effort=${mapped}`;
  }

  private async saveOutput(task: string, output: string, meta: { model?: string; execMs: number; editMode: string; }): Promise<{ filePath: string; fileSize: number }> {
    const dir = path.join(process.cwd(), 'gpt5_docs');
    await fs.mkdir(dir, { recursive: true });
    const slug = task.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
    const now = new Date();
    const name = `agent_${now.toISOString().replace(/[:.]/g, '-').slice(0,19)}_${slug || 'task'}.md`;
    const filePath = path.join(dir, name);

    const content = [
      `## 🤖 GPT-5 Codex Task Completed`,
      '',
      `**Task**: ${task}`,
      `**Model**: ${meta.model || 'gpt-5'}`,
      `**Mode**: ${meta.editMode}`,
      `**Execution Time**: ${(meta.execMs/1000).toFixed(1)}s`,
      '',
      `### 📝 Result`,
      output.trim() || '(empty)',
      '',
      `*Generated: ${now.toISOString()}*`
    ].join('\n');

    await fs.writeFile(filePath, content, 'utf8');
    const stats = await fs.stat(filePath);
    return { filePath: path.relative(process.cwd(), filePath), fileSize: stats.size };
  }

  async execute(args: GPT5CodexArgs, _context: ToolExecutionContext): Promise<ToolResult> {
    const start = Date.now();
    const {
      task,
      model = 'gpt-5',
      profile,
      reasoning_effort = 'medium',
      verbosity,
      edit_mode = 'auto_edit',
      file_path,
      files,
      images,
      enable_web_search = false,
      save_to_file = true,
      display_in_chat = true,
      timeout_sec = 300
    } = args;

    try {
      // Build the full prompt with inlined text files
      let prompt = task;

      const processedFiles = new Set<string>();
      if (file_path) {
        const abs = file_path;
        if (this.isImageFile(abs)) {
          // Images are passed via -i; no inline
        } else {
          prompt += await this.inlineTextFile(abs);
        }
        processedFiles.add(abs);
      }
      if (files && files.length > 0) {
        let totalText = 0;
        for (const f of files) {
          const abs = f.path;
          if (processedFiles.has(abs)) continue;
          if (this.isImageFile(abs)) {
            // skip inline, will attach
          } else {
            const stats = await fs.stat(abs);
            const maxTotal = 200 * 1024; // 200KB total inline cap
            if (totalText + stats.size > maxTotal) {
              throw new Error(`Total text file size exceeds 200KB when inlining: ${abs}`);
            }
            prompt += await this.inlineTextFile(abs, f.label);
            totalText += stats.size;
          }
          processedFiles.add(abs);
        }
      }

      // Build CLI args
      const cli: string[] = [];
      // Web search
      if (enable_web_search) {
        cli.push('-c', 'tools.web_search=true');
      }
      // Edit mode - both approval and sandbox are global flags
      cli.push(...this.mapEditMode(edit_mode));
      // Model & profile
      if (model) cli.push('-m', model);
      if (profile) cli.push('-p', profile);
      // Reasoning effort / verbosity
      const r = this.mapReasoningEffort(reasoning_effort);
      if (r) cli.push('-c', r);
      if (verbosity) cli.push('-c', `text.verbosity=${verbosity}`);
      // Images will be added to exec subcommand, not global

      // Exec subcommand and last message capture
      // If save_to_file is requested, capture the last message directly under gpt5_docs
      // to avoid writing to temp dirs.
      const outDir = path.join(process.cwd(), 'gpt5_docs');
      if (save_to_file) {
        try { await fs.mkdir(outDir, { recursive: true }); } catch {}
      }
      const lastMsgPath = save_to_file
        ? path.join(outDir, `.codex_last_${Date.now()}.txt`)
        : path.join(os.tmpdir(), `.codex_last_${Date.now()}.txt`);
      // Build exec args with images
      const execArgs = ['exec', '--skip-git-repo-check'];

      // Check for images - known Codex CLI limitation with exec mode
      const imagePaths: string[] = [];
      if (images && images.length > 0) imagePaths.push(...images);
      if (file_path && this.isImageFile(file_path)) imagePaths.push(file_path);
      if (files) {
        for (const f of files) {
          if (this.isImageFile(f.path)) imagePaths.push(f.path);
        }
      }

      // Known issue: Codex CLI exec mode has problems with images (GitHub #2323, #2473)
      // It may hang or fall back to interactive mode when -i flag is used
      if (imagePaths.length > 0) {
        const execMs = Date.now() - start;
        const warningMsg = `## ⚠️ Known Limitation\n\n` +
          `Codex CLI exec mode has known issues with image attachments (GitHub #2323, #2473).\n` +
          `The CLI may hang or fall back to interactive mode when images are attached.\n\n` +
          `**Workaround options:**\n` +
          `- Use Codex interactively for image tasks\n` +
          `- Use a different model/tool for image analysis\n` +
          `- Wait for a Codex CLI update that fixes this issue\n\n` +
          `**Images attempted:** ${imagePaths.join(', ')}\n`;

        return {
          tool_call_id: `codex_img_limitation_${Date.now()}`,
          output: warningMsg,
          status: 'error',
          error: 'Codex CLI exec mode does not reliably support image attachments',
          metadata: {
            model,
            edit_mode,
            execution_time_ms: execMs,
            images: imagePaths
          }
        };
      }

      // No longer add images to exec args since they cause issues
      // for (const img of imagePaths) {
      //   execArgs.push('-i', img);
      // }

      execArgs.push('--output-last-message', lastMsgPath, prompt);

      const fullArgs = [...cli, ...execArgs];

      // Spawn process (allow overriding codex binary via env)
      const codexBin = process.env.CODEX_BIN && process.env.CODEX_BIN.trim().length > 0
        ? process.env.CODEX_BIN
        : 'codex';
      const proc = spawn(codexBin, fullArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      let stderr = '';
      // Drain to avoid blocking
      proc.stdout.on('data', () => {});
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      const exitCode: number = await new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          proc.kill('SIGKILL');
          resolve(-1);
        }, Math.max(1, timeout_sec) * 1000);
        proc.on('error', (e) => { clearTimeout(t); reject(e); });
        proc.on('close', (code) => { clearTimeout(t); resolve(code ?? 0); });
      });

      // Read last message file
      let finalOutput = '';
      try {
        finalOutput = (await fs.readFile(lastMsgPath, 'utf8')).trim();
      } catch {
        // fallback: if no last message, include stderr hint
        finalOutput = '';
      } finally {
        // Best-effort cleanup only if we wrote to tmp
        if (!save_to_file) {
          try { await fs.unlink(lastMsgPath); } catch {}
        }
      }

      const execMs = Date.now() - start;

      // Build response text
      const header = `## 🤖 GPT-5 Codex Task Completed\n\n`+
        `**Task**: ${task}\n`+
        `**Model**: ${model}\n`+
        `**Mode**: ${edit_mode}\n`+
        `**Execution Time**: ${(execMs/1000).toFixed(1)}s\n\n`;

      let body: string;
      if (exitCode === -1) {
        body = `### ⏱️ Timeout\nProcess exceeded ${Math.max(1, timeout_sec)}s and was terminated.\n\n${stderr ? 'Stderr:\n'+stderr : ''}\n\n`;
      } else if (finalOutput && finalOutput.length > 0) {
        body = `### 📝 Result\n${finalOutput}\n\n`;
      } else {
        body = `### ⚠️ Note\nNo final message captured from Codex.\n\n${stderr ? 'Stderr:\n'+stderr : ''}\n\n`;
      }

      let result = header + body;

      // Optionally save to file
      let fileInfo: { filePath: string; fileSize: number } | null = null;
      if (save_to_file) {
        try {
          fileInfo = await this.saveOutput(task, finalOutput || '(empty)', { model, execMs, editMode: edit_mode });
          result += `📄 Saved to: ${fileInfo.filePath}\n`;
        } catch (e) {
          // keep going
        }
      }

      // Display in chat control
      if (!display_in_chat) {
        const metaLines = [
          '✅ Task completed successfully',
          `Model: ${model}`,
          `Execution: ${(execMs/1000).toFixed(1)}s`,
          `Mode: ${edit_mode}`
        ];
        if (fileInfo) {
          metaLines.splice(1, 0, `📄 Output saved to: ${fileInfo.filePath}`, `File size: ${(fileInfo.fileSize/1024).toFixed(1)} KB`);
          metaLines.push('\n📖 Read the file only if instructed for full content');
        } else {
          metaLines.push('\nℹ️ Content suppressed by display_in_chat=false');
        }
        result = metaLines.join('\n');
      }

      return {
        tool_call_id: `codex_${Date.now()}`,
        output: result,
        status: exitCode === 0 ? 'success' : (exitCode === -1 ? 'timeout' : 'error'),
        metadata: {
          model,
          edit_mode,
          exit_code: exitCode,
          execution_time_ms: execMs,
        }
      };

    } catch (error) {
      return {
        tool_call_id: `codex_error_${Date.now()}`,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        status: 'error'
      };
    }
  }
}
