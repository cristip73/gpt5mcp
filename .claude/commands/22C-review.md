---
description: Code review via Codex (GPT-5) - output în fișier
argument-hint: [output_file.md]
---

`Locatia fișierului de output` (sau alte detalii): $ARGUMENTS

Daca nu exista locatie specificata va crea in /_PLAN/code_review/code_review_[numar_faza]_codex.md


---

Lansează un subagent care să trimită la mcp__gpt5-server__gpt5_codex (cu numele modelului care sa-l foloseasca in tool call, sau fara alte argumente daca nu e specificat):

```
task: "Code Review pentru faza curentă.

CONTEXT:
- Plan general: _PLAN/PLAN.md
- Criterii fază: _PLAN/phases/phase-[X].json
- Rulează git diff pentru a vedea ce s-a schimbat

TASK:
1. Citește git diff pentru a vedea ce s-a schimbat
2. Verifică dacă implementarea îndeplinește TOATE criteriile din JSON si Plan.md
3. Evaluează calitatea codului:
   - Urmează patterns-urile existente din repo?
   - Se integrează bine în arhitectura generală?
   - Există code smells, duplicări, sau îmbunătățiri evidente?
4. Verifică security basics (no hardcoded secrets, input validation unde e cazul)

OUTPUT FORMAT:
## Verdict: PASS / NEEDS_WORK

## Criterii Îndeplinite
- [x] Criteriul 1: [comentariu]
- [ ] Criteriul 2: [ce lipsește]

## Observații Calitate Cod
[comentarii despre patterns, integrare, big picture]

## Îmbunătățiri Recomandate
[lista de îmbunătățiri, dacă există]

## Blockers (dacă NEEDS_WORK)
[ce TREBUIE corectat înainte de a continua]

Write output to `locatia fișierului de output`
edit_mode: "auto_edit"
```

Instrucțiuni pentru subagent:
- TREBUIE să faci DOAR apelul la mcp__gpt5-server__gpt5_codex
- NU citi rezultatul de la Codex
- NU folosi alte tool-uri (nici Bash, nici Read, nimic altceva)
- Dacă NU poți apela mcp__gpt5-server__gpt5_codex, răspunde DOAR: "Nu am putut apela tool-ul MCP."
- NU încerca să faci code review-ul singur dacă MCP nu merge. Returnează doar o confirmare de un rând.
- IMPORTANT: cand trimiti la mcp__gpt5-server__gpt5_codex, trimiti doar promptul, fara alte argumente. Spui in prompt unde vrei sa fie outputul.