# Gap Analysis — Workplans vs Current State

This document compares **all workplans** from the conversation to the current codebase and lists what is done, partial, or missing.

---

## 1. Three-level mode + default models + key-free weak

**Plan:** Modes weak | strong | ultra; default models: weak = local (Llama 2), strong = gpt-5-nano, ultra = openai-5.2; weak without API key (llama-cpp default).

**Later change:** Modes renamed to **weak | normal | strong** (strong→normal, ultra→strong). Default models: weak = Llama 2.0 (local), normal = gpt-5-nano, strong = gpt-5.2.

| Item | Status |
|------|--------|
| `LlmMode` = weak \| normal \| strong | ✅ Done |
| `getModePreset(mode)` with correct backend/model/temp/maxTokens | ✅ Done |
| callAI/callAIStream use presets; instructions { weak, normal, strong? } | ✅ Done |
| All skills use `LlmMode`, default mode "normal", no per-skill default model | ✅ Done |
| Weak defaults to llama-cpp (no key) | ✅ Done |
| Export `LlmMode`, `getModePreset` | ✅ Done |
| README/docs and tests for modes | ✅ Done |

**Gap:** None for this workplan.

---

## 2. Package rename to light-skills

**Plan:** Rename package to `light-skills`, point repo to `nx-intelligence/light-skills`, update README/docs, no skills repo URL in README, full test run.

| Item | Status |
|------|--------|
| package.json name = "light-skills" | ✅ Done |
| repository / homepage / bugs → light-skills | ✅ Done |
| README and docs: "nx-ai-api" → "light-skills" | ✅ Done |
| Code comments updated | ✅ Done |
| Tests updated; weak-mode live tests skip when node-llama-cpp missing | ✅ Done |
| Skills repo URL not in README | ✅ Done |

**Gap:** None. Push to new remote is a one-time manual step (add remote, push).

---

## 3. Skill-by-name + nx-content

**Plan:** Run by skill name + request; fixed default skills repo in code; client override; publisher token from env; rules per skill; content resolver.

| Item | Status |
|------|--------|
| `run(skill, request)` and `getSkillNames()` | ✅ Done |
| `runWithContent(skillName, request, { resolver, client?, mode? })` | ✅ Done |
| `getSkillsResolver(options?)`, token from env | ✅ Done |
| `skillInstructionsKeyForMode(skillKey, mode)`, `skillRulesKey(skillKey)` | ✅ Done |
| `resolveSkillInstructions`, `resolveSkillRules` | ✅ Done |
| `pushSkillsContent({ localPath, ... })` | ✅ Done |
| DEFAULT_SKILLS_REPO_URL/BRANCH in code only (not README) | ✅ Done |
| Router registry: matchLists, extractTopics, extractEntities, summarize, classify, sentiment, translate, rank, cluster | ✅ Done |

**Gap:** None for this workplan.

---

## 4. Generic functions router

**Plan:** Router so functions can be run generically by skill name + request object, with full config (mode, client, model) in the request.

| Item | Status |
|------|--------|
| Registry of skills, run by name + request | ✅ Done |
| Config (mode, client, model) passed via request or options | ✅ Done |

**Gap:** None.

---

## 5. Universal pattern for LLM-backed functions (skill instruction packs)

**Plan:**

- **Two packs (STRONG / WEAK)** — instruction text per mode. (Now weak / normal / strong.)
- **Only input = INPUT_MD** — single Markdown template with placeholders (e.g. `{{instruction}}`, `{{outputContract}}`, `{{left.fieldsMdList}}`), no free-form concatenation.
- **Output contract** — model output must match function’s output contract (e.g. single JSON object).
- **Four skills to implement:** ai.ask, ai.parseJsonResponse, ai.askJson, recordsMapper.collectionMapping.v1.
- **Skill Spec format** — e.g. `skills/ai.ask/strong.md`, `skills/ai.ask/weak.md` (or normal/strong), single placeholder convention, doc how orchestrator renders them.
- **Migrate existing functions** (extractTopics, matchLists, summarize, classify, etc.) to this pattern: two packs, INPUT_MD template, single-JSON contract.

| Item | Status |
|------|--------|
| callAI uses weak / normal / strong instruction packs | ✅ Done (inline in code) |
| Single INPUT_MD template with placeholders for all skills | ❌ **Gap** — Skills build prompt as ad-hoc strings (e.g. `prompt: text`), not a single template like `# <skillName>`, `## Instruction`, `## Output Contract`, `## Input Data` with `{{var}}`. |
| Formal output contract (e.g. requiredOutputShape) in INPUT_MD | ❌ **Gap** — No explicit output contract section or requiredOutputShape in the pattern. |
| **ai.ask** — generic “do what the instruction says” | ❌ **Gap** — Not implemented. No exported skill that takes instruction + outputContract and runs LLM. |
| **ai.parseJsonResponse** — deterministic first `{...}` extract + optional LLM fallback | ❌ **Gap** — Not implemented. No exported helper for “extract first JSON” or fallback with contract `{ ok, jsonText }` / `{ ok: false, errorCode }`. |
| **ai.askJson** — LLM call with “single JSON object only” guarantee | ❌ **Gap** — callAI does JSON parse but there is no named `askJson` with requiredOutputShape in INPUT_MD. |
| **recordsMapper.collectionMapping.v1** — two collection summaries → mapping result | ❌ **Gap** — Not in this repo (mapper is separate). No embedded function or schema for collection-mapping.v1. |
| Skill Spec files (e.g. skills/ai.ask/normal.md, skills/ai.ask/weak.md) | ❌ **Gap** — No `skills/` directory with .md files; instructions are inline in TS. |
| Existing functions migrated to canonical STRONG/WEAK text + INPUT_MD | ⚠️ **Partial** — They use weak/normal instructions and return JSON, but no shared template format or canonical instruction text from plan. |
| runWithContent builds INPUT_MD (Markdown) for request | ✅ Done (simple `# skillName`, `## Request`, JSON block). |

**Gaps summary:**

- No **ai.ask**, **ai.askJson**, **ai.parseJsonResponse**, or **recordsMapper.collectionMapping.v1**.
- No **Skill Spec** .md files in repo; no single **INPUT_MD** template convention with placeholders and output contract.
- Existing skills not refactored to a single template + canonical instruction text.

---

## 6. FR-1–FR-6 (requirements alignment)

**Plan:** Stable client contract, JSON helper (askJson / parseJsonResponse), robust first-JSON extraction, embedded function for mapper, weak/strong (now weak/normal/strong) first-class, backend routing in ai-api.

| Item | Status |
|------|--------|
| Stable client contract (ask, askStream, testConnection) | ✅ Done |
| Weak/normal/strong as first-class modes | ✅ Done |
| Backend routing (preset per mode) in ai-api | ✅ Done |
| **askJson** (single JSON guarantee) | ❌ **Gap** — Not a named export; callAI does JSON but no askJson API. |
| **parseJsonResponse** (first-JSON extraction, optional LLM fallback) | ❌ **Gap** — Not implemented. |
| Robust first-JSON extraction (deterministic) | ❌ **Gap** — callAI strips markdown fence and parses; no dedicated “extract first `{...}`” helper. |
| Embedded function for mapper (collectionMapping.v1) | ❌ **Gap** — No mapper-specific function or schema in light-skills. |

**Gaps summary:** askJson, parseJsonResponse, first-JSON extraction, and mapper embedding are missing.

---

## 7. Document judge, compare, fixInstructions, generateRule, etc.

**Plan:** Document judge, compare, fixInstructions, generateRule, race-models, generate-instructions, generate-judge-rules, aggregate-judge-feedback, normalize-judge-rules, optimize-instructions; note that compare is orchestration-only.

| Item | Status |
|------|--------|
| README or docs list/catalog these skills | ❌ **Gap** — README only mentions `ai.judge.v1` in a runWithContent example. No list of content-based skills (judge, compare, fixInstructions, generateRule, race-models, etc.). |
| Document which are “orchestration-only” (e.g. compare) | ❌ **Gap** — Not documented. |

**Gaps summary:** No dedicated catalog or doc of these skills and their roles.

---

## Summary table

| Workplan | Status | Main gaps |
|----------|--------|-----------|
| Three-level mode + defaults + key-free weak | ✅ Complete | — |
| Package rename to light-skills | ✅ Complete | — |
| Skill-by-name + nx-content | ✅ Complete | — |
| Generic functions router | ✅ Complete | — |
| Universal pattern (instruction packs, INPUT_MD, four skills, Skill Spec) | ⚠️ Partial | ai.ask, askJson, parseJsonResponse, collectionMapping.v1; no Skill Spec .md; no single INPUT_MD template convention |
| FR-1–FR-6 | ⚠️ Partial | askJson, parseJsonResponse, first-JSON extraction, mapper embedding |
| Document judge / compare / fixInstructions / etc. | ❌ Not done | No catalog or doc of these skills |

---

## Recommended next steps (priority)

1. **Implement and export ai.askJson** — Thin wrapper over callAI with an explicit “single JSON object only” contract and optional requiredOutputShape in the prompt.
2. **Implement parseJsonResponse** — Deterministic “extract first `{...}` and parse”; optional LLM fallback with contract `{ ok, jsonText }` / `{ ok: false, errorCode, message }`.
3. **Introduce INPUT_MD template convention** — Single template shape (e.g. `# Skill`, `## Instruction`, `## Output Contract`, `## Input`) with `{{var}}` placeholders; document it; optionally add Skill Spec .md files for one or two skills as a pilot.
4. **Add ai.ask** — Generic skill: instruction + outputContract (and optional input data) → INPUT_MD → LLM → parsed output.
5. **Document content-based skills** — Short section or table listing judge, compare, fixInstructions, generateRule, race-models, etc., and which are orchestration-only.
6. **recordsMapper.collectionMapping.v1** — Either embed in light-skills (schema + function) or document that it lives in the mapper repo and how it uses runWithContent/callAI.

---

## Decision note: recordsMapper.collectionMapping.v1

**recordsMapper.collectionMapping.v1** (two collection summaries → one mapping result) is not implemented in light-skills. It lives in the **mapper repo** (e.g. xmemory/records-mapper). That repo consumes light-skills via `runWithContent` or `callAI`: it resolves instructions for the collection-mapping skill from content and calls the LLM with INPUT_MD. The schema and typed result (e.g. `collectionMatchConfidence`, `fieldMappings`) are defined in the mapper; light-skills provides the generic run-by-skill-name and JSON contract machinery. To embed a minimal schema + function in light-skills later is optional.
