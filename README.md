# light-skills

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
npm i light-skills
```

### Local CPU (GGUF) support

```bash
npm i light-skills node-llama-cpp
```

`node-llama-cpp` provides Node.js bindings for `llama.cpp` to run GGUF models locally.

### Optional: Transformers.js backend

```bash
npm i light-skills @huggingface/transformers
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
import { createClient } from "light-skills";

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
import { createClient } from "light-skills";

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

## Library Functions (`light-skills/functions`)

`light-skills` ships a set of utility functions for guaranteed JSON output from an LLM — importable via the `light-skills/functions` sub-path. **Full reference:** [docs/LIBRARY.md](docs/LIBRARY.md) lists every listed (built-in) function, explains unlisted (content-based) skills, and the core helpers. **I/O and templates:** [docs/FUNCTIONS_SPEC.md](docs/FUNCTIONS_SPEC.md) defines Request/Response, Modes (weak/normal/strong), and SYSTEM / USER (`INPUT_MD`) templates for all functions (including judge, compare, fix-instructions, optimize-instructions, etc.).

### Features

- **Guaranteed JSON**: Instructions and sanitization ensure parseable JSON.
- **Type Safe**: Strong typing of LLM responses.
- **Mode**: Functions accept optional `mode?: "weak" | "normal" | "strong"`. Default is `"normal"`. Presets:
  - **weak** — local backend (llama-cpp by default); no API key required. Default model: Llama 2.0 via a GGUF at `LLAMA_CPP_MODEL_PATH` (default `./models/model.gguf`). Shorter instructions, lower temperature.
  - **normal** — OpenRouter with default model `gpt-5-nano`; requires `OPENROUTER_API_KEY`.
  - **strong** — OpenRouter with default model `gpt-5.2`; requires `OPENROUTER_API_KEY`.
  You can override by passing a custom `client` or `model`; explicit options always win over the preset.

### Setup

When you omit `client`, the default depends on `mode`: **weak** uses the local backend (no key); **normal** and **strong** use OpenRouter (set `OPENROUTER_API_KEY` in `.env`). Or pass a custom `client` (e.g. `createClient({ backend: "llama-cpp" })`).

```env
OPENROUTER_API_KEY=sk-or-...
```

### Install `dotenv` if needed

```bash
npm i dotenv
```

---

### JSON helpers

For robust JSON from model output or when you need a single-JSON guarantee:

- **`extractFirstJson(text)`** — Deterministic: finds the first brace-balanced `{...}` in a string and parses it. Returns `{ ok: true, data }` or `{ ok: false, errorCode, message }`. Use when the model may have wrapped JSON in markdown or prose.
- **`parseJsonResponse(text, options?)`** — Runs `extractFirstJson` on `text`. If that fails and `options.llmFallback === true`, calls the LLM to extract the JSON from the text, then extracts again from the LLM output. Returns `{ ok: true, json }` or `{ ok: false, errorCode, message }`.
- **`askJson<T>(params)`** — LLM call with an explicit "single JSON object only" guarantee. Params: `prompt`, `instructions: { weak, normal, strong? }`, optional `outputContract`, `requiredOutputShape`, `client`, `mode`, `model`. Returns `CallAIResult<T>`.

```ts
import { extractFirstJson, parseJsonResponse, askJson } from "light-skills/functions";

const r1 = extractFirstJson("Some text then {\"a\": 1} more.");
// r1.ok && r1.data === { a: 1 }

const r2 = await parseJsonResponse(mixedText, { llmFallback: true });
// r2.ok && use r2.json

const r3 = await askJson<{ summary: string }>({
  prompt: "Summarize in one sentence.",
  instructions: { weak: "JSON only.", normal: "Return a single JSON object." },
  outputContract: "Object with key 'summary' (string).",
});
// r3.data.summary
```

### `ask` (ai.ask) — Generic instruction skill

Generic "do what the instruction says" skill. Builds INPUT_MD from instruction, output contract, and optional input data; returns parsed JSON. Runnable by name as `ai.ask`.

```ts
import { ask, run } from "light-skills/functions";

const data = await ask({
  instruction: "Extract the main topic and two sub-topics from the input.",
  outputContract: "Single JSON object with keys 'main' (string) and 'subTopics' (string[]).",
  inputData: { text: "Long article..." },
});
// or: run("ai.ask", { instruction: "...", outputContract: "...", inputData: {...} })
```

---

### `matchLists` — Semantic List Matching

Intelligently matches items from two lists based on semantic similarity and naming. Pass **`existingMatches`** from a previous run to avoid re-matching: list1 items already in `existingMatches` are skipped, only the rest are sent to the model, and results are merged so you get no doubles and no crash — safe to call as new records arrive.

```ts
import { matchLists } from "light-skills/functions";

const result = await matchLists({
  list1: source,
  list2: target,
  guidance: "Match by name, accepting close variants.",
  existingMatches: previousRun.matches,  // optional: skip already-mapped list1 items
  mode: "normal",  // optional: "weak" | "normal" | "strong"
});
```

---

### `extractTopics` — Topic Extraction

Extracts key topics from the provided text.

```ts
import { extractTopics } from "light-skills/functions";

const { topics } = await extractTopics({ 
  text: "Very long article about space exploration and NASA's next missions...",
  maxTopics: 3,
  mode: "normal",  // optional: "weak" | "normal" | "strong"
});
```

---

### `extractEntities` — Named Entity Extraction

Extracts named entities (People, Organizations, Locations, etc.) from the text.

```ts
import { extractEntities } from "light-skills/functions";

const { entities } = await extractEntities({ 
  text: "Apple was founded by Steve Jobs in Cupertino.",
  mode: "normal",  // optional: "weak" | "normal" | "strong"
});
// [{ name: "Apple", type: "Organization" }, { name: "Steve Jobs", type: "Person" }, ...]
```

---

### `summarize` — Text Summarization

Generates a concise summary and key points.

```ts
import { summarize } from "light-skills/functions";

const { summary, keyPoints } = await summarize({ 
  text: "...content...",
  length: "brief",  // "brief" | "medium" | "detailed"
  mode: "normal",   // optional: "weak" | "normal" | "strong"
});
```

---

### `classify` — Text Classification

Classifies text into one or more provided categories.

```ts
import { classify } from "light-skills/functions";

const { categories } = await classify({ 
  text: "I am having trouble with my subscription.",
  categories: ["Billing", "Technical Support", "General Inquiry"],
  mode: "normal",  // optional: "weak" | "normal" | "strong"
});
```

---

### `sentiment` — Sentiment Analysis

Analyzes the sentiment (positive, negative, or neutral).

```ts
import { sentiment } from "light-skills/functions";

const { sentiment: label, score } = await sentiment({ 
  text: "This is the best product ever!" 
});
```

---

### `translate` — Translation

Translates text to a target language.

```ts
import { translate } from "light-skills/functions";

const { translatedText } = await translate({ 
  text: "Hello, how are you?",
  targetLanguage: "French" 
});
```

---

### `rank` — Relevance Ranking

Ranks a list of items based on a query.

```ts
import { rank } from "light-skills/functions";

const { rankedItems } = await rank({
  items: products,
  query: "Affordable noise-cancelling headphones"
});
```

---

### `cluster` — Semantic Clustering

Groups a list of items into semantic clusters.

```ts
import { cluster } from "light-skills/functions";

const { clusters } = await cluster({
  items: userFeedbackList,
  numClusters: 3
});
```

> [!TIP]
> **Flexible Schema**: For list operations (`matchLists`, `rank`, `cluster`), the structure of objects in your lists does not matter. The AI uses semantic similarity across all available fields.


---

## Skill-by-name and content

You can run functions by **skill name** and resolve instructions (and rules) from a configurable content source (e.g. nx-content with a Git or local backend).

### Run by skill name (direct)

```ts
import { run, getSkillNames } from "light-skills/functions";

const result = await run("extractTopics", {
  text: "Long article...",
  maxTopics: 5,
  mode: "normal",
});
// result has the same shape as extractTopics()
getSkillNames(); // ["matchLists", "extractTopics", ...]
```

### Run with content-resolved instructions

When skill instructions live in your content store, use `runWithContent` with a resolver (from `getSkillsResolver`). Instructions and optional rules are loaded by skill key and mode (weak/normal/strong). See [Content-based skills catalog](docs/CONTENT_SKILLS.md) for a list of content-resolved skills (e.g. judge, compare, fixInstructions, generateRule) and which are orchestration-only.

```ts
import { getSkillsResolver } from "light-skills";
import { runWithContent } from "light-skills/functions";

const resolver = getSkillsResolver();
// Override: getSkillsResolver({ localRoot: "./.content" }) or pass gitRepoUrl/gitToken

const result = await runWithContent(
  "extractTopics",
  { text: "...", mode: "normal" },
  { resolver }
);
```

You can override the content source via `getSkillsResolver(options)`: e.g. `localRoot`, `gitRepoUrl`, `gitToken`, or `mode` (dev/prod).

### Resolve instructions and rules by key

```ts
import {
  getSkillsResolver,
  resolveSkillInstructions,
  resolveSkillRules,
} from "light-skills";

const resolver = getSkillsResolver();
const systemText = await resolveSkillInstructions(resolver, "ai.judge.v1", "normal");
const rules = await resolveSkillRules(resolver, "ai.judge.v1");
```

### Publishing skill content

To push skill content (instructions and rules) to your configured content backend, use `pushSkillsContent({ localPath })`. The directory at `localPath` must be a Git repo with the remote set. Set `SKILLS_PUBLISHER_TOKEN` or `GITHUB_TOKEN` in your environment (or use SSH) so push has write access. Never commit tokens; see `.env.example`.

```ts
import { pushSkillsContent } from "light-skills";

const { committed, pushed } = await pushSkillsContent({
  localPath: "./.content",
  message: "chore: update skill content",
});
```

### Test, sync instructions, and push (one command)

To **test all skill functions**, **write current skill instructions** from the codebase into `.content`, and **push to the skills repo** in one go, use the `content:sync` script. It uses nx-content’s local backend and `pushToRemote()`. Pushing to git is **on by default** (automated); use `--no-push` to sync locally only (e.g. to review after an optimization step).

1. Builds the project and writes instruction files for every built-in skill (extractTopics, matchLists, summarize, etc.) into `.content` using the default instruction manifest.
2. Runs the full test suite (`npm test`). If tests fail, it does not push.
3. By default, commits and pushes `.content` to the remote (`DEFAULT_SKILLS_REPO_URL`). Pass `--no-push` to skip the push.

If `.content` does not exist, the script **clones** the skills repo (e.g. [nx-morpheus/skills-functions](https://github.com/nx-morpheus/skills-functions)) into `.content`, so the remote’s existing files are preserved and the push adds the new `skills/` tree.

```bash
npm run content:sync
```

- **With optimization:** `npm run content:sync:optimize` or add `--optimize` to the script. Runs an LLM pass on each skill’s instructions (clarity/brevity), writes one **Markdown report per skill** to `reports/optimize/<skillName>.md` (original vs optimized, word counts, token usage, duration), then updates `.content` with the optimized instructions and pushes (unless `--no-push`).
- **Skip tests:** `npm run content:sync:no-test` or `npx tsx scripts/testOptimizeAndPush.ts -- --skip-tests`.
- **Skip push (local-only):** `npx tsx scripts/testOptimizeAndPush.ts -- --no-push` or `--push=false`. Use after optimization if you want to review before pushing the best version or rules.

Requires `SKILLS_PUBLISHER_TOKEN` or `GITHUB_TOKEN` for push (HTTPS). Optimization requires `OPENROUTER_API_KEY`. Add `.content/` to `.gitignore` if you don’t want to commit the local content clone.

After a successful push, the remote will contain a **`skills/`** tree: e.g. `skills/extractTopics/weak.md`, `skills/extractTopics/normal.md`, `skills/matchLists/weak.md`, etc. You need write access to the repo for the push to succeed; otherwise the remote will stay empty of these files.


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

No. Tokenization varies by model/backend. `light-skills` normalizes the *shape* of usage; the numbers are backend-specific.

