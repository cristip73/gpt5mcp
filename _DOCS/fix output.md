Got it—this is almost certainly a parsing mismatch with the **Responses API** JSON, not the model.

## TL;DR (what’s wrong)

* **`output_text` is SDK-only.** If you’re doing raw `fetch/axios`, that field won’t exist. It’s added by OpenAI’s official SDK objects as a convenience. ([OpenAI Platform][1])
* The **actual text** for non-tool runs is in **`response.output[i].content[j]` where `content[j].type === "output_text"`** → use its `.text`. The `output` array can contain multiple items (messages, tool calls, reasoning summaries, etc.). Don’t assume a single item. ([OpenAI Platform][2])

---

## What the real response looks like (non-tool, non-streaming)

A typical success looks like this (simplified):

```json
{
  "id": "resp_abc123",
  "object": "response",
  "model": "gpt-5",
  "status": "completed",
  "output": [
    {
      "id": "msg_xyz",
      "type": "message",
      "role": "assistant",
      "content": [
        { "type": "output_text", "text": "100", "annotations": [] }
      ]
    }
  ],
  "usage": {
    "input_tokens": 54,
    "output_tokens": 7,
    "output_tokens_details": { "reasoning_tokens": 0 },
    "total_tokens": 61
  }
}
```

Key points:

* **Text lives at** `output[*].content[*].text` where `content[*].type === "output_text"`.
* `status` is usually `"completed"` on success; if you ever see `"incomplete"`, check `incomplete_details`. ([OpenAI Platform][3])

---

## Drop-in parsing fix

Update your extraction logic (your lines \~320–401) to this shape:

```ts
function extractOutputText(resp: any): string | null {
  // 1) SDK convenience (present only if you're using official SDK objects)
  if (typeof resp?.output_text === "string" && resp.output_text.trim()) {
    return resp.output_text;
  }

  // 2) Raw Responses API shape
  if (Array.isArray(resp?.output)) {
    const chunks: string[] = [];
    for (const item of resp.output) {
      if (item?.type === "message" && (item.role === "assistant" || !item.role)) {
        const parts = Array.isArray(item.content) ? item.content : [];
        for (const part of parts) {
          // canonical text location
          if (part?.type === "output_text" && typeof part.text === "string") {
            chunks.push(part.text);
          }
          // (defensive) handle any unexpected plain-text parts
          if (part?.type === "text" && typeof part.text === "string") {
            chunks.push(part.text);
          }
        }
      }
    }
    const text = chunks.join("");
    if (text.trim()) return text;
  }

  // 3) Fallback for Chat Completions responses (if someone swaps endpoints)
  if (Array.isArray(resp?.choices) && resp.choices.length) {
    const ch = resp.choices[0];
    if (ch?.message?.content) return ch.message.content;
    if (typeof ch?.text === "string") return ch.text;
  }

  return null;
}
```

Then use it in your tool:

```ts
const text = extractOutputText(data);
if (!text) {
  // optional: include diagnostic context for logs
  console.warn("No output_text found. status=%s output_len=%s", data?.status, data?.output?.length);
}
```

**Why this works**

* The Responses API puts **all model output items in `output[]`**, and for plain text, each content part is **`{ type: "output_text", text: "…" }`**. The **SDK-only** `output_text` just concatenates those for you; raw HTTP won’t have it. ([OpenAI Platform][3])

---

## Optional hardening (recommended)

* **Guard on status:** only show the “completed” banner if `data.status === "completed"`. Otherwise surface `incomplete_details` in your ⚠️ Note. ([OpenAI Platform][4])
* **Multiple assistant messages:** If the model emits multiple assistant `message` items (e.g., after tools), concatenating all `output_text` parts is correct. The docs caution that **`output` can have multiple heterogeneous items**. ([OpenAI Platform][2])
* **Reasoning models:** You may see `usage.output_tokens_details.reasoning_tokens`. That’s normal and doesn’t change where the user-visible text lives. ([OpenAI Platform][4])

---

## Sanity tests (non-streaming)

```ts
// Simple math
await gpt5_agent({ task: "What is 25 + 75?", reasoning_effort: "minimal", verbosity: "low" });
// Expect "100" in Result, usage shows tiny output

// With reasoning (still same extraction)
await gpt5_agent({ task: "Explain why 2+2=4", reasoning_effort: "high", verbosity: "high" });

// With tools (web search, etc.)
await gpt5_agent({ task: "Search for weather in Paris", enable_web_search: true });
```

If you ever switch to **streaming**, the data arrives as events like `response.output_text.delta` and finishes with `response.output_text.done`. In that case you’d build the text incrementally and **still** end up with the same structure at the end. ([LobeHub][5])

---

## References (key bits)

* **“`output_text` is SDK-only convenience”** and **“use `output[]` in raw JSON”**: OpenAI docs (Text generation guide & API intro). ([OpenAI Platform][2])
* **“`output` often has more than one item”**: OpenAI docs (Text guide / Prompt engineering). ([OpenAI Platform][2])
* **Response status `completed` / `incomplete`**: API ref & reasoning guide. ([OpenAI Platform][3])

---

### After this change

Your original example will render:

```
## 🤖 GPT-5 Agent Task Completed
**Task**: What is 50 + 50?
**Model**: gpt-5
**Iterations**: 1

### 📝 Result
100

### 📊 Token Usage
- Input: 54 tokens
- Output: 7 tokens
```

If you’d like, I can sketch a tiny unit test around `extractOutputText()` with canned fixtures for:

* plain non-tool response,
* multi-message output,
* Chat Completions fallback,
* incomplete status with `incomplete_details`.

[1]: https://platform.openai.com/docs/api-reference/introduction?utm_source=chatgpt.com "API Reference - OpenAI API"
[2]: https://platform.openai.com/docs/guides/text?utm_source=chatgpt.com "Text generation - OpenAI API"
[3]: https://platform.openai.com/docs/api-reference/responses?utm_source=chatgpt.com "API Reference"
[4]: https://platform.openai.com/docs/guides/reasoning?utm_source=chatgpt.com "Reasoning models - OpenAI API"
[5]: https://lobehub.com/blog/openai-responses-api-intergration?utm_source=chatgpt.com "OpenAI Responses API Integration and Agent Transformation"
