# aifunctions-js

**Turn prompts into real functions** — typed I/O, JSON-safe execution, evaluation, and instruction optimization.

- Use it as an **npm library** (you're in full control; no proxy required).
- Or run the included **stateless REST server** to expose functions over HTTP and manage the full function lifecycle.

### Terminology

- **Function**: canonical public term for an ability.
- **Skill**: internal/content-store alias for the same ability. Content is stored under **`functions/<id>/...`** (one folder per function).
- `/skills/*` endpoints are kept for backward compatibility and act as aliases for function operations.

---

## Why this exists

LLM "functions" start easy and get messy:
- output drifts
- JSON breaks
- edge cases show up
- you add retries, parsing, validation, model picking… and end up with glue code

**aifunctions-js** standardizes that work:
- **Typed contracts** (input/output schemas)
- **JSON-only execution** with retries + repair
- **Evaluation** (judge/rules)
- **Optimization loop** (run → judge → fix → repeat)
- **Skill packs** stored as files (weak/strong/ultra), so prompts aren't buried in code
- **Functions lifecycle** (create → validate → release) with score-gated promotion

---

## Install

```bash
npm i aifunctions-js
```

### Optional local CPU backends

```bash
npm i node-llama-cpp          # GGUF via llama.cpp
npm i @huggingface/transformers  # Transformers.js
```

---

## Quick start

### 1) Use prebuilt functions

```ts
import { classify, summarize, matchLists } from "aifunctions-js/functions";

const { categories } = await classify({
  text: "I was charged twice this month.",
  categories: ["Billing", "Auth", "Support"],
});

const { summary } = await summarize({ text: longDoc, length: "brief" });

const r = await matchLists({
  list1: sourceFields,
  list2: targetFields,
  guidance: "Match by semantic meaning.",
});
```

### 2) Run any function by name

```ts
import { run } from "aifunctions-js/functions";

const result = await run("extract-invoice-lines", { text: invoiceText });
// → { lines: [{ description: "...", amount: 4500 }, ...] }
```

---

## Core concepts

### Function packs (file-based prompts)

Functions live as files in a content store (git repo or local folder):

```
skills/<skillId>/weak      # local/cheap instructions
skills/<skillId>/strong    # cloud/high-quality instructions
skills/<skillId>/ultra     # optional highest-tier instructions
skills/<skillId>/rules     # optional judge rules (JSON)
skills/<skillId>/meta.json # status: draft | released, version, scoreGate
skills/<skillId>/test-cases.json  # stored test cases for validate/optimize
skills/<skillId>/race-config.json # race defaults + winner profiles (best/cheapest/fastest/balanced)
skills/<skillId>/races.json       # race history (append-only, capped)
```

**Docs:** [COLLECTIONS_MAPPING.md](docs/COLLECTIONS_MAPPING.md) describes what collections exist, their schema, and relationships (prerequisite). [DATA_MAPPING.md](docs/DATA_MAPPING.md) describes the actual records and data in each.

Prompts are:
- reviewable in PRs
- shareable across projects
- versionable like code

### Modes

| Mode                | Typical backend | Use                      |
| ------------------- | --------------- | ------------------------ |
| `weak`              | local (CPU)     | dev/offline/cheap        |
| `normal` / `strong` | cloud           | production default       |
| `ultra`             | cloud           | strictest / highest-tier |

---

## The safety layer (JSON + validation + retries)

For any JSON-producing call, the library applies:

- **extract-first JSON** (prefers ` ```json ` fences, then first balanced object/array)
- **safe parsing** (guards against prototype poisoning)
- **optional schema validation** (Ajv)
- **deterministic retries** (normal → JSON-only guard → fix-to-schema with errors)

```ts
import { runJsonCompletion } from "aifunctions-js/functions";

const { parsed, text, usage } = await runJsonCompletion({
  instruction: "Extract line items from this invoice. Return JSON only.",
  options: { model: "openai/gpt-4o", maxTokens: 800 },
});
```

---

## Evaluation & optimization

### Judge a response

```ts
import { judge } from "aifunctions-js/functions";

const verdict = await judge({
  instructions: "...",
  response: "...",
  rules: [
    { rule: "Must output valid JSON only", weight: 3 },
    { rule: "Field names must match the schema exactly", weight: 2 },
  ],
  threshold: 0.8,
  mode: "strong",
});
// verdict.pass, verdict.scoreNormalized, verdict.ruleResults
```

### Generate rules from instructions

```ts
import { generateJudgeRules } from "aifunctions-js/functions";

const { rules } = await generateJudgeRules({ instructions: myPrompt });
```

**Methodology:** When providing good/bad examples (e.g. `POST /optimize/rules` or `optimizeJudgeRules`), include a brief rationale (why it's good or bad) when possible; it improves rule quality.

### Generate / improve instructions until they pass

```ts
import { generateInstructions } from "aifunctions-js/functions";

const best = await generateInstructions({
  seedInstructions: myPrompt,
  testCases: [{ id: "t1", inputMd: "Invoice #1234\nConsulting: $4,500" }],
  call: "ask",
  targetModel: { model: "openai/gpt-4o-mini", class: "normal" },
  judgeThreshold: 0.8,
  targetAverageThreshold: 0.85,
  loop: { maxCycles: 5 },
  optimizer: { mode: "strong" },
});
// best.achieved, best.best.instructions, best.best.avgScoreNormalized
```

### Fix instructions from judge feedback

```ts
import { fixInstructions } from "aifunctions-js/functions";

const { fixedInstructions, changes } = await fixInstructions({
  instructions: myPrompt,
  judgeFeedback: verdict,
});
```

### Compare two instruction versions

```ts
import { compare } from "aifunctions-js/functions";

const result = await compare({
  instructions: baseInstructions,
  responses: [
    { id: "v1", text: responseFromVersionA },
    { id: "v2", text: responseFromVersionB },
  ],
  threshold: 0.8,
});
// result.bestId, result.ranking
```

### Benchmark models

```ts
import { raceModels } from "aifunctions-js/functions";

const ranking = await raceModels({
  taskName: "invoice-lines",
  call: "askJson",
  testCases: [{ id: "t1", inputMd: "..." }],
  threshold: 0.8,
  models: [
    { id: "gpt4o", model: "openai/gpt-4o", vendor: "openai", class: "strong" },
    { id: "claude", model: "anthropic/claude-3-5-haiku", vendor: "anthropic", class: "strong" },
  ],
});
```

---

## Client (one API across providers)

```ts
import { createClient } from "aifunctions-js";

const ai = createClient({ backend: "openrouter" });

const res = await ai.ask("Write a product tagline.", {
  model: "openai/gpt-4o",
  maxTokens: 200,
  temperature: 0.7,
});
// res.text, res.usage, res.model

// Or use mode and let the client resolve model from config/env/preset:
await ai.ask("...", { mode: "strong", maxTokens: 500, temperature: 0.7 });
```

You can set the strong/normal model once via env (`LLM_MODEL_STRONG`, `LLM_MODEL_NORMAL`) or `createClient({ models: { normal, strong } })`; then `ask(..., { mode: "strong" })` uses that model without passing it every time.

### Backends

```ts
createClient({ backend: "openrouter", models?: { normal?, strong? }, openrouter?: { apiKey?, baseUrl?, appName?, appUrl? } })
createClient({ backend: "llama-cpp", llamaCpp: { modelPath, contextSize?, threads? } })
createClient({ backend: "transformersjs", transformersjs: { modelId?, cacheDir?, device?: "cpu" } })
```

---

## Configuration

`.env` (all optional unless you use that backend):

```env
OPENROUTER_API_KEY=sk-or-...
LLM_MODEL_NORMAL=gpt-5-nano    # optional; used when ask(..., { mode: "normal" })
LLM_MODEL_STRONG=gpt-5.2       # optional; used when ask(..., { mode: "strong" })

LLAMA_CPP_MODEL_PATH=./models/model.gguf
LLAMA_CPP_THREADS=6

TRANSFORMERS_JS_MODEL_ID=Xenova/distilbart-cnn-6-6
```

---

## REST API (optional, stateless)

Expose functions and the full lifecycle over HTTP. Authoritative request/response shapes: [docs/API_CONTRACT.md](docs/API_CONTRACT.md). Server–contract sync status: [docs/CONTRACT_SYNC.md](docs/CONTRACT_SYNC.md).

```bash
npm run build && npm run serve
# PORT=3780 by default
```

### Authentication

| Header | Purpose |
|---|---|
| `x-api-key` | Authenticates to the server — validated against `LIGHT_SKILLS_API_KEY` env |
| `x-openrouter-key` | BYOK — passed through to OpenRouter so each user can use their own key and billing |

If `LIGHT_SKILLS_API_KEY` is not set, all requests are allowed.

### Run and health

```
GET  /health                  health check → { version, uptime, skills, hasOpenrouterKey, backends }
GET  /config/modes            server mode→model mapping → { weak, normal, strong, ultra } (each { model, description })
POST /run                     { skill, input, options } → { result, usage }
POST /skills/:name/run        { input, options }        → { result, usage }
POST /functions/:id/run       { input, options }        → { result, usage, requestId, draft?, trace? }
GET  /skills                  list functions + metadata (legacy alias route)
GET  /skills/:name            function detail (legacy alias route)
GET  /functions               list functions
GET  /functions/:id           function detail with status, version, last validation, currentInstructions, currentRules, currentRulesCount
```

Run responses include `requestId` (same as attribution `traceId` when provided). When the function is in draft status, the response includes `draft: true`. Pass `options.trace: true` in the run body to receive a `trace` object with the full prompt(s), model selection, and model used per call (for that request only; not stored). Run endpoints are rate-limited per key (see `RATE_LIMIT_PER_MINUTE`) and return `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers.

Run `mode` may be `weak`, `normal`, `strong`, `ultra`, or profile modes `best`, `cheapest`, `fastest`, `balanced`. Profile modes require a race to have been run first; otherwise the server returns `422` `NO_RACE_PROFILE`.

### Functions lifecycle

Create a function, iterate on it, validate quality, then release it to a stable versioned endpoint.

```
POST /functions               create: { id, seedInstructions, scoreGate?, rules? }
POST /functions/:id:validate  run schema + semantic scoring → { passed, scoreNormalized, cases }
POST /functions/:id:release   promote to released (blocked if score < scoreGate)
POST /functions/:id:rollback  set current instructions/rules to a previous version (body: `{ version: gitRef }`; requires version APIs)
POST /functions/:id:optimize  rewrite instructions in-place
POST /functions/:id:push      push to remote git repo (requires SKILLS_LOCAL_PATH)
GET  /functions/:id/versions instruction version history (git shas)
POST /functions/:id/versions/:version/run  run at a pinned version (ref = git sha from versions list)
GET  /functions/:id/test-cases
PUT  /functions/:id/test-cases  { testCases: [{ id, input, expectedOutput? }] }
POST /functions/:id/save-optimization  persist instructions, rules, examples from optimization wizard
POST /functions/generate-examples      { description, count?, mode? } → { examples, usage? }
```

### Race / benchmark

```
POST /race/models              race models, temperatures, or tokens (async job) — body: skillName|prompt, testCases?, candidates|models, functionKey?, applyDefaults?, raceLabel?, notes?, type? (model|temperature|tokens), model?, temperatures?, tokenValues?
GET  /functions/:id/profiles   race winner profiles and defaults → { defaults, profiles: { best, cheapest, fastest, balanced } }
GET  /functions/:id/race-report  race history — query: last, since, raceId → { races }
```

Job result for a race includes `ranked`, `raw`, `winners`, `usage`. Run with `mode: best|cheapest|fastest|balanced` uses the stored profile for that function.

The `cheapest` winner is selected by pricing rate using the bundled pricing table (see below).

### Optimization endpoints

```
POST /optimize/generate       generate instructions from test cases (async job)
POST /optimize/judge          score a response against rules → { pass, score, ruleResults }
POST /optimize/rules          generate rules from labeled examples or instructions
POST /optimize/rules-optimize optimize existing rules from examples with rationale (append/replace)
POST /optimize/fix            fix instructions from judge feedback → { fixedInstructions, changes, summary, usage, optional addedRuleBullets }
POST /optimize/compare        rank 2+ responses by quality → { ranking, bestId, candidates }
POST /optimize/instructions   one-shot instruction rewrite
POST /optimize/skill          rewrite one skill's instructions in-place
POST /optimize/batch          batch rewrite (async job)
```

### Jobs (for async operations)

```
GET /jobs               list recent jobs
GET /jobs/:id           status, progress, result
GET /jobs/:id/logs      streaming log lines
```

### Content workflows

```
POST /content/sync
POST /content/index
POST /content/fixtures
POST /content/layout-lint
```

### Cost estimation

All responses include `usage.costEstimate` with machine-readable cost status, confidence, reason, and source metadata.

- `usage.estimatedCost` is still returned for backward compatibility and mirrors `usage.costEstimate.amountUsd` when available.
- **OpenRouter exact cost:** when provider response includes `usage.cost`, `costEstimate.status="available"` and `source="provider-response"`.
- **Bundled pricing fallback:** OpenAI models can be estimated from `data/openai-cost.json` (`priceVersion: "openai-cost@2026-03-05"`), with `status="estimated"` and `source="provider-pricing-registry"`.
- **Unavailable pricing:** when cost cannot be computed, `amountUsd` is `null` and `costEstimate` includes `status="unavailable"` with a deterministic `reasonCode` (`BACKEND_NO_PRICING`, `MODEL_PRICING_MISSING`, `PRICE_LOOKUP_FAILED`, `USAGE_INCOMPLETE`, or `NOT_COMPUTED`).

---

### Function-level cost & activity tracking

Every LLM call is automatically tagged with the **function that originated it**, so usage data can be attributed precisely — not just at the model or account level.

**How it works:**

1. The server injects `functionId` automatically (e.g. `extract.requirements`, `optimize.judge`).
2. Callers may optionally pass `projectId`, `traceId`, and `tags` in any POST body.
3. The server embeds these as metadata in the outgoing provider request (`user` field for OpenRouter).
4. Every response returns extended attribution fields in the `usage` object.

**Optional request fields (any POST endpoint that calls an LLM):**

| Field | Type | Description |
|---|---|---|
| `projectId` | `string` | Logical project or tenant (e.g. `"cognni-prod"`) |
| `traceId` | `string` | Correlation ID for distributed tracing. Auto-generated UUID if omitted. |
| `tags` | `object` | Free-form key-value metadata (string values) |

**Example request:**

```json
POST /functions/extract.requirements/run
{
  "input": { "text": "..." },
  "projectId": "cognni-prod",
  "traceId": "req-983741",
  "tags": { "workflow": "classification", "environment": "production" }
}
```

**Extended `usage` response:**

```json
{
  "promptTokens": 240,
  "completionTokens": 82,
  "totalTokens": 322,
  "model": "openai/gpt-5-nano",
  "latencyMs": 1430,
  "estimatedCost": 0.000147,
  "costEstimate": {
    "amountUsd": 0.000147,
    "status": "estimated",
    "confidence": "medium",
    "source": "provider-pricing-registry",
    "priceVersion": "openai-cost@2026-03-05",
    "reason": "Estimated using bundled OpenAI pricing table."
  },
  "functionId": "extract.requirements",
  "projectId": "cognni-prod",
  "traceId": "req-983741",
  "tags": { "workflow": "classification", "environment": "production" }
}
```

`functionId` is always present. `projectId`, `traceId`, and `tags` appear only when provided.

The package itself remains **stateless** — it does not store usage history. The `usage` object is returned to the caller for forwarding to any external logging pipeline, analytics service, or dashboard.

---

### Analytics APIs

Proxy endpoints that fetch usage and cost data directly from the upstream provider. No data is stored by this server.

```
GET /models/available                 list models available via OpenRouter (x-openrouter-key or OPENROUTER_API_KEY)
GET /activity                         server-side activity log (query: from, to, functionId, projectId, model, limit) → { activities, summary }
GET /analytics/openrouter/credits     account balance and total usage
GET /analytics/openrouter/generations generation records (query: dateMin, dateMax, model, userTag, limit)
GET /analytics/openai/usage            org usage buckets — requires OPENAI_ADMIN_KEY (query: startTime, endTime, groupBy, projectIds, models, limit)
GET /analytics/openai/costs            org cost buckets  — requires OPENAI_ADMIN_KEY (query: startTime, endTime, groupBy, projectIds, limit)
```

**OpenRouter:** uses `x-openrouter-key` header (BYOK) or `OPENROUTER_API_KEY` env.

**OpenAI:** requires `OPENAI_ADMIN_KEY` env var (an admin-scoped key from your OpenAI org settings). Standard project keys do not have access to organization-level analytics.

**Filter generations by function or project:**

```
GET /analytics/openrouter/generations?userTag=cognni-prod:extract.requirements&dateMin=2026-03-01
```

The `userTag` filter matches the attribution tag this package injects into the OpenRouter `user` field, so you can pull all generations for a specific function or `project:function` pair.

---

### Server env vars

| Var | Default | Description |
|---|---|---|
| `PORT` | `3780` | Server port |
| `LIGHT_SKILLS_API_KEY` | — | If set, requires `x-api-key` header |
| `OPENROUTER_API_KEY` | — | Default OpenRouter key (overridden per-request by `x-openrouter-key`) |
| `MAX_CONCURRENCY` | `10` | Max parallel LLM calls |
| `RATE_LIMIT_PER_MINUTE` | `60` | Max run requests per minute per key (BYOK or server); responses include `X-RateLimit-Remaining`, `X-RateLimit-Reset` |
| `JOB_TTL` | `3600` | Seconds before completed jobs are cleaned up |
| `VALIDATE_SKILL_OUTPUT` | `0` | If `1`, all runs include schema validation |
| `SKILLS_LOCAL_PATH` | — | Local git path, required for `:push` endpoint |
| `OPENAI_ADMIN_KEY` | — | Admin-scoped OpenAI key, required for `GET /analytics/openai/*` |

Run endpoints enforce a 100KB max request body (413 when exceeded). Backend default timeout per LLM call is 60s; for a 120s run timeout (e.g. aifunction.dev free tier) configure your backend or client.

---

## Content (skills repo) workflow

```bash
npm run content:sync           # sync instructions to .content and push
npm run content:sync:optimize  # optimize instructions (requires OPENROUTER_API_KEY)
npm run content:index          # build library index (schemas/examples)
npm run content:fixtures       # validate examples vs io.output schemas
npm run content:layout-lint    # enforce folder-based layout
```

---

## Privacy & data handling

- **Library usage (npm):** everything runs in your environment.
- **REST server:** stateless by design — does not persist request/response bodies or API keys.

---

## Security notes

- Never commit `.env`
- Don't log provider keys
- Add `.content/` to `.gitignore`

---

## Testing

```bash
npm run test:unit     # unit tests only (no API key required)
npm test             # full suite
npm run typecheck    # TypeScript check
```

---

## Links

- GitHub: [https://github.com/ai-functions/aifunctions-js](https://github.com/ai-functions/aifunctions-js)
