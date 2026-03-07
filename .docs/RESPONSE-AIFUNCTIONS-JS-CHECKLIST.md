# Response to checklist: aifunctions-js — what to check or fix

**In response to:** [Checklist: aifunctions-js](.) (OpenRouter and other backends)  
**Package:** [aifunctions-js](https://github.com/nx-intelligence/light-skills)  
**Consumer:** xmemory-records-mapper (LLM-assisted schema mapping)  
**Related:** bugreport-aifunctions-js-empty-content-with-reasoning.md, bugreport-aifunctions-js-null-estimated-cost.md

This document records decisions, status, and implementation notes for each item in the checklist. Use it when implementing or verifying fixes in the aifunctions-js package and when updating consumers (e.g. nx-ai-api, mapper).

---

## 1. Empty `text` when model returns reasoning tokens (OpenRouter)

### 1.1 Problem summary

| Item | Status | Notes |
|------|--------|--------|
| Confirm: `result.text` is `""` when all completion tokens are in a reasoning block | **To verify** | Reproduce with OpenRouter + model that returns reasoning (e.g. extended thinking); confirm client only reads `choices[0].message.content`. |
| Confirm: `result.usage.completion_tokens` &gt; 0 while `result.text` is empty; callers fail on JSON parse | **To verify** | Mapper/consumers see "Unexpected end of JSON input" or no usable output when expecting parseable content. |

### 1.2 Where to look in the client

| Item | Status | Notes |
|------|--------|--------|
| Locate code that builds return value of `ask()` | **To do** | Search for `choices[0].message.content` and the function that maps API response → `result`. |
| Check OpenRouter (and other backend) response shape for reasoning | **To do** | Document: `message.content` null/empty, `message.reasoning`, or `message.content[]` with `type: "reasoning"`. |
| Document exact response shape(s) that yield empty content but non-zero completion/reasoning tokens | **To do** | Add to package docs or a REFERENCE.md; include sample JSON for OpenRouter. |

### 1.3 Fix options (choose one or combine)

| Option | Decision | Notes |
|--------|----------|--------|
| **A — Include reasoning in text** | Consider | Concatenate `message.reasoning` (or reasoning content part) with `message.content` so `result.text` is full output. Document order (e.g. reasoning then content). Good for debugging; may be noisy for JSON-only consumers. |
| **B — Prefer content for “answer”** | Prefer for mapper | Use backend param (e.g. OpenRouter `reasoning: { exclude: true }` or equivalent) so final answer is in `content`. Document and use when consumer expects single parseable answer (e.g. JSON). |
| **C — Surface “no content” to callers** | Combine with A or B | When `message.content` is null/undefined but `usage.completion_tokens` &gt; 0: set `contentMissing: true` or `hasReasoningOnly: true`; optionally expose `raw.choices[0].message` or normalized shape; consider typed error/result variant so callers don’t silently get `""` and then JSON parse error. |

**Recommended:** Implement **B** for the default/JSON use case, plus **C** so that when content is missing, callers get an explicit signal and can retry or show a clear error instead of "Unexpected end of JSON input".

### 1.4 Implementation checks

| Item | Status |
|------|--------|
| After fix: `result.text` non-empty (A/B) or result has clear “content elsewhere” signal (C) | Pending |
| `result.usage` still reflects token counts (prompt, completion, reasoning if present) | Pending |
| No breaking change for models that already put answer in `message.content` | Pending |

### 1.5 Consumer usage (mapper)

| Item | Status |
|------|--------|
| Mapper can parse `result.text` as JSON when it’s the final answer, or detect “reasoning only” and handle (retry / clear error) | Pending; depends on 1.3/1.4 |

---

## 2. `estimatedCost: null` without reason/confidence (usage tracking)

### 2.1 Problem summary

| Item | Status | Notes |
|------|--------|--------|
| Confirm: `getUsage()` returns `estimatedCost: number | null` with no structured explanation when null | **To verify** | Locate `wrapWithUsageTracking` / usage layer and inspect return type. |
| Confirm: consumers cannot distinguish “unknown” vs “pricing missing” vs “backend doesn’t report” vs “low-confidence” | **To verify** | Mapper/telemetry cannot branch or log deterministically. |

### 2.2 Where to look

| Item | Status | Notes |
|------|--------|--------|
| Locate usage-tracking layer and type of `getUsage()` | **To do** | Find where `estimatedCost` is set (price table, API response, or left null). |
| Document when and why `estimatedCost` can be null | **To do** | e.g. new model, no price table entry, backend doesn’t return cost, transient error. |

### 2.3 Fix options (choose one or combine)

| Option | Decision | Notes |
|--------|----------|--------|
| **A — Typed unavailability** | Recommended | When cost unknown, return e.g. `costUnavailable: { reason: "no_price_for_model" | "backend_no_cost" | "transient" | "unknown", details?: string }` so consumers can branch and log. |
| **B — Cost result type** | Optional extension | `{ estimatedCost, costConfidence?, costSource?, costUnavailableReason? }` so value and unavailability are first-class. |
| **C — Document null** | Minimum | If API stays as-is, document when `estimatedCost` is null and what callers should do (treat as unknown, don’t use for billing). |

**Recommended:** **A** (or **B** which subsumes A) so telemetry and budgeting can handle null deterministically; **C** as a minimum if no code change.

### 2.4 Implementation checks

| Item | Status |
|------|--------|
| When pricing available: `estimatedCost` is number; optionally `costConfidence` / `costSource` set | Pending |
| When unavailable: `estimatedCost` null and `reason` / `costUnavailableReason` (or equivalent) set | Pending |
| CHANGELOG or docs describe new shape for consumer type/handling updates | Pending |

### 2.5 Consumer usage (mapper)

| Item | Status |
|------|--------|
| Mapper/telemetry can use `estimatedCost` when present or log/handle `costUnavailableReason` when null | Pending; depends on 2.3/2.4 |

---

## 3. General health

| Item | Status |
|------|--------|
| CHANGELOG or release notes mention both fixes (reasoning/content and cost unavailability) | Pending |
| Unit/integration tests: (1) mock OpenRouter reasoning-only response → assert `result.text` or `contentMissing`; (2) usage tracker returns structured unavailability when cost null | Pending |
| Backend-specific behavior (OpenRouter vs others) documented for consumers | Pending |

---

## 4. Quick verification (after fix)

1. **Reasoning:** Call `ask()` with a model that returns reasoning tokens (e.g. gpt-5-nano via OpenRouter). Assert either `result.text` is non-empty or `result` has a clear “content missing / reasoning only” signal; no silent empty string.
2. **Cost:** Call `getUsage()` when no cost data is available (e.g. new model or offline). Assert `estimatedCost` is null and a `reason` or `costUnavailableReason` (or equivalent) is present so the consumer can log or branch.

---

## Summary

- **Section 1 (empty text):** Prefer Option B (prefer content for answer) + Option C (surface “no content”) so the mapper gets either parseable JSON or an explicit signal, never a silent empty string.
- **Section 2 (null cost):** Prefer Option A or B (typed unavailability or extended cost result type) so null cost is explainable; minimum is Option C (document when null).
- **Section 3–4:** Apply checklist items for CHANGELOG, tests, backend docs, and the two quick verification steps once fixes are implemented.

*Last updated: 2025-03-08*
