# Functions spec: I/O, modes, SYSTEM & USER templates

Every LLM-backed function in this library follows the same convention:

- **SYSTEM** = the function’s skill instructions (mode-specific: weak / normal / strong).
- **USER** = the function input rendered as **Markdown (`INPUT_MD`)**.
- **Model output** must match the function’s output contract (usually **JSON only**).

**Modes:** We use `weak` | `normal` | `strong`. Where other docs say **ultra**, treat it as **strong** (same preset: OpenRouter, higher-capability model). Mode affects default model, temperature, and which SYSTEM template variant is used.

---

## Generic vs non-generic

- **Generic (use the core):** Single LLM call, same SYSTEM + USER (`INPUT_MD`) pattern. These go through the core executor: `ai.ask`, `ai.askJson`, listed skills (extractTopics, matchLists, summarize, …), and most content-based skills. They share one execution path and can all be improved by the optimization flows below.
- **Non-generic:** Either **orchestration-only** (no direct LLM call: e.g. `compare`, `raceModels`, `generateInstructions`) or **deterministic** (no LLM: `ai.parseJsonResponse` extraction, `ai.normalize-judge-rules.v1`, `ai.aggregate-judge-feedback.v1`). Orchestrators call other skills; they still benefit from having those skills’ instructions and rules improved.

**Use the optimization flows below on all of them** — i.e. improve instructions and rules for every skill (generic or the ones an orchestrator calls).

---

## Improving instructions and rules (use on all skills)

Use these to improve instructions and rules for **any** skill (generic or the skills used inside orchestrators):

- **`optimizeInstructions`** — **One-shot (or few-shot) tune-up.** Input: seed instructions + optional good/bad examples. Output: **better instructions + better examples + judgeRules**. Use when you want a quick bootstrap. Then run the output judgeRules through **`ai.normalize-judge-rules.v1`**.
- **`generateInstructions`** — **Iterative optimizer loop.** Input: seed instructions (e.g. from optimizeInstructions) + test cases + judgeRules (e.g. normalized) + target score. Runs cycles: run model → judge → fix/generate-rule until average score crosses target (or max cycles). Use when you want to **really** optimize toward a target score.

**How to pick (in practice):**

1. **Start here (best default): `optimizeInstructions`**
   - You have seed instructions and maybe a couple good/bad examples.
   - Output: **better instructions + better examples + judgeRules**.
   - Then run the result through **`ai.normalize-judge-rules.v1`**.

2. **Then do this for real optimization: `generateInstructions`**
   - Use the **optimizedInstructions** from step 1 as the seed.
   - Use the **judgeRules** (normalized).
   - Run cycles until your **average score crosses target** (or keep improving with `forceContinueAfterPass`).

**If you don’t have rules at all:**

- Call **`generateJudgeRules`** (or let the orchestration auto-generate them), then **`ai.normalize-judge-rules.v1`**.

**Summary:**

| Function | Role |
|----------|------|
| **optimize-instructions** | Bootstrap: produce better instructions + examples + judgeRules (one-shot/few-shot). |
| **generate-instructions** | Iterative optimizer loop to reach a target score (cycles of run → judge → fix). |

---

This document lists **all** functions below: implemented (built-in or content-based) and specified-for-content. For each we give: **What it does**, **Modes**, **Request (input)**, **Response (output)**, **SYSTEM templates**, and **USER prompt template (`INPUT_MD`)**.

---

# A) Core LLM call primitives

## 1) `ai.ask`

**What:** Generic “do what the instruction says” LLM call.

**Modes:** weak / normal / strong

### Request (input)

```ts
type AskParams = {
  instruction: string;
  outputContract: string;
  inputData?: string | Record<string, unknown>;
  mode?: "weak" | "normal" | "strong";
  client?: Client;
  model?: string;
};
```

### Response (output)

Parsed JSON (shape defined by `outputContract` / caller).

### SYSTEM templates

**STRONG / NORMAL (generic)**

```text
You are ai.ask.
Follow the instruction exactly.
Do not add extra text unless asked.
If JSON-only is requested, output JSON only (no markdown, no code fences).
```

**WEAK (Llama-2 class, extra formatting enforcement)**

```text
You are ai.ask.
Follow the instruction exactly.
If JSON is requested: output ONLY a single JSON object.
First char must be { and last char must be }.
No text before/after.
```

*(Current implementation uses a single sentence for weak/normal; the above can be used when syncing from content.)*

### USER template (`INPUT_MD`)

```md
# ai.ask
## Instruction
{{instruction}}
## Output Contract
{{outputContract}}
## Input Data (optional)
{{inputData}}
```

**Status:** Implemented (`ask` in code; run name `ai.ask`).

---

## 2) `ai.parseJsonResponse` (deterministic; optional LLM fallback)

**What:** Extract first JSON object from text and parse. No LLM in the happy path.

**Modes:** none (deterministic). Optional LLM fallback uses normal/strong when extraction fails.

### Request (input)

```ts
type ParseJsonResponseRequest = { text: string };
// + options: { llmFallback?: boolean; client?; mode?; model? }
```

### Response (output)

```ts
type ParseJsonResponseResult =
  | { ok: true; json: unknown }
  | { ok: false; errorCode: string; message: string };
```

### Fallback LLM skill (when `llmFallback: true`)

**SYSTEM (STRONG/NORMAL)**

```text
Extract the FIRST valid JSON object from the text.
Return ONLY that JSON object. No markdown, no extra text.
```

**USER (`INPUT_MD`)**

```md
# ai.parseJsonResponse
## Text
{{text}}
```

**Status:** Implemented (`parseJsonResponse`; deterministic + optional LLM fallback).

---

## 3) `ai.askJson`

**What:** `ask()` + extract-first-JSON + parse (no schema validation).

**Modes:** weak / normal / strong

### Request (input)

```ts
type AskJsonParams = {
  prompt: string;
  instructions: { weak: string; normal: string; strong?: string };
  outputContract?: string;
  requiredOutputShape?: string;
  mode?: "weak" | "normal" | "strong";
  client?: Client;
  model?: string;
};
```

### Response (output)

```ts
type AskJsonResponse = CallAIResult<T>;  // { data: T; usage; raw }
// On parse failure: errorCode / message in flow.
```

### SYSTEM templates

**STRONG / NORMAL**

```text
You are ai.askJson.
Return EXACTLY ONE valid JSON object. No markdown, no code fences, no extra text.
Do not invent fields unless asked.
```

**WEAK**

```text
Return JSON ONLY: one JSON object.
First char { last char }.
If impossible, return {"error":"cannot_complete","reason":"..."}.
```

### USER (`INPUT_MD`)

```md
# ai.askJson
## Instruction
{{prompt}}
## Required Output Shape (optional)
{{requiredOutputShape}}
## Output Contract (optional)
{{outputContract}}
```

**Status:** Implemented (`askJson`).

---

# B) Records-mapper embedded function

## 4) `recordsMapper.collectionMapping.v1`

**What:** Given two collection summaries (e.g. MongoDB) → mapping JSON (typed).

**Modes:** weak / normal / strong

### Request (input)

```ts
type CollectionSummary = {
  server: string; db: string; collection: string;
  fields: Array<{ name: string; inferredType?: string; sampleValues?: string[] }>;
};
type CollectionMappingRequest = {
  left: CollectionSummary;
  right: CollectionSummary;
  constraints?: { maxFieldMappings?: number };
  mode: "weak" | "normal" | "strong";
  options?: Partial<AskRequest["options"]>;
};
```

### Response (output)

```ts
type CollectionMappingOutput = {
  schemaVersion: "xmemory.records-mapper.llm.collection-mapping.v1";
  collectionMatchConfidence: number;
  reason?: string;
  fieldMappings: Array<{ leftField: string; rightField: string; confidence: number; reason?: string }>;
  notes?: string[];
};
```

### SYSTEM (STRONG)

```text
You are recordsMapper.collectionMapping.v1.
Output ONLY one JSON object with schemaVersion "xmemory.records-mapper.llm.collection-mapping.v1".
Never invent field names; only use names from provided lists.
Prefer precision; omit uncertain mappings.
No markdown or extra text.
```

### USER (`INPUT_MD`)

```md
# recordsMapper.collectionMapping.v1
## Left Collection
- server: {{left.server}}, db: {{left.db}}, collection: {{left.collection}}
### Fields
{{left.fieldsMdList}}
## Right Collection
- server: {{right.server}}, db: {{right.db}}, collection: {{right.collection}}
### Fields
{{right.fieldsMdList}}
## Constraints
- maxFieldMappings: {{constraints.maxFieldMappings}}
## Output Schema
(schemaVersion must be xmemory.records-mapper.llm.collection-mapping.v1)
```

**Status:** Spec only. Implement as content-based skill (instructions + rules in git) or add built-in later.

---

# C) Judge + comparator + instruction repair

## 5) `ai.judge.v1` (STRONG recommended)

**What:** Score pass/fail using weighted rules; include evidences; partial penalties allowed.

**Modes:** normal / strong (judge recommended as strong when evaluating others)

### Request (input)

```ts
type JudgeRule = { rule: string; weight: number };
type JudgeRequest = {
  instructions: string;
  response: string;
  rules: JudgeRule[];
  threshold: number;
  mode: "normal" | "strong";
};
```

### Response (output)

```ts
type JudgeOutput = {
  schemaVersion: "ai.judge.v1";
  pass: boolean;
  maxPoints: number;
  lostPoints: number;
  scorePoints: number;
  scoreNormalized: number;
  threshold: number;
  ruleResults: Array<{
    rule: string; weight: number;
    penalty: number;
    evidences: Array<{ evidence: string; source: "response" | "instruction"; note?: string }>;
    notes?: string;
  }>;
  failedRules: string[];
  summary: string;
};
```

### SYSTEM (STRONG)

```text
You are ai.judge.v1.
Return ONLY JSON (schema ai.judge.v1). No extra text.
Each rule weight is MAX points that can be lost. penalty in [0..weight] (partial allowed).
If penalty>0, include at least 1 evidence snippet (short exact quote).
Compute scoreNormalized = (maxPoints-lostPoints)/maxPoints (or 1 if maxPoints=0).
pass if scoreNormalized >= threshold.
Do not add requirements outside the given rules.
```

### USER (`INPUT_MD`)

```md
# ai.judge.v1
## Instructions
{{instructions}}
## Response
{{response}}
## Rules
{{rulesMdList}}
## Threshold
{{threshold}}
```

**Status:** Spec only. Add as content-based skill (instructions in git) or built-in.

---

## 6) `ai.compare.v1` (orchestration-only)

**What:** Rank 2+ responses by calling `ai.judge.v1` for each. No direct LLM call for compare itself.

### Request (input)

```ts
type CompareRequest = {
  instructions: string;
  responses: Array<{ id: string; text: string }>;
  rules: JudgeRule[];
  threshold: number;
  mode: "normal" | "strong";
};
```

### Response (output)

```ts
type CompareOutput = {
  schemaVersion: "ai.compare.v1";
  ranking: Array<{ id: string; scoreNormalized: number; pass: boolean; lostPoints: number }>;
  bestId: string;
  candidates: Array<{ id: string; judge: JudgeOutput }>;
  summary: string;
};
```

**Status:** Spec only. Implement as orchestrator calling `ai.judge.v1`.

---

## 7) `ai.fix-instructions.v1` (STRONG)

**What:** Improve instructions given aggregated judge feedback.

### Request (input)

```ts
type FixInstructionsRequest = {
  instructions: string;
  judgeFeedback: object;
  mode: "strong";
};
```

### Response (output)

```ts
type FixInstructionsOutput = {
  schemaVersion: "ai.fix-instructions.v1";
  fixedInstructions: string;
  changes: Array<{ kind: "add" | "rewrite" | "clarify" | "reorder"; description: string }>;
  addedRuleBullets: string[];
  summary: string;
};
```

### SYSTEM (STRONG)

```text
You are ai.fix-instructions.v1.
Return ONLY JSON.
Do not change intent. Make constraints clearer and more testable.
Use judgeFeedback focusRules/worstTests to fix the biggest failures first.
```

### USER (`INPUT_MD`)

```md
# ai.fix-instructions.v1
## Original Instructions
{{instructions}}
## Judge Feedback (JSON)
```json
{{judgeFeedbackJson}}
```
```

**Status:** Spec only. Content-based or built-in.

---

## 8) `ai.generate-rule.v1` (STRONG)

**What:** Suggest instruction-rule strings to add (not judge rules).

### Request (input)

```ts
type GenerateRuleRequest = {
  instructions: string;
  judgeFeedback: object;
  mode: "strong";
};
```

### Response (output)

```ts
type GenerateRuleOutput = {
  schemaVersion: "ai.generate-rule.v1";
  rulesToAdd: string[];
  rationale: string;
};
```

### SYSTEM (STRONG)

```text
Propose 3-8 short, testable instruction bullets to prevent failures in judgeFeedback.
No new intent; only enforce what is already implied.
Return JSON only.
```

### USER (`INPUT_MD`)

```md
# ai.generate-rule.v1
## Instructions
{{instructions}}
## Judge Feedback (JSON)
```json
{{judgeFeedbackJson}}
```
```

**Status:** Spec only.

---

# D) Auto-generate judge rules + deterministic safety rails

## 9) `ai.generate-judge-rules.v1` (STRONG)

**What:** Derive `JudgeRule[]` from instructions (autonomy when rules missing).

### Request (input)

```ts
type GenerateJudgeRulesRequest = {
  instructions: string;
  targetRuleCount?: number;
  weightScale?: "1-3" | "1-5" | "1-10";
  includeFormatRules?: boolean;
  mode: "strong";
  /** When true, write a report to reports/generate-judge-rules/ (e.g. for the given skill/call). */
  report?: boolean;
};
```

### Response (output)

```ts
type GenerateJudgeRulesOutput = {
  schemaVersion: "ai.generate-judge-rules.v1";
  rules: JudgeRule[];
  extractedConstraints: string[];
  summary: string;
};
```

### SYSTEM (STRONG)

```text
Convert instructions into atomic, testable judge rules with weights.
Do NOT add new requirements—rules must be implied by instructions.
Stable ordering: format constraints first, then mandatory fields/structure, then core task.
Return JSON only.
```

### USER (`INPUT_MD`)

```md
# ai.generate-judge-rules.v1
## Instructions
{{instructions}}
## Options
- targetRuleCount: {{targetRuleCount}}
- weightScale: {{weightScale}}
- includeFormatRules: {{includeFormatRules}}
```

**Status:** Spec only.

---

## 10) `ai.normalize-judge-rules.v1` (deterministic; no LLM)

**What:** Sanitize, clamp weights, dedupe, cap count, ensure non-empty.

### Request (input)

```ts
type NormalizeJudgeRulesRequest = {
  rules: JudgeRule[];
  weightScale: "1-3" | "1-5" | "1-10";
  targetRuleCount?: number;
  maxRuleLength?: number;
  minRules?: number;
  maxRules?: number;
  /** When true, write a report to reports/normalize-judge-rules/ (e.g. dropped/modified summary). */
  report?: boolean;
};
```

### Response (output)

```ts
type NormalizeJudgeRulesOutput = {
  schemaVersion: "ai.normalize-judge-rules.v1";
  rules: JudgeRule[];
  dropped: Array<{ rule: string; reason: string }>;
  modified: Array<{ before: string; after: string; reason: string }>;
  summary: string;
};
```

**Status:** Spec only. Implement as pure function.

---

## 11) `ai.aggregate-judge-feedback.v1` (deterministic; no LLM)

**What:** Combine many `JudgeOutput`s into one aggregated feedback object for optimizers.

### Request (input)

```ts
type AggregateJudgeFeedbackRequest = {
  instructions: string;
  rules?: JudgeRule[];
  threshold: number;
  tests: Array<{ testCaseId: string; responseText: string; judge: JudgeOutput }>;
  keepTopRules?: number;
  keepWorstTests?: number;
  maxEvidencesPerRule?: number;
};
```

### Response (output)

```ts
type AggregateJudgeFeedbackOutput = {
  schemaVersion: "ai.judge-feedback.aggregate.v1";
  threshold: number;
  testCount: number;
  passCount: number;
  passRate: number;
  avgScoreNormalized: number;
  avgLostPoints: number;
  ruleStats: Array<{ rule: string; weight: number; triggerCount: number; ...; evidences: ... }>;
  focusRules: string[];
  worstTests: Array<{ testCaseId: string; scoreNormalized: number; ...; evidenceSnippets: ... }>;
  summary: string;
};
```

**Status:** Spec only. Implement as pure function.

---

# E) Benchmarking + autonomous instruction generation

## 12) `ai.race-models.v1` (orchestration; judge STRONG)

**What:** Try many models on many inputs; judge each; rank; report per test and averages.

### Request (input)

```ts
type RaceModelsRequest = {
  taskName: string;
  call: "ask" | "askJson";
  skill: { strongSystem: string; weakSystem?: string };
  testCases: Array<{ id: string; inputMd: string }>;
  judgeRules?: JudgeRule[];
  threshold: number;
  models: Array<{ id: string; model: string; vendor?: string|string[]; class: "weak"|"normal"|"strong"; options?: Partial<AskRequest["options"]> }>;
};
```

### Response (output)

```ts
type RaceModelsOutput = {
  schemaVersion: "ai.race-models.v1";
  ranking: Array<{ modelId: string; avgScoreNormalized: number; passRate: number; avgLostPoints: number }>;
  details: Array<{ modelId: string; perTest: Array<{ testCaseId: string; responseText: string; judge: JudgeOutput }> }>;
  bestModelId: string;
  summary: string;
};
```

**Status:** Spec only. Orchestrator: ask/askJson + ai.judge.v1.

---

## 13) `ai.generate-instructions.v1` (orchestration loop; judge STRONG)

**What:** Iterate: run model → judge → improve (generate-rule + fix-instructions) until threshold or max cycles.

### Request (input)

```ts
type GenerateInstructionsRequest = {
  seedInstructions: string;
  testCases: Array<{ id: string; inputMd: string }>;
  call: "ask" | "askJson";
  targetModel: { model: string; vendor?: string|string[]; class: "weak"|"normal"|"strong"; options?: Partial<AskRequest["options"]> };
  judgeRules?: JudgeRule[];
  judgeThreshold: number;
  targetAverageThreshold: number;
  loop: { maxCycles: number; forceContinueAfterPass?: boolean; patienceCycles?: number; minDeltaToCount?: number };
  optimizer: { mode: "strong" };
  /** When true, write a report to reports/generate-instructions/ (e.g. per-skill history and best/final). */
  report?: boolean;
};
```

### Response (output)

```ts
type GenerateInstructionsOutput = {
  schemaVersion: "ai.generate-instructions.v1";
  achieved: boolean;
  cyclesRun: number;
  best: { instructions: string; avgScoreNormalized: number; passRate: number };
  final: { instructions: string; avgScoreNormalized: number; passRate: number };
  history: Array<{ cycle: number; instructions: string; perTest: ...; avgScoreNormalized: number; ... }>;
  summary: string;
};
```

**Status:** Spec only. Orchestrator using judge, generate-rule, fix-instructions.

---

# F) Higher-level tuner: instructions + examples + judge rules

## 14) `ai.optimize-instructions.v1` (STRONG)

**What:** Given seed instructions + optional examples (good/bad with rationale) → optimized instructions, improved examples, judge rules.

### Request (input)

```ts
type OptimizeInstructionsRequest = {
  seedInstructions: string;
  examples?: Array<{
    id: string;
    inputMd: string;
    outputs?: Array<{ id: string; text: string; label: "good"|"bad"; rationale?: string }>;
    notes?: string;
  }>;
  targetRuleCount?: number;
  weightScale?: "1-3"|"1-5"|"1-10";
  includeFormatRules?: boolean;
  strictness?: "balanced"|"strict";
  mode: "strong";
  /** When true, write a report to reports/optimize/ (or reports/optimize-instructions/). */
  report?: boolean;
};
```

### Response (output)

```ts
type OptimizeInstructionsOutput = {
  schemaVersion: "ai.optimize-instructions.v1";
  optimizedInstructions: string;
  judgeRules: JudgeRule[];
  improvedExamples: Array<{
    id: string;
    inputMd: string;
    improvedGoodOutputs: Array<{ id: string; text: string; whyGood: string }>;
    improvedBadOutputs: Array<{ id: string; text: string; whyBad: string }>;
    extractedLessons: string[];
  }>;
  changes: Array<{ kind: "add"|"rewrite"|"clarify"|"reorder"|"remove"; description: string }>;
  extractedConstraints: string[];
  summary: string;
};
```

### SYSTEM (STRONG)

```text
You are ai.optimize-instructions.v1.
Return ONLY JSON.
Improve clarity/enforceability without changing intent.
Use examples to tighten constraints and generate atomic judgeRules.
Make improvedGoodOutputs golden, improvedBadOutputs targeted failures with why.
No new requirements beyond what seed+examples imply.
```

### USER (`INPUT_MD`)

```md
# ai.optimize-instructions.v1
## Seed Instructions
{{seedInstructions}}
## Examples (optional)
{{examplesMd}}
## Options
- targetRuleCount: {{targetRuleCount}}
- weightScale: {{weightScale}}
- includeFormatRules: {{includeFormatRules}}
- strictness: {{strictness}}
```

**Status:** Spec only. Content-based or built-in.

---

# Listed library skills (built-in; same convention)

These use the same SYSTEM / USER convention. Each has mode-specific instructions and INPUT_MD built from the request.

| Skill | What | Modes | Request → Response |
|-------|------|--------|--------------------|
| **extractTopics** | Extract key topics from text | weak / normal / strong | `{ text, maxTopics? }` → `{ topics: string[] }` |
| **extractEntities** | Extract named entities | weak / normal / strong | `{ text, entityTypes? }` → `{ entities: Entity[] }` |
| **matchLists** | Match two lists by similarity | weak / normal / strong | `{ list1, list2, guidance, existingMatches? }` → `{ matches, unmatched }` |
| **summarize** | Summary + key points | weak / normal / strong | `{ text, length? }` → `{ summary, keyPoints }` |
| **classify** | Classify into categories | weak / normal / strong | `{ text, categories, allowMultiple? }` → `{ categories, confidence? }` |
| **sentiment** | Sentiment + score | weak / normal / strong | `{ text }` → `{ sentiment, score }` |
| **translate** | Translate to target language | weak / normal / strong | `{ text, targetLanguage }` → `{ translatedText, detectedSourceLanguage? }` |
| **rank** | Rank items by query relevance | weak / normal / strong | `{ items, query }` → `{ rankedItems }` |
| **cluster** | Semantic clusters | weak / normal / strong | `{ items, numClusters? }` → `{ clusters }` |

For each, **SYSTEM** = skill instructions (from code or content), **USER** = request rendered as INPUT_MD (e.g. `# extractTopics\n\n## Request\n\n```json\n...\n```` or plain text where appropriate). **Output** = JSON per response type.

---

# Autonomy rule (missing judge rules)

For judge/compare/race-models/generate-instructions:

- If `rules` is missing or empty:
  1. Call `ai.generate-judge-rules.v1` (strong).
  2. Call `ai.normalize-judge-rules.v1`.
  3. Proceed with the resulting rules.

---

# Implementation status summary

**Type:** *Generic* = single LLM call, uses core executor. *Orchestration* = calls other skills, no direct LLM. *Deterministic* = no LLM.

| Function | Type | Status |
|----------|------|--------|
| ai.ask | Generic | Implemented |
| ai.parseJsonResponse | Deterministic (+ optional LLM fallback) | Implemented |
| ai.askJson | Generic | Implemented |
| collectionMapping | Generic | Implemented (run name: `collectionMapping` or `recordsMapper.collectionMapping.v1`) |
| judge | Generic | Implemented (run name: `judge` or `ai.judge.v1`) |
| compare | Orchestration | Implemented (run name: `compare` or `ai.compare.v1`) |
| fixInstructions | Generic | Implemented (run name: `fixInstructions` or `ai.fix-instructions.v1`) |
| generateRule | Generic | Implemented (run name: `generateRule` or `ai.generate-rule.v1`) |
| generateJudgeRules | Generic | Implemented (run name: `generateJudgeRules` or `ai.generate-judge-rules.v1`) |
| ai.normalize-judge-rules.v1 | Deterministic | Implemented |
| ai.aggregate-judge-feedback.v1 | Deterministic | Implemented |
| raceModels | Orchestration | Implemented (run name: `raceModels` or `ai.race-models.v1`) |
| generateInstructions | Orchestration | Implemented (run name: `generateInstructions` or `ai.generate-instructions.v1`) |
| optimizeInstructions | Generic | Implemented (run name: `optimizeInstructions` or `ai.optimize-instructions.v1`) |
| extractTopics, extractEntities, matchLists, summarize, classify, sentiment, translate, rank, cluster | Generic | Implemented (listed skills) |

Use **optimizeInstructions** (bootstrap) and **generateInstructions** (iterative) to improve instructions and rules for all of them. V1/dotted names (e.g. `ai.judge.v1`) remain accepted as deprecated aliases for `run()` and REST.
