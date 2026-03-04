# aifunctions

**Prebuilt AI functions + a stable LLM client for Node.js.**

Instead of wiring LLM calls by hand, aifunctions gives you production-ready functions with typed I/O, guaranteed JSON output, and a retry/validation layer:

Why aifunctions?

You need an LLM to do something — classify a ticket, map fields between two schemas, extract structured data from messy text. You get it working in 10 minutes. Then you spend two days getting it working correctly: tuning the prompt, handling malformed output, picking the right model, adding retries, validating the response shape.

And when you're done, that function lives buried in one project. Next month you need something similar and you start from scratch, or copy-paste and drift.

aifunctions solves this by giving you a framework for building LLM-backed functions the right way, once, and keeping them in a shared library that improves over time.

What "the right way" means here:

Every function you create gets typed input/output contracts, a JSON safety layer with retries, tiered instruction sets (cheap local model for dev, strong cloud model for prod), and output validation against a declared schema. You write the intent, the system handles the engineering.

You don't even have to write good instructions

This is the part that saves the most time. You can start with rough instructions — or no instructions at all — and the system does the rest:

generateInstructions — give it a description and test cases, it writes the instructions for you, runs them, judges the output, rewrites, and loops until they pass your threshold.
optimizeInstructions — already have instructions that mostly work? Feed in examples of good and bad output, and it rewrites them to be clearer and more enforceable.
generateJudgeRules — give it examples of good and bad output, it generates scoring rules automatically. No need to hand-write what "correct" means.
judge — scores any output against rules with weighted evidence, so you always know if a function is performing.
raceModels — run your test cases across multiple models and find out which one actually performs best for your function, not based on generic benchmarks.

The loop looks like: rough idea → generate instructions → generate rules from examples → run against test cases → judge → fix → repeat until it passes. You can do this manually or let generateInstructions run the whole cycle.

Example: adding a new function

Say your team keeps writing one-off prompts to extract line items from invoices. With aifunctions, you define it once:

skills/extract-invoice-lines/weak    ← instructions for local/cheap model
skills/extract-invoice-lines/strong  ← instructions for cloud model

Then you call it like any library function:

const { lines } = await run("extract-invoice-lines", { text: invoiceText });
// [{ description: "Consulting — March", amount: 4500, currency: "USD" }, ...]

Share or keep private — your choice

Skills are stored in a git-backed content repo. Point it at a shared repo and your functions become available to your whole team or the community — someone builds a great extract-invoice-lines, everyone benefits. If you'd rather keep things private, just configure it to your own repo and you have a personal library of production-grade LLM functions that follows you across projects.

The prebuilt functions (classify, summarize, matchLists, judge, etc.) are just functions that were built this way. The real value is that you can keep adding your own, and the system ensures each one is production-grade and reusable.




```ts
import { classify, summarize, matchLists, judge, generateInstructions } from "aifunctions/functions";

// Classify text
const { categories } = await classify({ text: "Can't login to my account", categories: ["Billing", "Auth", "Support"] });

// Judge an LLM response against rules
const verdict = await judge({ instructions: "...", response: "...", rules: [...], threshold: 0.8 });

// Auto-improve instructions until they pass your test suite
const result = await generateInstructions({ seedInstructions: "...", testCases: [...], judgeThreshold: 0.85, ... });
```

No prompt engineering on your side. Each function has typed inputs/outputs and file-based instruction packs (weak / strong / ultra) you can tune per project.

---

## What you get

### 1. Prebuilt AI functions

Call them like any other library function — typed, JSON-only, no boilerplate:

| Category | Functions |
|----------|-----------|
| **Text** | `classify`, `summarize`, `extractTopics`, `extractEntities`, `sentiment`, `translate` |
| **Lists** | `matchLists`, `rank`, `cluster` |
| **Generic** | `ask`, `askJson`, `runJsonCompletion` |
| **Evaluation** | `judge`, `compare` |
| **Optimization** | `optimizeInstructions`, `generateInstructions`, `fixInstructions`, `generateRule`, `generateJudgeRules` |
| **Aggregation** | `aggregateJudgeFeedback`, `normalizeJudgeRules` |
| **Model benchmarking** | `raceModels` |
| **Records** | `collectionMapping` |

### 2. A tiny, stable AI client

`createClient()` → `ask()` — connects to OpenRouter (remote) or llama.cpp / Transformers.js (local CPU). One consistent API regardless of backend; token usage normalized across all providers.

### 3. JSON safety layer

- `extractFirstJsonObject(text)` — extract the first `{...}` from any model output (prefers ` ```json ` blocks, then first brace-balanced `{}`); throws if none found.
- `extractFirstJson(text)` — same but returns `{ ok, data }` / `{ ok: false, errorCode }` without throwing.
- `parseJsonResponse(text, opts)` — deterministic extract with optional LLM fallback.
- `runJsonCompletion({ instruction, options })` — run a completion and get parsed JSON back directly; retries once with a stricter system message if parsing fails.

### 4. Skill packs (file-based instructions)

Instruction files live at `skills/<skillId>/weak`, `strong`, `ultra` in your content repo. You can tune them without touching code; CI runs `content:fixtures` to verify they still satisfy contracts.

---

## Install

### Base (OpenRouter)

```bash
npm i aifunctions
```

### + Local CPU (GGUF via llama.cpp)

```bash
npm i aifunctions node-llama-cpp
```

### + Transformers.js

```bash
npm i aifunctions @huggingface/transformers
```

---

## Quick starts

### Text functions

```ts
import { classify, summarize, extractEntities, matchLists, rank } from "aifunctions/functions";

// Classify (e.g. support ticket routing)
const { categories } = await classify({
  text: "I was charged twice this month.",
  categories: ["Billing", "Technical Support", "General Inquiry"],
});

// Summarize
const { summary, keyPoints } = await summarize({ text: "...", length: "brief" });

// Extract entities
const { entities } = await extractEntities({ text: "Apple was founded by Steve Jobs in Cupertino." });
// [{ name: "Apple", type: "Organization" }, ...]

// Match two lists semantically
const result = await matchLists({ list1: sourceFields, list2: targetFields, guidance: "Match by semantic meaning." });

// Rank items by query
const { rankedItems } = await rank({ items: products, query: "Affordable noise-cancelling headphones" });
```

### Generic JSON completion

```ts
import { ask, runJsonCompletion, extractFirstJsonObject } from "aifunctions/functions";

// Generic instruction → JSON
const data = await ask({
  instruction: "Extract the main topic and two sub-topics.",
  outputContract: "Single JSON: { main: string, subTopics: string[] }",
  inputData: { text: "..." },
});

// run a raw completion and get parsed JSON back (with 1 auto-retry on parse fail)
const { parsed, text, usage } = await runJsonCompletion({
  instruction: "Map these two collections. Return JSON only.",
  options: { model: "openai/gpt-4o", maxTokens: 1000 },
});

// extract JSON from any string (throws if none found)
const json = extractFirstJsonObject(modelOutput);
```

### Evaluation pipeline

```ts
import { judge, aggregateJudgeFeedback, compare } from "aifunctions/functions";

// Score a response against rules
const verdict = await judge({
  instructions: systemPrompt,
  response: modelOutput,
  rules: [
    { rule: "Must output valid JSON only", weight: 3 },
    { rule: "Field names must match the schema exactly", weight: 2 },
  ],
  threshold: 0.8,
  mode: "strong",
});
// verdict.pass, verdict.scoreNormalized, verdict.ruleResults[].evidences

// Compare two instruction sets with an automatic judge
const comparison = await compare({
  instructionsA: draft1,
  instructionsB: draft2,
  testCases: [{ id: "t1", inputMd: "..." }],
  rules: [...],
  threshold: 0.8,
});
```

### Optimization & benchmarking

```ts
import { optimizeInstructions, generateInstructions, raceModels } from "aifunctions/functions";

// One-shot: improve an instruction set for clarity/enforceability
const { optimizedInstructions, judgeRules } = await optimizeInstructions({
  seedInstructions: myPrompt,
  examples: [{ id: "ex1", inputMd: "...", outputs: [{ id: "o1", text: "...", label: "good" }] }],
});

// Iterative loop: run → judge → fix until threshold or maxCycles
const best = await generateInstructions({
  seedInstructions: myPrompt,
  testCases: [{ id: "t1", inputMd: "..." }],
  call: "askJson",
  targetModel: { model: "openai/gpt-4o", vendor: "openai", class: "strong" },
  judgeThreshold: 0.85,
  targetAverageThreshold: 0.85,
  loop: { maxCycles: 5 },
  optimizer: { mode: "strong" },
});
// best.best.instructions, best.achieved, best.history

// Benchmark multiple models on your test suite
const ranking = await raceModels({
  taskName: "collection-mapping",
  call: "askJson",
  skill: { strongSystem: systemPrompt },
  testCases: [{ id: "t1", inputMd: "..." }],
  threshold: 0.8,
  models: [
    { id: "gpt4o", model: "openai/gpt-4o", vendor: "openai", class: "strong" },
    { id: "claude", model: "anthropic/claude-3-5-haiku", vendor: "anthropic", class: "strong" },
  ],
});
// ranking.ranking[0].modelId — best model
```

---

## Modes

| Mode | Backend | When to use |
|------|---------|-------------|
| **weak** | local llama.cpp (no API key) | Dev, low-cost, offline |
| **normal** / **strong** | OpenRouter `gpt-5-nano` / `gpt-5.2` | Default cloud |
| **ultra** | same as strong | Highest-tier label |

```env
OPENROUTER_API_KEY=sk-or-...
```

Pass `mode` to any function. Omit it for the default (`"normal"`). Override the model or backend by passing a custom `client`:

```ts
import { createClient } from "aifunctions";
const ai = createClient({ backend: "llama-cpp" });
await classify({ text: "...", categories: [...], client: ai, mode: "weak" });
```

---

## Function reference

### `matchLists` — Semantic list matching

Matches items from two lists by semantic similarity. Pass `existingMatches` to skip already-mapped items (safe for incremental runs).

```ts
const result = await matchLists({
  list1: source,
  list2: target,
  guidance: "Match by name, accepting close variants.",
  existingMatches: previousRun.matches, // optional
  mode: "normal",
});
```

### `extractTopics`

```ts
const { topics } = await extractTopics({ text: "...", maxTopics: 3 });
```

### `sentiment`

```ts
const { sentiment: label, score } = await sentiment({ text: "Best product ever!" });
```

### `translate`

```ts
const { translatedText } = await translate({ text: "Hello!", targetLanguage: "French" });
```

### `cluster` — Semantic clustering

```ts
const { clusters } = await cluster({ items: userFeedbackList, numClusters: 4 });
```

> **Flexible schema:** For list operations (`matchLists`, `rank`, `cluster`), the object structure in your lists does not matter — the AI uses semantic similarity across all fields.

### `collectionMapping` — Field-level collection mapping

Map fields between two collection schemas (e.g. two database schemas or API shapes).

```ts
import { collectionMapping } from "aifunctions/functions";

const mapping = await collectionMapping({
  left: { name: "orders", fields: ["_id", "userId", "total", "createdAt"] },
  right: { name: "purchases", fields: ["id", "customer_id", "amount", "date"] },
});
// mapping.fieldMappings[].leftField, .rightField, .confidence
```

---

## JSON helpers

```ts
import { extractFirstJson, extractFirstJsonObject, parseJsonResponse, askJson } from "aifunctions/functions";

// Returns { ok: true, data } or { ok: false, errorCode, message }
const r = extractFirstJson('Some text {"a": 1} more');

// Returns { jsonText, parsed }; throws NoJsonFoundError if no JSON (prefers ```json blocks)
const { jsonText, parsed } = extractFirstJsonObject(modelOutput);

// Deterministic extract + optional LLM fallback
const r2 = await parseJsonResponse(mixedText, { llmFallback: true });

// Single-JSON guarantee; returns AiJsonSuccess | AiJsonError (use throwOnError to throw)
const r3 = await askJson<{ summary: string }>({
  prompt: "Summarize in one sentence.",
  instructions: { weak: "JSON only.", normal: "Return a single JSON object." },
  outputContract: "Object with key 'summary' (string).",
});
```

### JSON safety + schema validation + retries

All JSON execution paths (`runJsonCompletion`, `askJson`) use a hardened pipeline:

- **First-JSON extraction** — Prefer fenced ` ```json ` blocks, then the first JSON object or array (via `extract-first-json`).
- **Secure parsing** — `safeJsonParse` (secure-json-parse) removes `__proto__` and `constructor.prototype` to prevent prototype poisoning.
- **Optional schema validation** — Pass `schema` or `schemaKey` + `resolver` to validate with Ajv; errors are `path` + `message`.
- **Deterministic retry** — Up to 3 attempts: normal → JSON-only guard → fix-to-schema with validation errors in the prompt. Result includes `attemptsUsed`; on failure, `AiJsonError` has `errorCode` (`ERR_NO_JSON_FOUND`, `ERR_JSON_PARSE`, `ERR_SCHEMA_INVALID`), `message`, `details`, `rawText`.
- **Standardized shapes** — Success: `AiJsonSuccess<T>` (`ok: true`, `parsed`, `rawText`, `usage`, `model`, `attemptsUsed`, optional `validation`). Failure: `AiJsonError`. Use `throwOnError: true` to throw instead of returning an error.

---

## Output validation

When you want to verify that a skill's output matches its declared contract:

```ts
import { run, validateOutput, validateAgainstSchema } from "aifunctions/functions";

// run() with validateOutput: true → always returns { result, validation }
const { result, validation } = await run("classify", { text: "...", categories: [...] }, {
  resolver,
  validateOutput: true,
}) as { result: unknown; validation: { valid: boolean; errors?: string[] } };

// or validate manually
const check = validateAgainstSchema(myOutput, mySchema);
// check.valid, check.errors
```

In the REST server set `VALIDATE_SKILL_OUTPUT=1`; every `POST /run` response becomes `{ result, validation }`.

---

## Skill-by-name

Run any function by string name — useful for generic pipelines or the REST API:

```ts
import { run, getSkillNames, runWithContent, runSkill } from "aifunctions/functions";

// built-in functions
await run("classify", { text: "...", categories: [...] });
getSkillNames(); // ["matchLists", "extractTopics", "classify", "judge", ...]

// content-resolved (instructions from git/local content store)
import { getSkillsResolver } from "aifunctions";
const resolver = getSkillsResolver();
await runWithContent("myCustomSkill", { inputData: "..." }, { resolver });

// raw key + INPUT_MD (advanced — custom content keys)
const { data } = await runSkill({ key: "mySkill", mode: "strong", inputMd: "...", resolver });
```

---

## REST API

Expose skills, optimization, race, and content workflows over HTTP (no UI, no shell required):

```bash
npm run build && npm run serve
# Listens on port 3780 (override: PORT=3000 npm run serve)
```

### Core

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | `{ "ok": true }` |
| GET | `/skills` | List skills + metadata (name, version, description when index present) |
| GET | `/skills/:name` | Skill details (from library index if available) |
| POST | `/skills/:name/run` | Run skill; body: `{ "request": object }` |
| POST | `/run` | Run skill; body: `{ "skill": string, "request": object }` → `{ "result": ... }` |

### Optimization

| Method | Path | Description |
|--------|------|-------------|
| POST | `/optimize/instructions` | Optimize raw or skill instructions; body: `{ rawInstructions? \| skillName, mode?, model? }` → `{ optimizedInstructions, tokens }` |
| POST | `/optimize/skill` | Optimize one skill; body: `{ skillName, mode?, runValidation? }` → `{ before, after, validationSummary?, tokens }` |
| POST | `/optimize/batch` | Optimize multiple skills; body: `{ skills?: string[], mode?, continueOnError? }` → `{ results, summary }` |

### Race / benchmark

| Method | Path | Description |
|--------|------|-------------|
| POST | `/race/models` | Race models; body: `RaceModelsRequest` → `{ ranking, details, bestModelId, ... }` |

### Content workflows (CLI parity)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/content/sync` | Sync instructions to content; body: `{ dryRun?, optimize? }` → `{ ok, jobId }` |
| POST | `/content/index` | Build library index; body: `{ root?, prefix? }` → `{ ok, jobId }` |
| POST | `/content/fixtures` | Run fixtures; body: `{ action?, skillName?, prefix? }` → `{ ok, summary, errors? }` |
| POST | `/content/layout-lint` | Layout lint; body: `{}` → `{ ok, errors? }` |

### Jobs (long-running)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/jobs/:id` | Job status → `{ status, progress?, result?, error? }` |
| GET | `/jobs/:id/logs` | Job logs (text/plain) |

### Auth and limits

- **Optional API key:** Set `AIFUNCTIONS_API_KEY`; then send `x-api-key: <key>` on every request. If unset, no auth.
- **Concurrency:** `MAX_CONCURRENCY` (default 50) caps concurrent run/optimize/race. `JOB_TTL` (default 24h ms) for job retention.

```bash
curl -X POST http://localhost:3780/run \
  -H "Content-Type: application/json" \
  -d '{"skill":"classify","request":{"text":"Billing issue","categories":["Billing","Auth"]}}'
```

CORS enabled (`*`). Set `VALIDATE_SKILL_OUTPUT=1` to get `{ result, validation }` on every `/run` response.

---

## Low-level client

```ts
import { createClient } from "aifunctions";

const ai = createClient({ backend: "openrouter" });

const res = await ai.ask("Write a product tagline.", {
  model: "openai/gpt-4o",
  vendor: ["openai", "anthropic"],  // provider preference order
  maxTokens: 200,
  temperature: 0.7,
});
// res.text, res.usage.prompt_tokens, res.usage.total_tokens, res.model
```

### Client config

```ts
// OpenRouter
createClient({ backend: "openrouter", openrouter: { apiKey?, baseUrl?, appUrl?, appName? } })

// Local GGUF (llama.cpp)
createClient({ backend: "llama-cpp", llamaCpp: { modelPath: "./models/model.gguf", contextSize?, threads? } })

// Transformers.js
createClient({ backend: "transformersjs", transformersjs: { modelId?, cacheDir?, device?: "cpu" } })
```

`.env` defaults (all optional):

```env
OPENROUTER_API_KEY=sk-or-...
LLAMA_CPP_MODEL_PATH=./models/model.gguf
LLAMA_CPP_THREADS=6
TRANSFORMERS_JS_MODEL_ID=Xenova/distilbart-cnn-6-6
```

### Errors

All errors throw `NxAiApiError`:

| Code | Cause |
|------|-------|
| `MISSING_ENV` | Missing `OPENROUTER_API_KEY` |
| `OPENROUTER_HTTP_ERROR` | Non-2xx from OpenRouter |
| `TIMEOUT` | Request exceeded `timeoutMs` |
| `MISSING_OPTIONAL_DEP` | Backend package not installed |

---

## Skill packs and content

Instruction files live in a content store (git repo or local folder) under canonical keys:

```
skills/<skillId>/weak      ← local / cheap instructions
skills/<skillId>/strong    ← cloud / high-quality instructions
skills/<skillId>/ultra     ← highest-tier instructions (optional)
skills/<skillId>/rules     ← JSON rules array (optional)
```

### Sync and publish

```bash
npm run content:sync           # write instructions to .content and push to skills repo
npm run content:sync:optimize  # + run LLM optimization pass on each skill's instructions
npm run content:index          # build the library index (io schemas, examples) via LLM
npm run content:fixtures       # validate stored examples against io.output schemas (no API key)
npm run content:layout-lint    # enforce folder-based layout; fail on root-level *-instructions.md
```

Requires `SKILLS_PUBLISHER_TOKEN` or `GITHUB_TOKEN` for push. Optimization requires `OPENROUTER_API_KEY`.

### Finalize & optimize (full pipeline)

To ship the library with all skills optimized and validated:

1. **Code & tests:** `npm run typecheck && npm run build && npm run test:unit`
2. **Content sync:** `npm run content:sync` (writes instructions/rules to `.content`, pushes). Use `content:sync:no-test` to skip the full test suite, or `--no-push` to only sync locally.
3. **Optimize instructions (LLM):** `npm run content:sync:optimize` to run the optimizer on each skill’s weak/strong instructions and write reports to `reports/optimize/`. Requires `OPENROUTER_API_KEY`.
4. **Library index:** `npm run content:index` to build the library index (I/O schemas, examples) so fixtures can run.
5. **Validate:** `npm run content:fixtures` (validates index examples vs `io.output`), then `npm run content:layout-lint` (enforces folder-based keys only). If layout-lint fails (root-level `*-instructions.md` / `*-rules.json`), run `content:sync` once to populate folder-based keys, then remove the old root-level files in `.content` so layout-lint passes.

```ts
import { getSkillsResolver, resolveSkillInstructions, pushSkillsContent } from "aifunctions";

const resolver = getSkillsResolver();
const system = await resolveSkillInstructions(resolver, "judge", "strong");

await pushSkillsContent({ localPath: "./.content", message: "chore: update skills" });
```

**Contract stability:** Every skill has a versioned contract (`io.input`, `io.output`) in the library index. See [docs/CONTRACT_STABILITY.md](docs/CONTRACT_STABILITY.md).

---

## Testing

```bash
npm run build && npm test          # full suite (requires OPENROUTER_API_KEY)
npm run test:unit                  # unit tests only — no API key, ~2 s
```

---

## Security

- Never commit `.env`
- Don't log API keys
- Add `.content/` to `.gitignore`

---

## FAQ

**Why `max_completion_tokens`?**
OpenRouter recommends it; `max_tokens` is deprecated.

**Will token counts match across backends?**
No. Tokenization is model-specific. `aifunctions` normalizes the *shape* (`prompt_tokens`, `completion_tokens`, `total_tokens`); numbers are backend-specific.

**Where is the full reference?**
- [docs/CORE.md](docs/CORE.md) — core offering + capability checklist
- [docs/LIBRARY.md](docs/LIBRARY.md) — full function reference
- [docs/FUNCTIONS_SPEC.md](docs/FUNCTIONS_SPEC.md) — I/O types and SYSTEM/USER templates
- [docs/CONTRACT_STABILITY.md](docs/CONTRACT_STABILITY.md) — versioned contracts, fixtures, validation
- [docs/CONTENT_SKILLS.md](docs/CONTENT_SKILLS.md) — content-resolved skills catalog
