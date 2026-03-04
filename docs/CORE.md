# Core offering

This package is three things:

## 1) A tiny, stable AI client (transport)

- **`createClient()`** — backend (openrouter, llama-cpp, transformers.js).
- **`ask()`** — generic instruction + output contract + input data → parsed JSON.
- **`askJson()`** — prompt + instructions + optional output contract → single JSON object (first-JSON extraction).
- **`parseJsonResponse()`** + **`extractFirstJson()`** — accept markdown-wrapped output and extract the first JSON object.

This is the transport layer every project needs.

---

## 2) A small set of high-value AI functions (prebuilt)

**Core 6 (ship first):**

| Function | Description |
|----------|-------------|
| **ask / askJson** | Generic instruction skill; JSON-only output. |
| **classify** | Classify text into labels. |
| **extractEntities** | Extract entities from text. |
| **summarize** | Summarize text (length options). |
| **matchLists** | Match items between two lists with optional guidance. |
| **rank** | Rank items by relevance to a query. |

**More text/list:**

- **extractTopics**, **translate**, **sentiment**, **cluster**

**Advanced (judge / compare):**

- **judge** — score instructions vs rules.
- **compare** — compare two instruction sets with a judge.

**Orchestration & pipelines:**

- **raceModels** — run multiple models on test cases, judge, rank.
- **generateInstructions** — loop: run → judge → aggregate → fix/generate-rule until threshold or max cycles.
- **optimizeInstructions** — optimize one instruction set for clarity/brevity.
- **aggregateJudgeFeedback** — aggregate judge outputs into a single feedback (optional reports).

**Records mapper:**

- **collectionMapping** — map fields between two collection schemas.

All of these are **functions, not prompts**: you call `classify({ text, labels })`, `extractEntities({ text })`, `matchLists({ list1, list2, guidance })`, etc. Internally they use file-based instruction packs.

---

## 3) Skill packs (file-based) that back those functions

- **weak / strong / ultra** instructions stored as content keys.
- Canonical layout: `skills/<skillId>/weak`, `strong`, `ultra`, `rules`.
- Each function is reproducible and shareable via the content repo.
- **Modes:** Use **weak | strong | ultra** only. (API alias: `normal` → `strong`.) No `normal.md`; no root-level `*-instructions.md` or `*-rules.json`.

---

## What we utilize (core-impact)

### A) JSON schema validation (minimal)

- **`validateAgainstSchema()`** / **`validateOutput()`** — validate `askJson`/skill outputs against a restricted JSON Schema (or library index `io.output`).
- Return structured errors; when used from `run()` with `validateOutput: true`, response is always `{ result, validation }` so the client sees the result and whether it passed the contract.

Optional: add **Ajv** as a dependency later for full JSON Schema; the built-in validator covers the common cases.

### B) First JSON object extraction

- **`extractFirstJson()`** — the pragmatic pattern: accept markdown-wrapped output, extract the first `{...}`.
- **`askJson()`** is the default for function skills.

### C) Retry policy (guardrails-lite)

- **Parse fail** → optional retry with stricter system (“JSON only”); `parseJsonResponse` supports `llmFallback` to re-call the model to extract JSON.
- **Schema fail** → do not throw; return result + `validation: { valid: false, errors }` so the caller can retry or fix (e.g. “fix output to match schema” in a second call).

No full guardrails framework — just parse + validate + explicit validation in the response.

---

## Standard modes (one vocabulary)

- **weak** — local / cheap (e.g. llama-cpp); shorter instructions.
- **strong** — cloud, high quality (e.g. openrouter).
- **ultra** — same preset as strong; use for “highest tier” content.

Skill files live only under `skills/<fn>/weak`, `strong`, `ultra` (and optional `rules`). No `normal.md`.

---

## Schema-backed functions

Each function has:

- A small TS type (request / response).
- Optional JSON schema used by validation when `validateOutput` or `outputSchema` is provided.
- If no schema, we still enforce “JSON object only” via `askJson` / first-JSON extraction.

---

## Fixtures

- **Light fixtures** for README and CI: examples that must parse + validate.
- **`npm run content:fixtures`** — validate stored example outputs against each skill’s schema.
- No big eval framework; just enough to catch regressions.

---

## Advanced: run by skill key + raw input

For teams that want custom skills or a lower-level API:

```ts
await runSkill({ key: "mySkill", mode: "strong", inputMd, resolver })
```

- **`key`** — skill name (e.g. `"mySkill"`) or content prefix (e.g. `"skills/mySkill"`); instructions are loaded from `skills/<key>/<mode>`.
- **`mode`** — `weak` | `strong` | `ultra`.
- **`inputMd`** — raw USER prompt (INPUT_MD).
- **`resolver`** — content resolver (e.g. `getSkillsResolver()`).

Returns parsed JSON. Use **`run(skillName, request, options)`** for the high-level “function” API; use **`runSkill`** when you have custom content keys and raw input.

---

## Capability checklist (nothing missed)

| Area | Capability | Status |
|------|------------|--------|
| **Transport** | createClient, ask, askJson, parseJsonResponse, extractFirstJson | ✅ |
| **Core 6** | ask/askJson, classify, extractEntities, summarize, matchLists, rank | ✅ |
| **More** | extractTopics, translate, sentiment, cluster | ✅ |
| **Judge** | judge, normalizeJudgeRules, aggregateJudgeFeedback | ✅ |
| **Compare** | compare | ✅ |
| **Orchestration** | raceModels, generateInstructions | ✅ |
| **Optimize** | optimizeInstructions, fixInstructions, generateRule, generateJudgeRules | ✅ |
| **Aggregation** | aggregateJudgeFeedback (reports optional) | ✅ |
| **Records** | collectionMapping | ✅ |
| **Run by name** | run(skillName, request), runWithContent | ✅ |
| **Run by key + input** | runSkill({ key, mode, inputMd, resolver }) | ✅ |
| **Validation** | validateOutput, validateAgainstSchema; response includes validation when requested | ✅ |
| **Modes** | weak \| strong \| ultra (normal → strong) | ✅ |
| **Skill packs** | Folder-based skills/<id>/weak, strong, ultra, rules | ✅ |
