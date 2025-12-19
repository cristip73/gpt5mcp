---
description: Send a task to GPT-5 Codex via subagent
argument-hint: [task description] [output file path]
---

Lansează un subagent (model: haiku) care să trimită la mcp__gpt5-server__gpt5_codex:

```
task: "[task description]. Write output to [output file path]"
edit_mode: "auto_edit"
```

Instrucțiuni pentru subagent:
- NU citi rezultatul de la Codex
- NU folosi alte tool-uri
- Returnează doar o confirmare de un rând
