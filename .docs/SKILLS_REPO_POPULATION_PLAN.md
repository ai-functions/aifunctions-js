# Plan: Populate the Skills Library Remote Repo (Complete)

This document is a **detailed execution plan** to go from an empty Git remote repo to a **fully completed** skills library: optimized instructions with reports, rules, and a generated library index for all skills — all running generically through a single command with complete test coverage.

---

## 1. Goal

The remote repo ([nx-morpheus/skills-functions](https://github.com/nx-morpheus/skills-functions), branch `main`) must contain:

| What | Status | Where stored |
|------|--------|--------------|
| Instruction text (weak + normal + file-based) for all 9 skills | Required | `skills/<name>/weak`, `skills/<name>/normal`, `skills/<name>-instructions.md` |
| Optimized instruction text (LLM-refined) | Required | Replaces raw instructions in all 3 key forms |
| Optimization reports (original vs. optimized, metrics) | Required | `reports/optimize/<name>.md` in **this repo** (not pushed to skills repo) |
| Rules JSON for all 9 skills | Required | `skills/<name>-rules.json` |
| Library index (per-skill metadata + aggregate) | Required | `skills/index/v1/<id>.json`, `skills/index.v1.json`, `skills/index/v1/_meta.json` |

**One command** should do the entire pipeline. Tests must pass before anything is pushed.

**Skills in scope:** extractTopics, extractEntities, matchLists, summarize, classify, sentiment, translate, rank, cluster (from [scripts/skillInstructionsManifest.ts](../scripts/skillInstructionsManifest.ts)).

---

## 2. Prerequisites

### 2.1 Remote repository

- **Repo URL:** `https://github.com/nx-morpheus/skills-functions.git`  
  Defined in [src/content/skillsRepo.ts](../src/content/skillsRepo.ts) (`DEFAULT_SKILLS_REPO_URL`).  
  If empty repo doesn't exist yet: create it under `nx-morpheus` org, initialize with default branch `main` (an empty README is fine), then set the URL in `skillsRepo.ts`.
- **Branch:** `main` (`DEFAULT_SKILLS_BRANCH`).

### 2.2 Required environment variables

| Variable | Required for | Notes |
|----------|-------------|-------|
| `SKILLS_PUBLISHER_TOKEN` or `GITHUB_TOKEN` | Push to remote | Must have `repo` write scope. Used by `ContentResolver.pushToRemote()` in [scripts/testOptimizeAndPush.ts](../scripts/testOptimizeAndPush.ts). |
| `OPENROUTER_API_KEY` | Optimization, library index | Needed for LLM calls in `optimizeInstruction` ([scripts/optimizeInstructions.ts](../scripts/optimizeInstructions.ts)) and `updateLibraryIndex` ([src/content/libraryIndex.ts](../src/content/libraryIndex.ts)). |

### 2.3 Local prerequisites

- Node >= 18 (`engines` in [package.json](../package.json))
- `npm install` completed
- `npm run build` succeeds — `dist/functions/index.js` and `dist/src/index.js` must exist (the scripts import from `dist/`)
- `.content/` not committed into this repo — add to `.gitignore`

---

## 3. Full pipeline: what needs to run (in order)

```
 build
   │
   ▼
 test:unit  ─── (fast gate, no API key, ~2s)
   │             fails → stop
   ▼
 sync instructions + rules → .content
   │  (from manifest to ContentResolver keys)
   ▼
 optimize all skills (LLM, with reports)
   │  weak + normal per skill → write optimized text back to .content
   │  reports written to reports/optimize/<name>.md
   ▼
 test:live  ─── (live API gate, all skills, ~90s)
   │             fails → stop (do not push broken content)
   ▼
 generate library index (LLM, with report)
   │  skills/index/v1/<id>.json + skills/index.v1.json + _meta.json → .content
   ▼
 push everything to remote
   │  single commit: optimized instructions + rules + index
   ▼
 verify content round-trip
      clone remote into temp dir → listKeys + get all expected keys → assert
```

---

## 4. What needs to be built (code gaps)

### 4.1 Master publish script: `scripts/publishLibrary.ts`

**What:** A single script that runs the entire pipeline above generically. Does not hard-code skill names — discovers them via `getSkillNamesAsync(resolver)` (same as `testOptimizeAndPush.ts` does today). All parameters are flags.

**Flags:**
```
--skip-tests          Skip unit and live tests (for debugging)
--skip-optimize       Skip optimization (push raw instructions only)
--skip-index          Skip library index generation
--no-push             Don't push to remote
--dry-run             Don't write or push anything; print what would happen
--mode=normal|strong  LLM mode for optimization and indexing (default: normal)
--skills=a,b,c        Restrict optimization to named skills (default: all)
--no-report           Skip writing optimization reports (default: write them)
```

**Implementation notes:**
- Can be written as a thin orchestrator calling functions already in [scripts/testOptimizeAndPush.ts](../scripts/testOptimizeAndPush.ts) and [scripts/updateLibraryIndex.ts](../scripts/updateLibraryIndex.ts).
- The indexer (`updateLibraryIndex`) currently does **not** push. The master script must call `resolver.pushToRemote()` once, after both optimization and indexing are done. One commit, one push at the end.
- All skill discovery uses `getSkillNamesAsync(resolver)` from [functions/router.ts](../functions/router.ts) — no skill names are hard-coded in the script.

**npm script to add in [package.json](../package.json):**
```json
"content:publish": "npm run build && tsx scripts/publishLibrary.ts",
"content:publish:dry": "npm run build && tsx scripts/publishLibrary.ts -- --dry-run --no-push"
```

### 4.2 Fix `updateLibraryIndex.ts` — add `--push` flag

Currently [scripts/updateLibraryIndex.ts](../scripts/updateLibraryIndex.ts) writes the index into `.content` but never pushes. The master script handles the push, so this is fine as a standalone tool — but add a `--push` flag so it can optionally push when used standalone:
```
--push    After writing index, push to remote via resolver.pushToRemote()
```

### 4.3 Content round-trip verification script: `scripts/verifyContent.ts`

**What:** After push, independently verify that the remote actually contains what we expect. Clones the remote (or uses an existing `.content`) and checks:
- `listKeys('skills/')` returns all expected keys (≥ 36 for 9 skills × 4 key forms).
- For each expected key, `resolver.get(key)` returns non-empty content.
- `resolver.get('skills/index.v1.json')` parses as valid aggregate index with at least 9 entries.
- For each skill, `resolver.get('skills/index/v1/<skillId>.json')` parses as a valid `SkillIndexEntry` with non-null `io.input` and `io.output`.
- Optionally: actually runs `runWithContent(skillName, testPayload, { resolver })` for each skill to verify that the content is live and LLM-callable.

Uses `validateLibraryIndex` and `validateSkillIndexEntry` from [src/content/libraryIndex.ts](../src/content/libraryIndex.ts) for schema checks.

**npm script:**
```json
"content:verify": "npm run build && tsx scripts/verifyContent.ts"
```

---

## 5. Detailed execution steps

### Step 1: Build and unit test

Ensure everything compiles and unit tests pass before touching the remote.

```bash
npm run build
npm run test:unit     # fast, no API key required, ~2s
```

**Pass condition:** exit code 0. Unit tests cover: callAI, askJson, library index validation, content resolver key helpers, router, JSON helpers, parseJsonResponse, OpenRouter mapping.  
**On fail:** fix before proceeding.

### Step 2: Sync raw instructions and rules into .content

Write the baseline (un-optimized) instructions and rules from the manifest into the local content clone.

**What this does:**
- Clones `DEFAULT_SKILLS_REPO_URL` into `.content` if missing.
- Calls `resolver.set(key, content)` for all 3 key forms of each skill's instructions (weak mode key, normal mode key, file-based key) — source: [DEFAULT_SKILL_INSTRUCTIONS](../scripts/skillInstructionsManifest.ts).
- Calls `setSkillRules(resolver, name, rules)` for each skill — source: [DEFAULT_SKILL_RULES](../scripts/skillInstructionsManifest.ts).

**Already implemented in:** [scripts/testOptimizeAndPush.ts](../scripts/testOptimizeAndPush.ts) (lines ~230–265). The master script should reuse this logic.

### Step 3: Optimize all skills with reports

LLM pass over all skills, both modes (weak + normal), writing results back into `.content` and report files.

**What this does:**
- For each skill in the manifest, calls `optimizeInstruction(text, mode, skillName)` ([scripts/optimizeInstructions.ts](../scripts/optimizeInstructions.ts)) — uses `callAI` with `OPENROUTER_API_KEY`.
- Writes optimized text back to `.content` (same 3 key forms per skill, overwriting baseline).
- Writes `reports/optimize/<skillName>.md` per skill (original vs. optimized, word counts, token usage, duration) — format: `buildReportMd` (weak + normal sections) or `buildReportMdSingle`.

**Reports format** (already implemented in [scripts/testOptimizeAndPush.ts](../scripts/testOptimizeAndPush.ts)):
```
# Optimization report: <skillName>
Generated: <ISO timestamp>
## Weak mode
### Original / ### Optimized / ### Optimization details (tokens, duration)
---
## Normal mode
### Original / ### Optimized / ### Optimization details
```

**9 skills × 2 modes = 18 LLM calls.** At ~10s each = ~180s in serial (or ~90s if parallelized per skill). Already parallelized per skill in the existing script using `Promise.all([weakResult, normalResult])`.

**Already implemented in:** [scripts/testOptimizeAndPush.ts](../scripts/testOptimizeAndPush.ts) (the `doOptimize` block). The master script should reuse the same loop.

### Step 4: Live API tests (gate before push)

Run the full live test suite against the **in-memory/local** functions (using the same API key) to ensure that the optimized instructions don't break the expected output contracts.

```bash
npm test   # or node --test test/**/*.test.ts
```

This runs [test/library.live.test.ts](../test/library.live.test.ts) which tests all 9 skills (extractTopics, extractEntities, summarize, classify, sentiment, translate, rank, cluster, matchLists) in normal mode against OpenRouter. Weak-mode tests are skipped if no local model.

**Pass condition:** All strong/normal tests pass. ~90s with parallelism.  
**On fail:** Do NOT push. Fix the failing skill's instructions (or the test assertion) and repeat from step 3.

### Step 5: Generate library index

After optimized content is in `.content`, generate the structured JSON index for all skills.

**What this does:**
- Calls `updateLibraryIndex({ resolver, mode: 'normal', incremental: false })` from [src/content/libraryIndex.ts](../src/content/libraryIndex.ts).
- For each skill found via `listKeys('skills/')`, fetches all source files, builds content hash, calls LLM (primary prompt → validate → repair if needed → fallback) to produce `id, displayName, description, io.input, io.output, examples, tags, quality`.
- Wraps with `source`, `runtime`, `schemaVersion` and writes `skills/index/v1/<id>.json` into `.content`.
- Writes aggregate `skills/index.v1.json` and `skills/index/v1/_meta.json`.

**LLM calls:** ~9 (one per skill). ~10-15s each = ~90-135s serial.

**Verify index (in script):** After generating, call `getLibraryIndex({ resolver })` and `validateLibraryIndex(index)` to assert the aggregate is valid before proceeding to push.

**Report:** The indexer returns an `UpdateLibraryIndexReport` (stats: total/updated/unchanged/errored, errors list). The master script should print this and fail loudly if `errored > 0` (or warn and let user decide with a flag).

### Step 6: Push to remote

Single push covering everything written in steps 2–5.

```ts
const result = await resolver.pushToRemote({
  message: "chore: publish skills — optimized instructions, rules, index"
});
```

Push success condition: `result.pushed === true` or `result.noChanges === true`.  
If push fails: log the error with the `resolver.pushToRemote()` result and exit non-zero.

### Step 7: Content round-trip verification

After push, verify the remote actually serves the expected content using [scripts/verifyContent.ts](../scripts/verifyContent.ts) (to be created per §4.3 above).

```bash
npm run content:verify
```

**Checks:**
1. `listKeys('skills/')` → at least 36 keys (9 × 4 forms).
2. For each expected key: `get(key)` returns non-empty string.
3. `get('skills/index.v1.json')` → valid aggregate, skills.length === 9.
4. For each of the 9 skills: `get('skills/index/v1/<id>.json')` → valid `SkillIndexEntry`, `io.input` and `io.output` are proper restricted JSON Schema objects.
5. (Optional / explicit flag) Run one `runWithContent` call per skill against the remote resolver and assert the response matches the expected shape.

---

## 6. Content layout in the remote repo

After the full pipeline, the skills repo should contain:

```
skills/
  extractTopics/
    weak                      ← optimized weak instruction text
    normal                    ← optimized normal instruction text
  extractTopics-instructions.md  ← same as normal (file-based key)
  extractTopics-rules.json       ← [{ rule, weight }, ...]

  (same pattern for all 9 skills)

  index.v1.json                  ← aggregate: { schemaVersion, generatedAt, skills: [{$refKey}] }
  index/
    v1/
      extractTopics.json         ← full SkillIndexEntry (id, displayName, description, io, runtime, ...)
      extractEntities.json
      matchLists.json
      summarize.json
      classify.json
      sentiment.json
      translate.json
      rank.json
      cluster.json
      _meta.json                 ← { stats, errors[] }
```

36 core content keys + 11 index files = **47 entries** in the repo.

---

## 7. Generic execution — one command

Once the master script ([§4.1](#41-master-publish-script-scriptspublishlibinaryts)) is implemented:

```bash
# Full pipeline: build → unit test → sync → optimize → live test → index → push → verify
npm run content:publish

# Dry-run (see what would happen, no writes or push)
npm run content:publish:dry

# Skip live tests (for debugging/iteration only)
npm run content:publish -- --skip-tests

# Only optimize + index, no push
npm run content:publish -- --no-push

# Optimize only specific skills (e.g. during iteration)
npm run content:publish -- --skills=extractTopics,summarize
```

The script itself is generic: it does **not** hard-code skill names. Discovery flows from `getSkillNamesAsync(resolver)`, which finds skills both from the manifest (built-in) and from `listKeys('skills/')` (content-based). New skills are handled automatically once they are in the manifest or the content.

---

## 8. Testing strategy (all levels)

| Level | What is tested | Command | Needs API key | Speed |
|-------|---------------|---------|--------------|-------|
| Unit | Core logic: callAI, askJson, library index validators, resolver key helpers, router, JSON helpers, parseJsonResponse, OpenRouter mapping | `npm run test:unit` | No | ~2s |
| Integration (mocked) | matchLists early-exit, router run + rules injection, runWithContent mock | `npm run test:unit` (included) | No | ~2s |
| Live API | All 9 skills end-to-end with OpenRouter: correct JSON output, shape assertions | `npm test` | Yes (`OPENROUTER_API_KEY`) | ~90s |
| Content round-trip | Remote repo has all expected keys, index is valid, optionally runWithContent per skill | `npm run content:verify` | Yes (for optional LLM round-trip) | ~10s (keys only), ~90s (with LLM) |

**Gate logic in master publish script:**
- Fail on `test:unit` failure → no content touches.
- Fail on live test failure → no push.
- Warn (or fail with flag) on index errors → no push if `errored > 0`.
- Fail on push error.
- `content:verify` runs after push and reports any discrepancies.

---

## 9. Definition of done (checklist)

- [ ] `scripts/publishLibrary.ts` implemented and `content:publish` script added to `package.json`.
- [ ] `scripts/updateLibraryIndex.ts` has a `--push` flag.
- [ ] `scripts/verifyContent.ts` implemented and `content:verify` script added to `package.json`.
- [ ] `npm run content:publish` completes without error.
- [ ] Remote repo ([nx-morpheus/skills-functions](https://github.com/nx-morpheus/skills-functions)) is no longer empty.
- [ ] All 9 skills have optimized weak+normal instructions, file-based instructions, and rules in the remote.
- [ ] `reports/optimize/*.md` exists locally for all 9 skills (committed into this repo if desired for audit trail).
- [ ] `skills/index.v1.json` exists in remote with 9 entries; each skill's per-skill JSON is valid.
- [ ] `npm run content:verify` passes (key presence, index validity).
- [ ] `npm run test:unit` continues to pass after any code changes.
- [ ] `npm test` (live) continues to pass with the published content.

---

## 10. Troubleshooting

| Issue | What to check / fix |
|-------|---------------------|
| Push 403 / auth | `SKILLS_PUBLISHER_TOKEN` or `GITHUB_TOKEN` set? Has `repo` write scope? |
| Push fails "remote contains work" | Pull/rebase in `.content`: `cd .content && git pull --rebase origin main`. Or re-clone. |
| `.content` missing / `getContentRoot()` null | Clone failed. Check `DEFAULT_SKILLS_REPO_URL`, network, token. |
| Optimization fails (timeout / API error) | Set `OPENROUTER_API_KEY`. Check quota. Can retry per-skill via `--skills=<name>`. |
| Index errored for a skill | LLM returned invalid shape twice + fallback failed. Check the `_meta.json` errors field. Re-run with `--mode=strong`. |
| Live test fails post-optimization | Optimized instruction changed behavior. Inspect `reports/optimize/<name>.md`. Revert to baseline (`DEFAULT_SKILL_INSTRUCTIONS`) and re-optimize or hand-tune. |
| `content:verify` fails | Run with verbose flag (or add one). Most likely: key missing (push was partial), index not written, or index validation error. |
| `noChanges: true` on push | All content was already in remote (e.g. re-running after a successful push). OK — add a meaningful change or use `--force` in `pushToRemote` if supported. |

---

## 11. References

| What | File |
|------|------|
| Repo URL and branch constants | [src/content/skillsRepo.ts](../src/content/skillsRepo.ts) |
| Master sync/optimize/push script (existing, to be extended) | [scripts/testOptimizeAndPush.ts](../scripts/testOptimizeAndPush.ts) |
| Instruction optimizer (LLM) | [scripts/optimizeInstructions.ts](../scripts/optimizeInstructions.ts) |
| Instruction and rule manifest (all 9 skills) | [scripts/skillInstructionsManifest.ts](../scripts/skillInstructionsManifest.ts) |
| Library index generator + reader + validators | [src/content/libraryIndex.ts](../src/content/libraryIndex.ts) |
| Library index CLI script (to add `--push`) | [scripts/updateLibraryIndex.ts](../scripts/updateLibraryIndex.ts) |
| Content round-trip verifier (to create) | `scripts/verifyContent.ts` |
| Content resolver key helpers | [src/content/skillsResolver.ts](../src/content/skillsResolver.ts) |
| Skill discovery (getSkillNamesAsync) | [functions/router.ts](../functions/router.ts) |
| Unit test suite | [test/](../test/) — see `test:unit` in [package.json](../package.json) |
| Live API test suite | [test/library.live.test.ts](../test/library.live.test.ts) |
| Index schema and format | [docs/skills-index.v1.md](skills-index.v1.md), [docs/skills-index.schema.v1.json](skills-index.schema.v1.json) |
| Generic skills / I/O analysis | [docs/GENERIC_SKILLS_IO.md](GENERIC_SKILLS_IO.md) |
| nx-content API reference | [docs/NX_CONTENT_FEATURE_REQUEST.md](NX_CONTENT_FEATURE_REQUEST.md) |
| README sync/push section | [README.md — §Test, sync instructions, and push](../README.md) |
