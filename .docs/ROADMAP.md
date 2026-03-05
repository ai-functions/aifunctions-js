# aifunctions-js — Functions API Roadmap

## What this project is becoming

`aifunctions-js` started as a library: typed LLM-backed functions with JSON safety, retries, and a skill content store. The server (`src/serve.ts`) was a thin HTTP wrapper around that library — useful for internal tooling but not a product.

The roadmap below turns it into a **developer-facing Functions API**: a platform where developers create named, typed, versioned LLM-backed functions and call them over HTTP like any other REST endpoint. The library remains the engine. The server becomes the product surface.

The key shift is from "a prompt tool" to "a deployment platform for deterministic-ish LLM functions" — with stored test suites, score-gated releases, immutable versioned contracts, and BYOK inference. The primitives for this (judge, generateInstructions, validateOutput, content versioning) are already in the codebase. The roadmap wires them together into a coherent developer product.

---

## Phase 1 — Close the library gaps

These are internal changes to the library and content pipeline. No new product API surface. They unblock everything in Phase 2 and are the difference between "callable in 1 minute" and "production-ready in one optimization cycle."

### 1.1 Persist test cases per function

**What changes:** Add `getSkillTestCases` / `setSkillTestCases` to `src/content/skillsResolver.ts`, reading and writing `skills/<id>/test-cases.json` in the content store. Modeled on the existing `getSkillRules` / `setSkillRules` pattern already in that file.

**Why:** `generateInstructions()` accepts `testCases[]` at call time but never stores them. After the call, the test suite is gone. This means every re-run of optimization or validation requires the caller to re-supply the same test cases manually. Persisting them per-function makes the optimization loop reproducible and enables the score gate in 1.2.

**What it enables:** The release gate (Phase 2.5), scheduled revalidation (Phase 3), and CI-gated deploys.

---

### 1.2 Score-gated semantic validation

**What changes:** New function `validateFunction(resolver, skillId, options)` in `src/content/`. It runs two checks in sequence:

1. `runFixtures` (already in `src/content/runFixtures.ts`) — validates stored example outputs against the `io.output` JSON schema. Already exits non-zero on failure.
2. A new judge loop: loads test cases from `skills/<id>/test-cases.json`, calls `run(skillId, ...)` for each, judges each output against `skills/<id>/rules` using `judge()`, aggregates with `aggregateJudgeFeedback()`, returns `{ schemaValid, scoreNormalized, passed, threshold, cases[] }`.

**Why:** The current `runFixtures` only validates JSON shape — it checks that output fields exist and are the right type. It does not check whether the output is semantically correct. A function can pass schema validation while producing wrong answers. The judge loop is the second layer that makes "passed" actually mean something. `judge()`, `run()`, and `aggregateJudgeFeedback()` are all already implemented — this change wires them.

**What it enables:** The validate endpoint (Phase 2.4) and the release gate (Phase 2.5). Without this, "release" would be shape-only, not quality-gated.

---

### 1.3 Wire optimization output back to the content store

**What changes:** Add an optional `{ persist: true, resolver }` parameter to `generateInstructions()`. When set, after the loop completes, call `setSkillInstructions(resolver, skillId, best.instructions)` automatically.

**Why:** `generateInstructions()` returns the best-found instructions as a value but never persists them. The caller must manually extract the result and call `setSkillInstructions`. In the current CLI workflow (`scripts/testOptimizeAndPush.ts`), this is handled explicitly — but it's fragile: if the caller forgets the write step, optimization results are lost. For the `POST /functions/{id}:optimize` endpoint in Phase 2, the write-back must be automatic and atomic with the optimization run.

**What it enables:** `POST /functions/{id}:optimize` can be a complete, self-contained operation with no manual follow-up step.

---

### 1.4 Function metadata record per skill

**What changes:** New content key `skills/<id>/meta.json` with shape:
```json
{
  "status": "draft",
  "version": null,
  "releasedAt": null,
  "lastValidation": { "score": 0.91, "passed": true, "runAt": "ISO timestamp" },
  "scoreGate": 0.85
}
```
New functions `getFunctionMeta` / `setFunctionMeta` in `src/content/skillsResolver.ts`.

**Why:** There is currently no per-function state. The library index (`SkillIndexEntry` in `src/content/libraryIndex.ts`) has `io`, `description`, `examples`, and `quality.confidence` — but no `status` (draft vs released), no release version, no score gate threshold, and no record of the last validation run. Without this record, the server has no way to enforce draft/release semantics or report whether a function has been validated.

**What it enables:** Draft/release distinction (Phase 2.5), the `GET /functions/{id}` response showing current status and last validation score, and rollback by version.

---

### 1.5 BYOK per-request inference key

**What changes:** In `handleRun` in `src/serve.ts`, extract the `x-openrouter-key` request header (already in the CORS allow-list at line 71 but never read) and pass it to `createClient({ backend: "openrouter", openrouter: { apiKey: headerKey } })`. Pass this client into `run()`, which already accepts a `client` option.

**Why:** The free tier of the hosted product must cost nothing to operate. BYOK (bring your own OpenRouter key) means users bear their own inference cost. The header was already planned — it appears in `CORS_HEADERS` in `src/serve.ts` — but the wire-up was never completed. This is a small change with large product impact: it makes the free tier economically viable without infrastructure investment.

**What it enables:** A credible free tier. Launch without paying inference costs.

---

## Phase 2 — The Functions API server

Expose the library's capabilities as a clean developer API. Rename the product surface from "skills" to "functions." Add creation, test case management, validation, and release endpoints. Surface the versioning APIs that already exist in the library but have no HTTP routes.

### 2.1 Route aliasing: `/functions/*`

**What changes:** Add `/functions/*` routes to `src/serve.ts` pointing to the same handlers as the existing `/skills/*` routes. Keep `/skills/*` for backwards compatibility. Over time, deprecate `/skills/*`.

**Why:** The word "skills" is an internal implementation term from the library's content model. "Functions" is the product concept — what developers create, call, version, and release. The rename is the difference between an internal tool and a product with a clear mental model.

---

### 2.2 `POST /functions` — create a function

**What changes:** New handler and route. Accepts:
```json
{
  "id": "extract-invoice-lines",
  "description": "Extract line items from invoice text",
  "seedInstructions": "Extract all line items...",
  "schema": { "input": {...}, "output": {...} },
  "examples": [{ "input": {...}, "output": {...} }],
  "scoreGate": 0.85
}
```
Handler writes `skills/<id>/strong`, `skills/<id>/weak`, `skills/<id>/meta.json` (status: `draft`), optionally `skills/<id>/test-cases.json` and schema into the index entry. Returns `{ id, endpoint, status: "draft", version: null }`.

**Why:** Currently there is no way to create a function via API. Skills are created by writing files to a git repo and running `content:sync` from the CLI. That is a developer-machine workflow, not a product API. This endpoint is the front door of the product: the first thing a developer does to get a callable endpoint.

---

### 2.3 `PUT /functions/{id}/test-cases` and `GET /functions/{id}/test-cases`

**What changes:** Two new endpoints that read and write `skills/<id>/test-cases.json` via `getSkillTestCases` / `setSkillTestCases` from Phase 1.1.

**Why:** Test cases are the ground truth for quality. Without a way to persist them via API, they must be re-supplied on every optimization or validation call — which breaks the "set once, validate forever" developer experience. These endpoints close the loop: a developer defines test cases once, and every subsequent optimize/validate/release uses them automatically.

---

### 2.4 `POST /functions/{id}:validate`

**What changes:** New endpoint that calls `validateFunction()` from Phase 1.2. Returns schema validity, semantic score, per-case results, and whether the score passes the function's configured gate. Also writes `lastValidation` into `skills/<id>/meta.json`.

**Why:** Developers need a way to check whether their function is ready to release without actually releasing it. This endpoint is the manual trigger for what the release gate runs automatically. It's also the CI integration point: `curl POST /functions/{id}:validate` in a CI pipeline with a threshold check on the response is the "can it fail the build?" answer.

---

### 2.5 `POST /functions/{id}:release`

**What changes:** New endpoint that:
1. Loads `meta.json`, checks status
2. Runs `validateFunction()` — returns 422 with score details if below `scoreGate`
3. Commits current state to git via `pushSkillsContent` (already in `src/content/publishSkills.ts`)
4. Creates a git tag `functions/<id>/vN`
5. Writes `meta.json` with `status: "released"`, `version: "vN"`, `releasedAt`
6. Returns `{ version, endpoint, score }`

Draft functions remain callable but return `"draft": true` in the response envelope. Released functions always resolve to the pinned version.

**Why:** This is the product's core quality guarantee. Without an explicit release gate, there is no distinction between "I'm testing this" and "I'm deploying this to production." The gate is what makes the promise "your function has a stable contract" true — it enforces that nothing reaches a released version without passing the score threshold.

---

### 2.6 `GET /functions/{id}/versions`

**What changes:** New endpoint that calls `getSkillInstructionVersions(resolver, id)` — already implemented in `src/content/skillsResolver.ts` at line 286, just not exposed via any HTTP route. Returns `{ versions: [{ sha, message, date, tag }] }`.

**Why:** Developers need rollback. If a new optimization makes a function worse, they need to pin to a previous SHA. The git history traversal is already built in the library — exposing it is ~30 lines of server code.

---

## Phase 3 — Hosted infrastructure

This phase turns the single-tenant server into a multi-tenant product. It should not be started until Phase 1 and Phase 2 are stable and validated with real developers.

### 3.1 Per-user API key registry

**What changes:** Replace `src/serve/auth.ts` (single env-var key, no identity) with a key table: `{ key_hash, user_id, plan, rate_limit_rpm, created_at, last_used_at }`. The `requireAuth` function returns the user context instead of just `{ ok: true }`. Interface is backwards-compatible — downstream handlers still see auth pass/fail.

**Why:** The current auth is a binary on/off switch for the entire server. A hosted product needs per-user identity to enforce plan limits, namespace content, attribute usage, and support team RBAC. This is the anchor for every other Phase 3 change.

---

### 3.2 Per-user content namespacing

**What changes:** Namespace the content store by org: `orgs/<orgId>/skills/<id>/...` instead of `skills/<id>/...`. The `skillInstructionsKeyForMode` function in `src/content/skillsResolver.ts` takes the key as a parameter — prefix it with the org ID from the auth context. All library content logic is unchanged; only the key prefix changes.

Option A (shared repo, namespaced keys) is the starting point. Option B (one git repo per org) is deferred — see DEFERRED.md.

**Why:** A hosted product where all users share one flat `skills/` namespace is not viable. User A can overwrite user B's functions. Private functions are not private. Namespacing by org makes the content store multi-tenant without requiring separate infrastructure per customer.

---

### 3.3 Durable job store

**What changes:** Replace `src/serve/jobs.ts` (in-memory `Map`, lost on restart, no tenant isolation) with a persistent store. The `Job` type and all accessor functions (`createJob`, `getJob`, `updateJob`, `appendJobLog`, `listJobs`) stay identical — only the backing store changes. SQLite is sufficient for a single-instance deployment; Redis or Postgres for multi-instance.

**Why:** Long-running operations (optimize batch, race models, content sync) return a `jobId` that the developer polls. If the server restarts, all in-flight job state is lost and the developer gets a 404 on their job ID. For a production API this is unacceptable. The fix is purely a storage swap — the interface is already correct.

---

### 3.4 Per-user rate limiting

**What changes:** Replace the global `concurrencyGuard` in `src/serve.ts` with a per-user token bucket using `rate_limit_rpm` from the auth context (Phase 3.1). The global cap stays as a hard server ceiling.

**Why:** The current `MAX_CONCURRENCY` counter is shared across all users. One user making a batch optimize request can starve all other users. Per-user limits make the service fair and allow plan differentiation (free: 10 RPM, paid: 100 RPM).

---

### 3.5 Metered inference (optional premium tier)

**What changes:** For paid users who don't want to manage their own OpenRouter key, proxy inference under a platform key. Track token usage per API key. Expose usage in `GET /functions/{id}` and in billing webhooks.

**Why:** BYOK (Phase 1.5) is the free tier. "We pay, you don't configure anything" is the premium onboarding experience. The billing unit is natural: token consumption per function call is directly measurable and maps to real cost. This is how most successful LLM infra SaaS products monetize (Helicone, Braintrust, etc.).

---

## Execution order

| Step | Change | Estimated effort |
|------|--------|-----------------|
| 1 | Phase 1.5 — BYOK wire-through | 1 day |
| 2 | Phase 1.4 — `meta.json` per function | 1 day |
| 3 | Phase 2.2 — `POST /functions` creation | 2 days |
| 4 | Phase 1.1 — persist test cases | 1 day |
| 5 | Phase 2.3 — test case endpoints | 1 day |
| 6 | Phase 1.2 — score-gated validation | 2 days |
| 7 | Phase 2.4 — validate endpoint | 1 day |
| 8 | Phase 2.5 — release endpoint | 2 days |
| 9 | Phase 2.6 — versions endpoint | 0.5 days |
| 10 | Phase 1.3 — persist optimized instructions | 0.5 days |
| 11 | Phase 2.1 — route aliasing | 0.5 days |
| 12 | Phase 3.1 — key registry | 3 days |
| 13 | Phase 3.2 — content namespacing | 2 days |
| 14 | Phase 3.3 — durable job store | 2 days |
| 15 | Phase 3.4 — per-user rate limiting | 1 day |
| 16 | Phase 3.5 — metered inference | 3 days |

Phases 1 and 2 (steps 1–11) are the complete self-hostable product. Phase 3 (steps 12–16) is the hosted multi-tenant infrastructure. Launch as open-source after step 11 to validate the API surface with real developers before investing in multi-tenancy.
