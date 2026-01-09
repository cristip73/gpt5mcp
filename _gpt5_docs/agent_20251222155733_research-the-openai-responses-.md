# Task:
Research the OpenAI Responses API file/context limits for GPT-5 and GPT-5.1 models. Specifically:
1. What is the maximum context window size for gpt-5.1?
2. What are the actual file size limits when passing files to the API?
3. Is 100KB a reasonable limit for text files, or can we go higher?
4. What are the token limits for input?
5. Are there any official documentation or rate limits related to file attachments?

Focus on the Responses API (not Chat Completions) as that's what we're using.

## Full Output
Here’s what’s currently documented for GPT‑5 and GPT‑5.1 when used via the **Responses API** (as of December 22, 2025).

I’ll go through your questions one by one and then give some practical recommendations.

---

## 1. Max context window size for `gpt-5.1`

From the official **GPT‑5.1 model page**, `gpt-5.1` has:

- **Context window:** **400,000 tokens**
- **Max output tokens (`max_output_tokens`):** **128,000** ([platform.openai.com](https://platform.openai.com/docs/models/gpt-5.1))  

This is a *combined* limit (input + output + tool results + system messages, etc.). So for a single Responses API call:

```text
all_input_tokens
+ all_tool_output_tokens
+ requested_output_tokens
<= 400,000
```

`gpt-5` has the same numbers:

- **Context window:** 400,000 tokens  
- **Max output tokens:** 128,000 ([platform.openai.com](https://platform.openai.com/docs/models/gpt-5))  

So for both GPT‑5 and GPT‑5.1 via **`/v1/responses`**, treat 400k as your overall per‑request token budget.

---

## 2. “Actual” file size limits when passing files to the API (Responses API)

There are three relevant layers of limits:

### 2.1. Files API (general upload limits)

If you upload files first and then reference them via `file_id` in Responses:

- **Per file via `/v1/files`:** up to **512 MB**
- **Total size of all files per *organization*:** up to **1 TB** (though see project-level limit below) ([platform.openai.com](https://platform.openai.com/docs/api-reference/files?utm_source=openai))  

From the file storage quota article:

- **Total file storage per *project*:** **100 GB** (across all your stored files, used by Assistants, Responses file search, etc.) ([help.openai.com](https://help.openai.com/en/articles/8724843-file-storage-quota-errors-for-api-users?utm_source=openai))  

So: Files API itself allows large files (hundreds of MB), but storage is capped at ~100 GB per project by default.

---

### 2.2. Direct *file inputs* into the Responses API (`type: "input_file"`)

For **file inputs used directly in `responses.create`** (e.g., PDFs attached as `input_file`), the **File inputs** guide is more restrictive:

- **Each file:** must be **< 50 MB**
- **Total content across *all* files in a single Responses API request:** **≤ 50 MB** ([platform.openai.com](https://platform.openai.com/docs/guides/pdf-files))  

That applies whether you:

- Attach via `file_id` (after uploading through `/v1/files`),
- Use an external `file_url`,
- Or inline Base64 (`file_data`) in the JSON body.

So:

> **For direct attachments to a single Responses request, think “≤ 50 MB per file, ≤ 50 MB total in the request.”**

You can store larger files (up to 512 MB) in `/v1/files`, but you can’t *feed* more than 50 MB at once into a single GPT‑5/5.1 Responses call via `input_file`.

---

### 2.3. File Search tool / vector stores (used from Responses)

If you’re using **`file_search`** (vector stores) as a tool in Responses, the limits are:

From the Assistants v2 / File Search FAQ (which now also applies via the Responses API’s file search tool):

- **512 MB per file**
- **5 million tokens per file** (i.e., size of the *text* in the file after parsing)
- **10,000 files per vector store**
- **100 GB of stored files per project** (same project‑level storage quota) ([help.openai.com](https://help.openai.com/en/articles/8550641-assistants-api-v2-faq%23.eot?utm_source=openai))  

Note: For file search, the whole file isn’t injected into context. The tool chunks it (default: 800‑token chunks with 400‑token overlap) and only a small number of chunks (default: 20) get pulled into the model context per query. ([platform.openai.com](https://platform.openai.com/docs/guides/tools-file-search/?utm_source=openai))  

So even very large files can live in the vector store, but each query only brings a limited slice into the 400k context window.

---

## 3. Is 100 KB a reasonable limit for text files, or can you go higher?

Short answer: **100 KB is extremely conservative. You can safely allow text files that are *orders of magnitude* larger.**

### 3.1. How 100 KB compares in tokens

Rough rule of thumb (from OpenAI’s token guide): ([help.openai.com](https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-to-count-them%C3%82%C2%A0?utm_source=openai))  

- 1 token ≈ 4 characters of English text  
- 100 KB ≈ 100,000 characters  
- So 100 KB ≈ 25,000 tokens (very roughly)

Against a **400,000‑token context window**, 25k tokens is tiny – about **6%** of your total budget, leaving plenty of room for:

- Other user messages,
- System instructions,
- Retrieved file_search content,
- The model’s answer (up to 128k tokens if you really want).

### 3.2. How high can you go *practically*?

For **plain text that you send directly as `input_text`** (not as `input_file`):

- If you send **~1 MB** of fairly dense English text:
  - 1 MB ≈ 1,000,000 characters ≈ 250,000 tokens (ballpark).
  - Still within the 400k context window, but now you leave only ~150k for everything else (prior messages, tool outputs, model response, reasoning tokens).

For **files used via `input_file`**:

- Each file can be up to **50 MB** in a single Responses request (per File inputs guide). ([platform.openai.com](https://platform.openai.com/docs/guides/pdf-files))  
- BUT: PDFs cost *extra* tokens, because the model sees both extracted text *and* an image of each page. That makes 50 MB a *very* large amount of context in practice.

For **file_search / vector stores**:

- Each file can be up to **512 MB / 5M tokens**, far beyond anything you’d want to put directly into a prompt. ([help.openai.com](https://help.openai.com/en/articles/8550641-assistants-api-v2-faq%23.eot?utm_source=openai))  
- But each query only brings a limited number of chunks (e.g. 20 × 800 tokens = 16k tokens by default) into the context.

### 3.3. A reasonable app‑level limit

If you’re designing **your own limit** for user‑uploaded text files that you’ll feed directly into a GPT‑5.1 Responses call, I’d recommend:

- **If you treat the whole file as direct prompt text** (or a single `input_file` you expect to be fully consumed):
  - Something like **1–2 MB per request** is usually the comfortable upper bound.
  - 2 MB of dense English text is roughly near or above the 400k‑token limit; you’ll often want less.

- **If you plan to index text in a vector store and use `file_search`:**
  - You can set a user‑facing limit more like **5–10 MB** per file (or even higher), since only small retrieved chunks go into context.
  - The official limit is much higher (512 MB and 5M tokens per file), but you may want to stay well under that for UX/performance.

So: **100 KB is absolutely safe, but unnecessarily strict.** If your UX can handle it, moving to **1–5 MB per text file** is reasonable for most agentic / RAG workflows.

---

## 4. Token limits for input (GPT‑5 / GPT‑5.1 with Responses API)

For both GPT‑5 and GPT‑5.1: ([platform.openai.com](https://platform.openai.com/docs/models/gpt-5))  

- **Context window:** 400,000 tokens (combined input + output + tool output, etc.).
- **Max output tokens (`max_output_tokens`):** 128,000 (for GPT‑5 and GPT‑5.1; GPT‑5‑pro has a larger output cap of 272k but same 400k context). ([platform.openai.com](https://platform.openai.com/docs/models/gpt-5-pro?utm_source=openai))  

The Responses API doc notes that you control output length via `max_output_tokens`, but it doesn’t define a separate “max input tokens” parameter. The effective rule is:

```text
(input tokens) + (tool output tokens) + (requested max_output_tokens)
    <= model’s context window (400,000 for GPT-5 / GPT-5.1)
```

In practice:

- If you set `max_output_tokens` to its max (128k), you should aim to keep total input (prompt text, conversation history, file‑extracted text, tool outputs) under **~260–270k tokens**, leaving buffer for internal overhead.
- If your prompts and retrieved context are large, reduce `max_output_tokens` accordingly.

### 4.1. Throughput / rate limits (Tokens Per Minute)

Each model page also lists **TPM (tokens per minute)** by usage tier. For both `gpt-5` and `gpt-5.1`, typical documented limits are: ([platform.openai.com](https://platform.openai.com/docs/models/gpt-5))  

- **Tier 1:** 500,000 TPM
- **Tier 2:** 1,000,000 TPM
- **Tier 3:** 2,000,000 TPM
- **Tier 4:** 4,000,000 TPM
- **Tier 5:** 40,000,000 TPM  

These are *aggregate* input+output tokens per minute across your project for that model, not per request.

---

## 5. Official docs / rate limits specifically about file attachments

Here are the official docs and limits that relate directly to “file attachments” with the Responses API:

### 5.1. Files API

- **Files API reference:**  
  - Up to **512 MB per uploaded file** via `/v1/files`.
  - Up to **1 TB of total uploaded file size per organization** (though see project‑level 100 GB limit below). ([platform.openai.com](https://platform.openai.com/docs/api-reference/files?utm_source=openai))  

### 5.2. Project‑level storage quota (affects Responses + Assistants + file_search)

- **File storage quota errors for API users** (applies equally to Assistants and Responses file usage):  
  - **100 GB** of files **per project**.  
  - You’ll get an explicit error once this is exceeded. ([help.openai.com](https://help.openai.com/en/articles/8724843-file-storage-quota-errors-for-api-users?utm_source=openai))  

### 5.3. File inputs guide (for PDFs and other direct file inputs in Responses)

- **File inputs guide** (used with `/v1/responses`):  
  - You can pass files by `file_url`, `file_id`, or Base64 (`file_data`) as `type: "input_file"`.  
  - **Per‑request file size limits:**
    - Each file **< 50 MB**
    - Total file content per Responses API request **≤ 50 MB** ([platform.openai.com](https://platform.openai.com/docs/guides/pdf-files))  

This guide is the closest thing to “file attachment limits for the Responses API” itself.

### 5.4. File search / vector stores

- **Assistants API File Search FAQ** (now functionally shared with Responses’ `file_search` tool):  
  - **512 MB per file**
  - **5M tokens per file**
  - **10k files per vector store**
  - **100 GB per project** total storage ([help.openai.com](https://help.openai.com/en/articles/8550641-assistants-api-v2-faq%23.eot?utm_source=openai))  

- **File search tool guide**: covers how many chunks are retrieved (default 20), chunk sizes (800 tokens), etc., which indirectly affects how much of your files actually hits the model context in a query. ([platform.openai.com](https://platform.openai.com/docs/guides/tools-file-search/?utm_source=openai))  

### 5.5. ChatGPT file upload limits (UI — not API, but sometimes confused)

You *didn’t* ask about ChatGPT, but for completeness:

- Help Center articles on ChatGPT file uploads mention:
  - **512 MB per file**
  - **2M tokens per text/document file** in ChatGPT
  - CSVs/spreadsheets ≈ 50 MB
  - 20 MB per image
  - Per‑user and per‑org usage caps (10 GB / 100 GB in ChatGPT) ([help.openai.com](https://help.openai.com/en/articles/8983719-what-are-those-file-upload-size-restrictions%23.ejs?utm_source=openai))  

These apply to the **ChatGPT product**, not directly to the API, though the raw sizes look similar. For actual code integrations, rely on the Files API + File inputs + File search docs above.

### 5.6. Are there documented *rate limits* specifically for file uploads?

- The **Files API reference** doesn’t publish separate RPM/TPM for file uploads beyond the size/storage caps. ([platform.openai.com](https://platform.openai.com/docs/api-reference/files?utm_source=openai))  
- The documented **rate limits** are primarily per‑endpoint RPM/TPM for model calls (e.g., `gpt-5`, `gpt-5.1` token-per-minute limits; see models pages). ([platform.openai.com](https://platform.openai.com/docs/models/gpt-5))  
- For file uploads, the only *explicitly documented* constraints are:
  - Per‑file size,
  - Per‑file token limits (for some tools),
  - Per‑project or per‑org storage quotas.

So if you’re asking “Can I upload X files per minute?”: there’s no public hard numeric limit documented, other than the implicit platform‑side throttling you’ll see via 429s. For most apps, the dominant “file attachment” constraints are size and storage, not RPM.

---

## Practical recommendations for your Responses API integration

Putting this together for your use case (GPT‑5 / GPT‑5.1 with Responses):

1. **Context budgeting**
   - Assume **400k total tokens** per call.
   - Don’t push right to 400k; leave some headroom. E.g. design around **≤ 350k–375k** total tokens including retrieved file contexts and the model’s output.

2. **Text file limit choice**
   - If you *inline* text directly in `input_text`:
     - 100 KB is trivial; you can safely allow **1–2 MB** per request as long as you watch aggregate token counts.
   - If you’re dealing with many files or long history, a more conservative **512 KB – 1 MB per file** can be a nice compromise.

3. **File attachments via `input_file`**
   - Respect the **< 50 MB per file** and **< 50 MB per request** limits when calling Responses with attached files.
   - Remember that PDFs are expensive token-wise (both text + page images are included in context).

4. **Larger corpora**
   - For multi‑document knowledge bases, rely on:
     - **Files API** → store files (up to 512 MB each),
     - **Vector stores / file_search tool** → only small relevant chunks are injected into context.
   - This lets you keep your per‑request token usage manageable while handling very large sources.

If you tell me a bit more about how you plan to use the files (single big PDF per call vs many smaller text docs in a RAG system), I can propose concrete numeric limits (per file size, per request, and prompt truncation strategy) tuned to your use case.

---
*Generated: 2025-12-22T15:57:33.423Z | Response ID: resp_082700d015768abd00694969fb9af8819fb4c4852995b96a1d | Model: gpt-5.1 | Time: 114.5s | Iterations: 1 | Input: 39.9k | Output: 7.9k | Reasoning: 4.4k*