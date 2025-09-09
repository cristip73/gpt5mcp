# Plan: Adăugare File Append pentru GPT-5 Agent

## Analiza Actuală

### Structura Curentă
- Tool-ul `gpt5_agent` primește un `task` string și opțional un `context` string
- În linia 389-392, se construiește prompt-ul user astfel:
  ```typescript
  let userPrompt = task;
  if (taskContext) {
    userPrompt += `\n\nContext: ${taskContext}`;
  }
  ```
- Apoi în liniile 411-414 se trimite la API:
  ```typescript
  input: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]
  ```

## Soluție Propusă - Simplu și Eficient

### Opțiunea 1: Adăugare parametru `file_path` (RECOMANDATĂ)
- **Avantaje**: Simplu, direct, ușor de folosit
- **Implementare**:
  1. Adaugă parametru opțional `file_path` în schema tool-ului
  2. Citește conținutul fișierului dacă e specificat
  3. Îl adaugă la prompt cu un format clar

### Opțiunea 2: Adăugare parametru `files` array
- **Avantaje**: Poți trimite multiple fișiere
- **Dezavantaje**: Mai complex, poate nu e necesar acum

## Implementare Detaliată (Opțiunea 1)

### 1. Modificare Interface GPT5AgentArgs
```typescript
interface GPT5AgentArgs {
  // ... existing fields ...
  
  // Optional File Input
  file_path?: string;  // Absolute path to file to include in prompt
  file_label?: string; // Optional label for the file content (default: "File Content")
}
```

### 2. Modificare Schema Parameters
```typescript
parameters = {
  // ... existing parameters ...
  
  file_path: {
    type: 'string',
    description: 'Absolute path to a file whose content will be included in the prompt'
  },
  file_label: {
    type: 'string',
    description: 'Label for the file content in the prompt (default: "File Content")',
    default: 'File Content'
  }
}
```

### 3. Modificare Execute Method
În metoda `execute`, după ce se construiește `userPrompt`:

```typescript
// După linia 391-392
let userPrompt = task;
if (taskContext) {
  userPrompt += `\n\nContext: ${taskContext}`;
}

// ADĂUGARE NOUĂ:
if (args.file_path) {
  try {
    const fileContent = await fs.readFile(args.file_path, 'utf-8');
    const label = args.file_label || 'File Content';
    userPrompt += `\n\n## ${label}:\n\`\`\`\n${fileContent}\n\`\`\``;
  } catch (error) {
    throw new Error(`Failed to read file ${args.file_path}: ${error.message}`);
  }
}
```

### 4. Import fs Module
Verifică că avem import-ul necesar (pare că e deja prezent):
```typescript
import { promises as fs } from 'fs';
```

## Exemplu de Utilizare

După implementare, vom putea folosi astfel:

```javascript
// Exemplu 1: Analizează codul dintr-un fișier
{
  task: "Analyze this code and suggest improvements",
  file_path: "/path/to/code.ts",
  file_label: "Code to Review"
}

// Exemplu 2: Generează teste pentru un fișier
{
  task: "Generate comprehensive unit tests for this module",
  file_path: "/src/utils/calculator.js",
  file_label: "Module Source Code"
}

// Exemplu 3: Documentație din fișier
{
  task: "Create API documentation based on this OpenAPI spec",
  file_path: "/api/openapi.yaml",
  file_label: "OpenAPI Specification"
}
```

## Considerații

### 1. Limite de Dimensiune
- Ar trebui să verificăm dimensiunea fișierului înainte de citire
- Sugestie: limită de 100KB pentru început
```typescript
const stats = await fs.stat(args.file_path);
if (stats.size > 100 * 1024) {
  throw new Error(`File too large: ${(stats.size / 1024).toFixed(1)}KB (max: 100KB)`);
}
```

### 2. Tipuri de Fișiere
- Pentru început, acceptăm orice fișier text
- În viitor, putem adăuga suport pentru:
  - Imagini (base64 encoding)
  - PDFs (extract text)
  - Etc.

### 3. Securitate
- Validare că path-ul e absolut
- Nu permitem path traversal (../)
- Verificare existență fișier

## Pași de Implementare

1. ✅ Analiză cod existent (COMPLET)
2. ⬜ Modificare interface `GPT5AgentArgs`
3. ⬜ Actualizare schema parameters
4. ⬜ Implementare citire fișier în `execute()`
5. ⬜ Adăugare validări (dimensiune, securitate)
6. ⬜ Testare cu diferite tipuri de fișiere
7. ⬜ Build și verificare funcționalitate

## Beneficii

- **Simplu**: Un singur parametru nou, ușor de înțeles
- **Flexibil**: Poate fi folosit pentru orice tip de task care necesită conținut din fișier
- **Curat**: Nu modifică structura existentă, doar adaugă o funcționalitate opțională
- **Util**: Rezolvă multe cazuri de utilizare (code review, generare teste, analiză documente, etc.)