# Gap Analysis — Workplans vs Current State

This document compares **all workplans** from the conversation to the current codebase and lists what is done, partial, or missing.

**Last updated:** After contract stability, folder-based skills, runSkill, CORE.md, and validation/fixtures.

---

## Summary: Are we done?

| Area | Status | Notes |
|------|--------|-------|
| Modes (weak \| strong \| ultra; normal→strong) | ✅ Done | Canonical folder keys; API alias preserved. |
| Package rename (light-skills) | ✅ Done | |
| Skill-by-name + nx-content | ✅ Done | run(), runWithContent(), getSkillNamesAsync(). |
| Generic router + run by name | ✅ Done | All built-in + content skills. |
| **ai.ask** | ✅ Done | ask() in functions/ai/ask.ts. |
| **askJson** | ✅ Done | askJson() with single-JSON guarantee. |
| **parseJsonResponse** | ✅ Done | extractFirstJson + optional llmFallback. |
| **First-JSON extraction** | ✅ Done | extractFirstJson(), used by askJson/callAI. |
| **recordsMapper.collectionMapping.v1** | ✅ Done | collectionMappingV1 in functions/recordsMapper. |
| Judge, compare, fixInstructions, generateRule, etc. | ✅ Done | Documented in CONTENT_SKILLS.md and CORE.md. |
| **race-models, generate-instructions, optimize-instructions, aggregation** | ✅ Done | raceModelsV1, generateInstructionsV1, optimizeInstructionsV1, aggregateJudgeFeedback. |
| **Contract stability + validation** | ✅ Done | validateOutput, validateAgainstSchema; run() returns { result, validation } when requested. |
| **Fixtures runner** | ✅ Done | npm run content:fixtures; validates index examples vs io.output. |
| **Folder-based skill layout** | ✅ Done | skills/<id>/weak, strong, ultra, rules; layout lint. |
| **runSkill (advanced)** | ✅ Done | runSkill({ key, mode, inputMd, resolver }). |
| **Core offering doc** | ✅ Done | docs/CORE.md + README pointer. |

**Remaining (optional / nice-to-have):**

- **Single INPUT_MD template with {{placeholders}}** — Skills build prompts in code; no single file-based template format. Optional for a future spec.
- **Skill Spec .md files in repo** — Instructions can live in content (skills/<id>/weak.md etc.); inline defaults exist in code. No gap for “running” validation.
- **Layout migration** — If .content still has root-level *-instructions.md / *-rules.json, run content:sync to populate folder-based keys, then remove old files so content:layout-lint passes.

---

## Running validation and fixtures on our functions

You can start running the validator and fixtures on the functions you already have. Steps:

### 1. Ensure .content has folder-based skill content

- **Option A:** Run **content:sync** so the repo writes instructions into `skills/<name>/weak` and `skills/<name>/strong` for each skill in the manifest. That populates the folder layout the indexer expects.
- **Option B:** If .content is already a clone of your skills repo, ensure it uses the canonical layout (`skills/<id>/weak`, `strong`, `ultra`, `rules`). If it still has only root-level `*-instructions.md`, run content:sync once (or migrate by hand), then remove the old root-level files so **content:layout-lint** passes.

### 2. Build the library index

```bash
npm run build && npm run content:index
```

This discovers skills from **folder-based keys** under `skills/`, calls the LLM to fill **io.input**, **io.output**, and **examples** per skill, and writes `skills/index.v1.json` and per-skill refs under `skills/index/v1/`.

### 3. Run the fixtures runner

```bash
npm run content:fixtures
```

This loads the index, and for each skill that has **examples**, validates each `example.output` against the skill’s **io.output** schema. No API keys needed; safe for CI. Use `--skill=id` to run a single skill.

### 4. Optional: validate at run time

- **Programmatic:** Call `run(skillName, request, { resolver, validateOutput: true })`. You always get back **{ result, validation }**; check `validation.valid` and `validation.errors` if needed.
- **REST:** Set `VALIDATE_SKILL_OUTPUT=1` when starting the server; `POST /run` responses will be `{ result, validation }`.

### If the index has no skills or no examples

- **“No skills in library index”** → Run **content:index** first (step 2). The indexer only sees skills that exist under `skills/<id>/...` in .content.
- **“No skills with examples”** / 0 fixtures run → The indexer does ask the LLM for examples; if it returns none or the index was built before examples were requested, add **examples** to the index entries (by re-running content:index or by editing the ref JSONs under `skills/index/v1/`) so that **content:fixtures** has something to validate.

---

## Previous workplan sections (resolved)

### 1. Three-level mode + default models + key-free weak — ✅ Complete

Modes weak | normal | strong | ultra; normal→strong for file keys; presets and exports in place.

### 2. Package rename to light-skills — ✅ Complete

### 3. Skill-by-name + nx-content — ✅ Complete

### 4. Generic functions router — ✅ Complete

### 5. Universal pattern (instruction packs, INPUT_MD, four skills) — ✅ Resolved

- **ai.ask** ✅ — ask().
- **ai.askJson** ✅ — askJson().
- **parseJsonResponse** ✅ — parseJsonResponse() + extractFirstJson().
- **recordsMapper.collectionMapping.v1** ✅ — collectionMappingV1.
- Instruction packs: weak/strong/ultra in content and in code.
- Single formal INPUT_MD template with {{var}}: optional; prompts are built in code and in runWithContent.

### 6. FR-1–FR-6 — ✅ Resolved

askJson, parseJsonResponse, first-JSON extraction, and mapper (collectionMappingV1) are implemented and exported.

### 7. Document judge, compare, fixInstructions, etc. — ✅ Resolved

CONTENT_SKILLS.md and CORE.md list judge, compare, fixInstructions, generateRule, race-models, generate-instructions, optimize-instructions, aggregate-judge-feedback, normalize-judge-rules, and which are orchestration-only.

---

## Recommended next steps (optional)

1. **Run the pipeline once:** content:sync → content:index → content:fixtures (and fix layout if needed so layout-lint passes).
2. **Add or refine examples** in the index for critical skills so fixtures cover the contracts you care about.
3. **Enable validateOutput** in CI or in production if you want run-time contract checks and consistent `{ result, validation }` responses.
