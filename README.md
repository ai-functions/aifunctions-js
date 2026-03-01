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

### 3) Use it

```ts
import { createClient } from "nx-ai-api";

const ai = createClient({
  backend: "llama-cpp",
  llamaCpp: {
    modelPath: "./models/tinyllama.gguf",
    contextSize: 4096,
    threads: 6,
  },
});

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
  transformersjs: {
    modelId: string,
    cacheDir?: string,
    device?: "cpu"
  }
})
```

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

## Security notes

* Never commit `.env`
* Don't log your OpenRouter key
* Prefer setting attribution headers so your app is identifiable in OpenRouter analytics.

---

## FAQ

### Why `max_completion_tokens`?

OpenRouter recommends `max_completion_tokens`; `max_tokens` is deprecated.

### Will token counts match between OpenRouter and local?

No. Tokenization varies by model/backend. `nx-ai-api` normalizes the *shape* of usage; the numbers are backend-specific.
