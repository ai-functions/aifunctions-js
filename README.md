# nx-ai-api

One tiny API for **remote LLMs (OpenRouter)** and **local CPU LLMs (GGUF via llama.cpp)**:

* `ask("instruction") -> { text, usage }`
* Returns tokens consistently (`prompt_tokens`, `completion_tokens`, `total_tokens`)
* OpenRouter provider routing via `vendor` preference
* Optional local backends (install only what you need)

OpenRouter uses an OpenAI-compatible Chat Completions endpoint and returns a usage object that can include token counts and cost details.

---

## Install

### Base (OpenRouter only)

```bash
npm i nx-ai-api
```

### Local CPU (GGUF) support

```bash
npm i nx-ai-api node-llama-cpp
```

`node-llama-cpp` provides Node.js bindings for `llama.cpp` to run GGUF models locally.

### Optional: Transformers.js backend

```bash
npm i nx-ai-api @huggingface/transformers
```

Transformers.js supports text generation tasks in JS/Node environments.

---

## Quickstart — OpenRouter (remote)

### 1) Add `.env`

```env
OPENROUTER_API_KEY=sk-or-...
# Optional attribution:
OPENROUTER_APP_URL=https://yourapp.example
OPENROUTER_APP_NAME=My App
```

### 2) Use it

```ts
import { createClient } from "nx-ai-api";

const ai = createClient({ backend: "openrouter" });

const res = await ai.ask("Write a 1-paragraph product tagline for a task manager.", {
  model: "openai/gpt-4o",
  vendor: ["openai", "anthropic"],
  maxTokens: 200,
  temperature: 0.7,
});

console.log(res.text);
console.log(res.usage);
```

---

## Quickstart — Local CPU (GGUF via llama.cpp)

### 1) Install backend

```bash
npm i node-llama-cpp
```

### 2) Download a GGUF model

Get a `.gguf` file and place it e.g. at `./models/tinyllama.gguf`.

### 3) Add `.env` (Optional)

```env
LLAMA_CPP_MODEL_PATH=./models/tinyllama.gguf
LLAMA_CPP_THREADS=6
```

### 4) Use it

```ts
import { createClient } from "nx-ai-api";

// If variables are in .env, no need to pass llamaCpp config:
const ai = createClient({ backend: "llama-cpp" });

// Or pass them explicitly:
// const ai = createClient({
//   backend: "llama-cpp",
//   llamaCpp: { modelPath: "./models/tinyllama.gguf" }
// });

const res = await ai.ask("Explain DNS in 3 bullets.", {
  maxTokens: 180,
  temperature: 0.2,
});

console.log(res.text);
console.log(res.usage);
```

---

## API

### `createClient(config)`

Creates a reusable client for a specific backend.

#### OpenRouter config

```ts
createClient({
  backend: "openrouter",
  openrouter: {
    apiKey?: string,
    baseUrl?: string,
    appUrl?: string,
    appName?: string,
    allowFallbacksDefault?: boolean
  }
})
```

#### Local llama.cpp config

```ts
createClient({
  backend: "llama-cpp",
  llamaCpp: {
    modelPath: string,
    contextSize?: number,
    threads?: number,
  }
})
```

#### Transformers.js config (optional)

```ts
createClient({
  backend: "transformersjs",
  transformersjs?: {
    modelId?: string,
    cacheDir?: string,
    device?: "cpu"
  }
})
```

If `TRANSFORMERS_JS_MODEL_ID` is set in `.env`, the `transformersjs` block can be omitted.

---

### `ask(instruction, options)`

```ts
type AskOptions = {
  maxTokens: number;
  temperature: number;
  model?: string;                 // OpenRouter only
  vendor?: string | string[];     // OpenRouter provider routing
  system?: string;                // optional system prompt
  timeoutMs?: number;            // default 60000
};
```

Returns:

```ts
type AskResult = {
  text: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    [k: string]: unknown;
  };
  model?: string;
  raw?: unknown;
};
```

---

## Provider routing (OpenRouter)

`vendor` controls provider preference order:

```ts
vendor: "openai"
// -> provider: { order: ["openai"], allow_fallbacks: true }

vendor: ["anthropic", "openai"]
// -> provider: { order: ["anthropic", "openai"], allow_fallbacks: true }
```

---

## Errors

All errors throw `NxAiApiError`:

* `code: "MISSING_ENV"` – missing `OPENROUTER_API_KEY`
* `code: "OPENROUTER_HTTP_ERROR"` – non-2xx from OpenRouter
* `code: "TIMEOUT"` – request exceeded `timeoutMs`
* `code: "MISSING_OPTIONAL_DEP"` – selected backend requires an extra package


---

## AI Functions

`nx-ai-api` ships a set of higher-level AI utilities that use the OpenAI Chat Completion API with guaranteed JSON output — importable via the `nx-ai-api/functions` sub-path.

### Setup

These helpers use **OpenAI directly** (not OpenRouter), so you need an `OPENAI_API_KEY` in your `.env`:

```env
OPENAI_API_KEY=sk-proj-...
```

### Install `dotenv` if needed

```bash
npm i dotenv
```

---

### `callOpenAI<T>` — Guaranteed JSON from OpenAI

A generic wrapper around OpenAI Chat Completions that always returns parsed JSON.

```ts
import "dotenv/config";
import { callOpenAI } from "x-llm";

const result = await callOpenAI<{ sentiment: string; score: number }>({
  model: "gpt-4o-mini",
  instructions: "You are a sentiment analyzer. Always respond in JSON with keys: sentiment, score.",
  prompt: "Analyze: 'I absolutely love this product!'",
});

console.log(result.data.sentiment); // "positive"
console.log(result.usage);          // { promptTokens, completionTokens, totalTokens }
console.log(result.finishReason);   // "stop"
```

> [!IMPORTANT]
> Always include the word **"JSON"** in your `instructions` or `prompt` when using `json_object` response format.

> [!TIP]
> Reasoning models (`o1`, `o3`, `gpt-5-*`) automatically switch to `max_completion_tokens` and skip `temperature` / `response_format` — the helper detects this automatically.

---

### `matchLists` — Semantic List Matching

Intelligently matches items from two lists based on semantic similarity and naming.

```ts
import "dotenv/config";
import { matchLists } from "nx-ai-api/functions";

const source = [
  { id: 1, name: "Apple" },
  { id: 2, name: "Banana" },
];
const target = [
  { item: "Apple", category: "Fruit" },
  { item: "Tropical Banana", category: "Fruit" },
  { item: "Carrot", category: "Vegetable" },
];

const result = await matchLists({
  list1: source,
  list2: target,
  guidance: "Match by name, accepting close variants.",
});

console.log(result.matches);
// [
//   { source: { id: 1, name: "Apple" }, target: { item: "Apple", ... }, reason: "Exact name match" },
//   { source: { id: 2, name: "Banana" }, target: { item: "Tropical Banana", ... }, reason: "Name variant" }
// ]

console.log(result.unmatched); // items from list1 with no confident match
```

#### Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `list1` | `any[]` | ✅ | Source list — every item here gets a match attempt |
| `list2` | `any[]` | ✅ | Target list to match against |
| `guidance` | `string` | ✅ | Natural language rules for the AI to follow |
| `model` | `string` | — | OpenAI model (default: `gpt-4o-mini`) |
| `additionalInstructions` | `string` | — | Extra instructions appended to the system prompt |

#### Return value

```ts
{
  matches: Array<{
    source: any;   // full object from list1
    target: any;   // full object from list2
    reason?: string;
  }>;
  unmatched: any[]; // list1 items with no confident target
}
```

> [!TIP]
> **Flexible Schema**: The structure of objects in your lists does not matter. The AI uses semantic similarity across all available fields to find matches. If your structures are complex or ambiguous, use the `guidance` parameter to provide specific matching rules.
> By default, the AI ignores arbitrary IDs (like UUIDs or auto-increment integers) unless they explicitly match between lists.

---

## Security notes

* Never commit `.env`
* Don't log your OpenRouter or OpenAI key
* Prefer setting attribution headers so your app is identifiable in OpenRouter analytics.

---

## FAQ

### Why `max_completion_tokens`?

OpenRouter recommends `max_completion_tokens`; `max_tokens` is deprecated.

### Will token counts match between OpenRouter and local?

No. Tokenization varies by model/backend. `nx-ai-api` normalizes the *shape* of usage; the numbers are backend-specific.

