# nx-ai-api

One tiny API for **remote LLMs (OpenRouter)** and **local CPU LLMs (GGUF via llama.cpp)**:

* `ask("instruction") -> { text, usage }`
* **Library Functions**: `callAI`, `matchLists`, `extractTopics`, and more (via `/functions`)
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

## Library Functions (`nx-ai-api/functions`)

`nx-ai-api` ships a set of utility functions for guaranteed JSON output from an LLM — importable via the `nx-ai-api/functions` sub-path.

### Features

- **Guaranteed JSON**: Instructions and sanitization ensure parseable JSON.
- **Type Safe**: Strong typing of LLM responses.
- **Mode**: `matchLists`, `extractTopics`, `extractEntities`, `summarize`, and `classify` accept optional `mode?: "weak" | "strong"`. Default is `"strong"`. Use `"weak"` for smaller or local models (shorter instructions, lower temperature).

### Setup

Library functions use the **OpenRouter** client by default. Set `OPENROUTER_API_KEY` in your `.env`, or pass a custom `client` (e.g. from `createClient({ backend: "llama-cpp" })`).

```env
OPENROUTER_API_KEY=sk-or-...
```

### Install `dotenv` if needed

```bash
npm i dotenv
```

---

### `matchLists` — Semantic List Matching

Intelligently matches items from two lists based on semantic similarity and naming.

```ts
import { matchLists } from "nx-ai-api/functions";

const result = await matchLists({
  list1: source,
  list2: target,
  guidance: "Match by name, accepting close variants.",
  mode: "strong",  // optional: "weak" | "strong"
});
```

---

### `extractTopics` — Topic Extraction

Extracts key topics from the provided text.

```ts
import { extractTopics } from "nx-ai-api/functions";

const { topics } = await extractTopics({ 
  text: "Very long article about space exploration and NASA's next missions...",
  maxTopics: 3,
  mode: "strong",  // optional: "weak" | "strong"
});
```

---

### `extractEntities` — Named Entity Extraction

Extracts named entities (People, Organizations, Locations, etc.) from the text.

```ts
import { extractEntities } from "nx-ai-api/functions";

const { entities } = await extractEntities({ 
  text: "Apple was founded by Steve Jobs in Cupertino.",
  mode: "strong",  // optional: "weak" | "strong"
});
// [{ name: "Apple", type: "Organization" }, { name: "Steve Jobs", type: "Person" }, ...]
```

---

### `summarize` — Text Summarization

Generates a concise summary and key points.

```ts
import { summarize } from "nx-ai-api/functions";

const { summary, keyPoints } = await summarize({ 
  text: "...content...",
  length: "brief",  // "brief" | "medium" | "detailed"
  mode: "strong",   // optional: "weak" | "strong"
});
```

---

### `classify` — Text Classification

Classifies text into one or more provided categories.

```ts
import { classify } from "nx-ai-api/functions";

const { categories } = await classify({ 
  text: "I am having trouble with my subscription.",
  categories: ["Billing", "Technical Support", "General Inquiry"],
  mode: "strong",  // optional: "weak" | "strong"
});
```

---

### `sentiment` — Sentiment Analysis

Analyzes the sentiment (positive, negative, or neutral).

```ts
import { sentiment } from "nx-ai-api/functions";

const { sentiment: label, score } = await sentiment({ 
  text: "This is the best product ever!" 
});
```

---

### `translate` — Translation

Translates text to a target language.

```ts
import { translate } from "nx-ai-api/functions";

const { translatedText } = await translate({ 
  text: "Hello, how are you?",
  targetLanguage: "French" 
});
```

---

### `rank` — Relevance Ranking

Ranks a list of items based on a query.

```ts
import { rank } from "nx-ai-api/functions";

const { rankedItems } = await rank({
  items: products,
  query: "Affordable noise-cancelling headphones"
});
```

---

### `cluster` — Semantic Clustering

Groups a list of items into semantic clusters.

```ts
import { cluster } from "nx-ai-api/functions";

const { clusters } = await cluster({
  items: userFeedbackList,
  numClusters: 3
});
```

> [!TIP]
> **Flexible Schema**: For list operations (`matchLists`, `rank`, `cluster`), the structure of objects in your lists does not matter. The AI uses semantic similarity across all available fields.


---

## Testing

Build, then run tests:

```bash
npm run build && npm run test
```

- **Mocked tests** (`test/openrouter.parse.test.ts`, `test/openrouter.request.test.ts`, `test/functions.callAI.test.ts`): No API key required; they stub the client or HTTP.
- **Live tests** (`test/library.live.test.ts`, `test/matchLists.live.test.ts`): Hit the real API. Set `OPENROUTER_API_KEY` in `.env` (or pass a `client` that uses your preferred backend) so library function tests can run.

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

