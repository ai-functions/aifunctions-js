Below is a **low-level spec + full README draft** for an npm package named **`nx-ai-api`** that supports:

* **OpenRouter (remote)**: `instruction -> response text + usage/tokens (+ cost when provided)`
* **Local CPU models (optional)** via **llama.cpp bindings** (GGUF) and optionally **Transformers.js** (WASM/ONNX)

OpenRouter pieces are based on their OpenAI-compatible **Chat Completions** API, provider routing, auth headers, and usage object/cost fields. ([OpenRouter][1])

---

# nx-ai-api — Detailed Spec (v1)

## 0) Summary

**Package name:** `nx-ai-api`
**Purpose:** Minimal, consistent `ask()` API for *one-shot instructions* across:

* Remote LLMs via OpenRouter Chat Completions endpoint. ([OpenRouter][1])
* Local CPU inference using GGUF models via `llama.cpp` (Node bindings). ([npm][2])

**Core promise:** same caller experience (string in → text + usage out), backend chosen once per client.

## 1) Goals / Non-goals

### Goals

1. `ask(instruction: string, options) -> { text, usage, model, raw? }`
2. Always require generation controls:

   * `maxTokens`
   * `temperature`
3. For OpenRouter: also require

   * `model` (OpenRouter model slug like `author/slug`)
   * `vendor` (provider routing preference)
4. Reads OpenRouter key from `.env` (`OPENROUTER_API_KEY`) and sets bearer auth header. ([OpenRouter][3])
5. Returns token usage:

   * OpenRouter: pass through `usage` (prompt/completion/total + cost fields when present). ([OpenRouter][4])
   * Local: compute tokens via backend tokenizer and return normalized usage.

### Non-goals (v1)

* Streaming responses (SSE)
* Tool calling / function calling
* Multi-turn chat history (beyond a single optional system prompt)
* Image inputs
* Guaranteed identical tokenization across backends (will differ)

## 2) Runtime requirements

* **Node.js:** `>= 18` (uses built-in `fetch` / `AbortController`)
* **TypeScript:** first-class types, shipped `.d.ts`
* **Build outputs:** ESM + CJS + types

## 3) Public API

### 3.1 `createClient()`

```ts
export type BackendKind = "openrouter" | "llama-cpp" | "transformersjs";

export type Client = {
  ask(instruction: string, opts: AskOptions): Promise<AskResult>;
};

export function createClient(config: CreateClientOptions): Client;
```

### 3.2 Types

```ts
export type AskOptions = {
  maxTokens: number;        // completion token cap
  temperature: number;      // typically 0..2
  // OpenRouter only:
  model?: string;           // e.g. "openai/gpt-4o" or any OpenRouter model slug
  vendor?: string | string[]; // provider routing preference
  // Optional:
  system?: string;          // optional system prompt
  timeoutMs?: number;       // default 60_000
};

export type AskResult = {
  text: string;
  usage: Usage;
  model?: string;           // actual model used if known
  raw?: unknown;            // full backend response (opt-in)
};

export type Usage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  // pass-through / backend-specific extras
  [k: string]: unknown;
};
```

### 3.3 `CreateClientOptions`

```ts
export type CreateClientOptions =
  | {
      backend: "openrouter";
      openrouter?: {
        apiKey?: string;        // optional override; else env OPENROUTER_API_KEY
        baseUrl?: string;       // default "https://openrouter.ai/api/v1"
        appUrl?: string;        // maps to HTTP-Referer (optional)
        appName?: string;       // maps to X-OpenRouter-Title (optional)
        allowFallbacksDefault?: boolean; // default true
      };
    }
  | {
      backend: "llama-cpp";
      llamaCpp: {
        modelPath: string;    // path to .gguf
        contextSize?: number; // default 4096
        threads?: number;     // default: os.cpus().length-1 (min 1)
      };
    }
  | {
      backend: "transformersjs";
      transformersjs: {
        modelId: string;      // HF model id
        cacheDir?: string;    // local cache folder
        device?: "cpu";       // v1: cpu only
      };
    };
```

## 4) OpenRouter backend spec

### 4.1 Endpoint / compatibility

* Uses OpenRouter “OpenAI-compatible” chat completions endpoint:
  `POST https://openrouter.ai/api/v1/chat/completions` ([OpenRouter][1])

### 4.2 Authentication

* Header: `Authorization: Bearer ${OPENROUTER_API_KEY}` ([OpenRouter][3])
* Optional attribution headers:

  * `HTTP-Referer: <app url>`
  * `X-OpenRouter-Title: <app name>` ([OpenRouter][5])

### 4.3 Request body mapping

Given `ask(instruction, opts)`:

* `messages`:

  * if `opts.system` provided → include `{ role:"system", content: opts.system }`
  * always include `{ role:"user", content: instruction }`
* `model`: `opts.model` (required for OpenRouter)
* `temperature`: `opts.temperature`
* `max_completion_tokens`: `opts.maxTokens` (preferred; `max_tokens` is deprecated) ([OpenRouter][1])
* Provider routing:

  * if `opts.vendor` provided:

    * if string → `provider: { order: [vendor], allow_fallbacks: <bool> }`
    * if string[] → `provider: { order: vendor, allow_fallbacks: <bool> }`
  * `allow_fallbacks` defaults to `allowFallbacksDefault ?? true` ([OpenRouter][6])

**Note on naming:** OpenRouter’s docs call this provider routing / provider selection and describe using a `provider` object for chat completions. ([OpenRouter][6])

### 4.4 Response parsing

Parse JSON response:

* `text` = `response.choices?.[0]?.message?.content ?? ""` ([OpenRouter][1])
* `usage` = `response.usage ?? { prompt_tokens:0, completion_tokens:0, total_tokens:0 }`

  * OpenRouter usage may include extra fields like token details and `cost`. ([OpenRouter][4])
* `model` = `response.model` if present

### 4.5 Error handling

If response status is not 2xx:

* throw `NxAiApiError` with:

  * `name = "NxAiApiError"`
  * `code = "OPENROUTER_HTTP_ERROR"`
  * `status` = HTTP status
  * `details` = parsed response body (JSON if possible; else text)

Timeout:

* Use `AbortController` and throw:

  * `code = "TIMEOUT"`

## 5) Local CPU backend: llama.cpp via `node-llama-cpp`

### 5.1 Dependency model

`node-llama-cpp` is an **optional dependency** (not required for OpenRouter users). ([npm][2])
The underlying runtime is `llama.cpp`, aimed at local inference with minimal setup across hardware. ([GitHub][7])

### 5.2 Model format

* Accepts **GGUF** model files on disk (`.gguf`).
* `modelPath` must be provided at client creation.

### 5.3 Lifecycle (important)

Local inference requires loading the model into memory:

* Load once in `createClient({ backend:"llama-cpp", ... })`
* Reuse across `ask()` calls

### 5.4 Prompt format (v1)

To keep it consistent and simple:

* Build a single string prompt:

If `system` exists:

```
[System]
{system}

[User]
{instruction}

[Assistant]
```

Else:

```
[User]
{instruction}

[Assistant]
```

*(v1 is intentionally simple; you can later add “chat template” support per model.)*

### 5.5 Generation parameters

Map:

* `maxTokens` → max new tokens
* `temperature` → sampling temperature

### 5.6 Token accounting (local)

Return usage normalized to:

* `prompt_tokens`: count from backend tokenizer on the final prompt string
* `completion_tokens`: count from backend tokenizer on generated text
* `total_tokens`: sum

**Caveat:** tokenization differs by model/backend; numbers won’t match OpenRouter. That’s expected.

### 5.7 Errors

* If `node-llama-cpp` is not installed and backend is selected → throw:

  * `code = "MISSING_OPTIONAL_DEP"`
  * message: `Install "node-llama-cpp" to use backend "llama-cpp".`

## 6) Local CPU backend: Transformers.js (optional)

This backend is “no native builds” oriented. Transformers.js supports text generation tasks and runs in JS environments (Node supported), using WASM/CPU paths when configured. ([Hugging Face][8])

### 6.1 Dependency model

* optional dependency: `@huggingface/transformers`

### 6.2 Model resolution

* `modelId` refers to a Hugging Face model id.
* Package should support an explicit `cacheDir` so users can keep it offline-friendly.

### 6.3 Token accounting

* Prefer tokenizer-based counting if available from the pipeline/tokenizer.
* If not available, fallback to approximate counts (documented as approximate).

## 7) Environment variables

### OpenRouter (remote)

* `OPENROUTER_API_KEY` (required unless provided in `createClient.openrouter.apiKey`) ([OpenRouter][3])
* Optional:

  * `OPENROUTER_APP_URL` → mapped to `HTTP-Referer` header ([OpenRouter][5])
  * `OPENROUTER_APP_NAME` → mapped to `X-OpenRouter-Title` header ([OpenRouter][5])

## 8) Package layout (recommended)

```
nx-ai-api/
  src/
    index.ts
    core/
      types.ts
      errors.ts
      timeout.ts
      usage.ts
    backends/
      openrouter.ts
      llamaCpp.ts
      transformersjs.ts
    env.ts
  test/
    openrouter.parse.test.ts
    openrouter.request.test.ts
    llamaCpp.usage.test.ts (optional)
  tsup.config.ts
  tsconfig.json
  package.json
  README.md
  .env.example
```

## 9) Exports / build

* `exports`:

  * `"."`: ESM + CJS + types
* `sideEffects: false`
* Ship types and sourcemaps.

## 10) Quality gates

* Lint + typecheck in CI
* Tests:

  * request-body mapping (`max_completion_tokens`, provider routing)
  * response parsing (`choices[0].message.content`, `usage`)
  * error mapping for non-2xx

---

# README.md (Draft)

## nx-ai-api

One tiny API for **remote LLMs (OpenRouter)** and **local CPU LLMs (GGUF via llama.cpp)**:

* `ask("instruction") -> { text, usage }`
* Returns tokens consistently (`prompt_tokens`, `completion_tokens`, `total_tokens`)
* OpenRouter provider routing via `vendor` preference
* Optional local backends (install only what you need)

OpenRouter uses an OpenAI-compatible Chat Completions endpoint and returns a usage object that can include token counts and cost details. ([OpenRouter][1])

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

`node-llama-cpp` provides Node.js bindings for `llama.cpp` to run GGUF models locally. ([npm][2])

### Optional: Transformers.js backend

```bash
npm i nx-ai-api @huggingface/transformers
```

Transformers.js supports text generation tasks in JS/Node environments. ([Hugging Face][8])

---

## Quickstart — OpenRouter (remote)

### 1) Add `.env`

```env
OPENROUTER_API_KEY=sk-or-...
# Optional attribution:
OPENROUTER_APP_URL=https://yourapp.example
OPENROUTER_APP_NAME=My App
```

OpenRouter uses `Authorization: Bearer <key>`. Attribution can be set via `HTTP-Referer` and `X-OpenRouter-Title`. ([OpenRouter][3])

### 2) Use it

```ts
import { createClient } from "nx-ai-api";

const ai = createClient({ backend: "openrouter" });

const res = await ai.ask("Write a 1-paragraph product tagline for a task manager.", {
  model: "openai/gpt-4o",
  vendor: ["openai", "anthropic"],     // provider preference order
  maxTokens: 200,
  temperature: 0.7,
});

console.log(res.text);
console.log(res.usage);
```

Notes:

* Requests go to `POST /api/v1/chat/completions`. ([OpenRouter][1])
* `maxTokens` is sent as `max_completion_tokens` (recommended; `max_tokens` is deprecated). ([OpenRouter][1])
* `vendor` maps to OpenRouter provider routing (`provider.order`, `allow_fallbacks`). ([OpenRouter][6])

---

## Quickstart — Local CPU (GGUF via llama.cpp)

### 1) Install backend

```bash
npm i node-llama-cpp
```

([npm][2])

### 2) Download a GGUF model

Get a `.gguf` file (quantized models are typical for CPU use). Place it somewhere like:
`./models/tinyllama.gguf`

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
    apiKey?: string,           // else OPENROUTER_API_KEY
    baseUrl?: string,          // default https://openrouter.ai/api/v1
    appUrl?: string,           // else OPENROUTER_APP_URL -> HTTP-Referer
    appName?: string,          // else OPENROUTER_APP_NAME -> X-OpenRouter-Title
    allowFallbacksDefault?: boolean // default true
  }
})
```

#### Local llama.cpp config

```ts
createClient({
  backend: "llama-cpp",
  llamaCpp: {
    modelPath: string,      // .gguf
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
  timeoutMs?: number;             // default 60000
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
    [k: string]: unknown;         // OpenRouter may include cost/details
  };
  model?: string;
  raw?: unknown;
};
```

OpenRouter’s usage object can include token details and cost fields. ([OpenRouter][4])

---

## Provider routing (OpenRouter)

`vendor` controls provider preference order:

```ts
vendor: "openai"
// -> provider: { order: ["openai"], allow_fallbacks: true }

vendor: ["anthropic", "openai"]
// -> provider: { order: ["anthropic", "openai"], allow_fallbacks: true }
```

This uses OpenRouter’s provider routing settings for chat completions. ([OpenRouter][6])

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
* Don’t log your OpenRouter key
* Prefer setting attribution headers (optional) so your app is identifiable in OpenRouter analytics. ([OpenRouter][5])

---

## FAQ

### Why `max_completion_tokens`?

OpenRouter documents `max_tokens` as deprecated and recommends `max_completion_tokens`. ([OpenRouter][1])

### Will token counts match between OpenRouter and local?

No. Tokenization varies by model/backend. `nx-ai-api` normalizes the *shape* of usage; the numbers are backend-specific.

---

If you want, I can also include (in the spec) an **exact `package.json` exports map**, `tsup` config, and the precise internal request/response typings for OpenRouter’s chat completion schema—still keeping the public API tiny.

[1]: https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request?utm_source=chatgpt.com "Create a chat completion"
[2]: https://www.npmjs.com/package/node-llama-cpp?utm_source=chatgpt.com "node-llama-cpp"
[3]: https://openrouter.ai/docs/api/reference/authentication?utm_source=chatgpt.com "API Authentication | OpenRouter OAuth and API Keys"
[4]: https://openrouter.ai/docs/api/reference/overview?utm_source=chatgpt.com "OpenRouter API Reference | Complete API Documentation"
[5]: https://openrouter.ai/docs/app-attribution?utm_source=chatgpt.com "App Attribution"
[6]: https://openrouter.ai/docs/guides/routing/provider-selection?utm_source=chatgpt.com "Intelligent Multi-Provider Request Routing"
[7]: https://github.com/ggml-org/llama.cpp?utm_source=chatgpt.com "ggml-org/llama.cpp: LLM inference in C/C++"
[8]: https://huggingface.co/docs/transformers.js/en/index?utm_source=chatgpt.com "Transformers.js"
