# Gap Analysis: Feature Request (Core AI Execution + JSON + Evaluation & Optimization)

This document maps the **Feature Request spec** (runJsonCompletion, extractFirstJsonObject, raceModels, judge, aggregateJudgeFeedback, generateInstructions, optimizeInstructions) to the current light-skills implementation and lists **done**, **partial**, and **gaps**.

---

## Summary table

| FR function               | Status   | Implementation / gap |
|---------------------------|----------|----------------------|
| **runJsonCompletion**     | ✅ Done  | runJsonCompletion(); instruction → completion → extractFirstJsonObject; retry once with stricter system; returns { parsed, text, usage?, model? }. |
| **extractFirstJsonObject**| ✅ Done  | extractFirstJsonObject(); prefers ```json blocks, then first {...}; throws if no JSON. |
| **raceModels**            | ✅ Done  | raceModelsV1; API richer (skill system, call type). |
| **judge**                 | ✅ Done  | judgeV1; output shape has extra fields (evidences, scorePoints). |
| **aggregateJudgeFeedback**| ✅ Done  | aggregateJudgeFeedback(); input/output richer. |
| **generateInstructions**  | ✅ Done  | generateInstructionsV1(); loop + options match. |
| **optimizeInstructions**  | ✅ Done  | optimizeInstructionsV1(); returns optimizedInstructions + judgeRules (suggestedRules). |

---

## 1. `runJsonCompletion`

### FR spec

- **Purpose:** Execute a completion and return the **first parsed JSON object** (runCompletion → extractFirstJsonObject → return parsed). Retry once with stricter system message on parse fail.
- **API:** `runJsonCompletion({ instruction, options?: { maxTokens, temperature, model, vendor, system, timeoutMs } })`
- **Return:** `{ parsed, text, usage?, model? }`

### Current state

| Item | Status | Notes |
|------|--------|--------|
| Execute completion with instruction | ✅ | `runJsonCompletion({ instruction, options })` calls client.ask(instruction, opts). |
| Extract first JSON from response | ✅ | Uses `extractFirstJsonObject(text)` (prefers ```json, then first `{...}`). |
| Retry on parse fail (stricter system) | ✅ | On throw, retries once with system "Return ONLY a JSON object. No explanations or markdown." |
| Return shape `{ parsed, text, usage?, model? }` | ✅ | Returns RunJsonCompletionResult. |

### Gap

**Closed.** Implemented in `functions/runJsonCompletion.ts`; exported from `light-skills/functions`.


---

## 2. `extractFirstJsonObject`

### FR spec

- **Purpose:** Extract the first JSON object from text (markdown, code fences, trailing text).
- **API:** `extractFirstJsonObject(text: string): unknown`
- **Behavior:** Prefer ```json blocks; else first `{` … matching `}`. **Throws** if no JSON found.

### Current state

| Item | Status | Notes |
|------|--------|--------|
| Extract first `{...}` from text | ✅ | `extractFirstJsonObject(text)` uses `extractFirstJson` after optional ```json extraction. |
| Prefer ```json blocks | ✅ | First tries regex for ```json...``` or ```...```, parses that block; else first `{...}`. |
| Return type / throw | ✅ | Returns `unknown`; throws if no valid JSON object found. |
| Handles markdown/code fences | ✅ | Implemented in `functions/jsonHelpers.ts`. |

### Gap

**Closed.** `extractFirstJsonObject(text)` implemented and exported from `light-skills/functions`.

---

## 3. `raceModels`

### FR spec

- **Purpose:** Benchmark multiple models on the same task (best model for a skill/prompt).
- **API:** `raceModels({ models: { model, vendor?, mode? }[], testCases: { id, instruction }[], judgeRules })`
- **Output:** `{ ranking: { model, averageScore, passRate }[], details: { model, testCaseId, score }[] }`

### Current state

| Item | Status | Notes |
|------|--------|--------|
| Multiple models, same test cases | ✅ | raceModelsV1. |
| Run completion per model/testCase | ✅ | Uses client.ask(testCase.inputMd, opts). |
| Judge each result (strong mode) | ✅ | judgeV1 in strong mode. |
| Aggregate and rank | ✅ | ranking by avgScoreNormalized, passRate. |
| API shape | ✅ | Request has models[], testCases[] (inputMd), judgeRules, threshold; we have taskName, call, skill (strongSystem/weakSystem). Output has ranking + details. |

### Gap

None. FR “instruction” per test case = our `inputMd`. Our API is richer (skill system, call type, model class). Judge runs in strong mode.

---

## 4. `judge`

### FR spec

- **Purpose:** Evaluate a response against rules; score + rule violations + evidence.
- **API:** `judge({ instructions, response, rules: { rule, weight }[], threshold })`
- **Output:** `{ pass, score, ruleResults: { rule, penalty, evidence[] } }`

### Current state

| Item | Status | Notes |
|------|--------|--------|
| instructions, response, rules, threshold | ✅ | JudgeRequest matches. |
| pass, score, ruleResults | ✅ | JudgeOutput: pass, scoreNormalized, ruleResults (rule, weight, penalty, evidences). |
| Evidence per rule | ✅ | JudgeRuleResult.evidences: { evidence, source, note? }. |

### Gap

None. Our output has extra fields (maxPoints, lostPoints, failedRules, summary); compatible with FR.

---

## 5. `aggregateJudgeFeedback`

### FR spec

- **Purpose:** Aggregate judge results across test cases for optimization loops.
- **API:** `aggregateJudgeFeedback({ results: JudgeResult[] })`
- **Output:** `{ averageScore, passRate, worstRules: { rule, triggerRate, avgPenalty }[] }`

### Current state

| Item | Status | Notes |
|------|--------|--------|
| Aggregate judge results | ✅ | aggregateJudgeFeedback(). |
| averageScore, passRate | ✅ | avgScoreNormalized, passRate. |
| worstRules / rule stats | ✅ | ruleStats (triggerRate, avgPenalty, etc.), focusRules, worstTests. |
| Input | ⚠️ | FR: array of JudgeResult. Ours: `tests: { testCaseId, responseText, judge }[]` plus threshold, options. So we take full test + judge; equivalent for aggregation. |

### Gap

None. Our API is richer; FR shape is a subset (averageScore, passRate, worstRules derivable from ruleStats).

---

## 6. `generateInstructions`

### FR spec

- **Purpose:** Iteratively improve instructions using judge feedback.
- **API:** `generateInstructions({ seedInstructions, testCases: { id, input }[], threshold, maxCycles? })`
- **Behavior:** Loop: run model → judge → aggregate → generate rule improvements → fix instructions; stop when score ≥ threshold or maxCycles.

### Current state

| Item | Status | Notes |
|------|--------|--------|
| Loop: run → judge → aggregate → fix | ✅ | generateInstructionsV1. |
| seedInstructions, testCases, threshold, maxCycles | ✅ | seedInstructions, testCases (id, inputMd), targetAverageThreshold, loop.maxCycles. |
| Stop on threshold or maxCycles | ✅ | achieved, cyclesRun. |

### Gap

None. We have additional options (targetModel, judgeRules, patienceCycles, etc.).

---

## 7. `optimizeInstructions`

### FR spec

- **Purpose:** One-shot improvement of instructions using examples and judge feedback.
- **API:** `optimizeInstructions({ instructions, examples?: { input, output, good, reason? }[] })`
- **Output:** `{ optimizedInstructions, suggestedRules }`

### Current state

| Item | Status | Notes |
|------|--------|--------|
| One-shot improvement | ✅ | optimizeInstructionsV1. |
| instructions + examples | ✅ | seedInstructions, examples (id, inputMd, outputs: { id, text, label, rationale }). |
| optimizedInstructions | ✅ | optimizedInstructions. |
| suggestedRules | ✅ | judgeRules in output. |
| Extra output | — | We also return improvedExamples, changes, extractedConstraints, summary. |

### Gap

None. FR “suggestedRules” = our judgeRules; optional examples shape is slightly different but equivalent.

---

## Recommended next steps (optional)

1. **Mode names** — FR uses weak / normal / strong; we support weak | normal | strong | ultra (normal → strong for file keys). No change required; already compatible.

2. **Documentation** — In README or LIBRARY.md, map FR function names to ours: runJsonCompletion, extractFirstJsonObject, judgeV1, raceModelsV1, aggregateJudgeFeedback, generateInstructionsV1, optimizeInstructionsV1. All gaps are closed.

---

## Notes

- **Judge always strong:** Our judge and orchestration use strong mode for judging; matches FR.
- **No domain logic:** Mapping logic stays in the mapper; our functions stay generic. ✅
- **Existing library spirit:** Same clear purpose, API, and behavior; only runJsonCompletion and optional extractFirstJsonObject need to be added or adapted.
