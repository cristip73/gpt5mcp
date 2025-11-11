---
description: Sumarizează un fișier folosind GPT-5 agent cu reasoning minimal
tags: [gpt5, summary]
---

Folosește gpt5_agent cu minimal reasoning să sumarizezi fișierul {{arg1}} (adaugă-l ca file_path la call) cu promptul:

"Sumarizeaza transcript pas cu pas, cu bullets si detalii. In indented bullet form. Add a relevant emoji in only front of each first-level step. Dont use '---' separators. Give just the summary with no intro or outro text. Write in Romanian"

Setări obligatorii:
- reasoning_effort: "minimal"
- display_in_chat: false
- save_to_file: true
- save_format: "clean"
- output_filename: extrage numele fișierului din {{arg1}} (doar basename, fără path) și adaugă "_summary" înainte de extensie (ex: "file.md" → "file_summary.md")
