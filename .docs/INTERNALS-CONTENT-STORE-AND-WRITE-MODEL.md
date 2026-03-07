# Internals: Content Store, Write Model, and Data Shapes

This document is a companion to [ROADMAP-VARIATION-AND-RACE-ON-YOUR-DATA.md](ROADMAP-VARIATION-AND-RACE-ON-YOUR-DATA.md). It provides the internal implementation detail needed to evaluate the solutions proposed there: how reads and writes actually work, what the on-disk data looks like, and what the current versioning model can and cannot express.

It also references the broader [ROADMAP.md](ROADMAP.md) for context on what is already planned.

---

## 1. How the Content Store Works

### The abstraction: `ContentResolver`

All function content — instructions, rules, test cases, race config, race history, metadata — is read and written through a single interface from the `nx-content` package:

```typescript
resolver.get(key)           // read a file by key → string
resolver.set(key, value)    // write a file by key ← string
resolver.listKeys(prefix)   // list all keys under a prefix
resolver.resolveInstructions(key) // get with fallback chain
```

A resolver is created by `getSkillsResolver()` in `src/content/skillsResolver.ts`. Every HTTP request handler in `src/serve.ts` calls `getSkillsResolver()` with no arguments, which creates a fresh `ContentResolver` pointing to:

- the git repo at `GITHUB_REPO_URL` (or the default `https://github.com/nx-morpheus/skills-functions.git`)
- branch `main`
- authenticated via `SKILLS_PUBLISHER_TOKEN` or `GITHUB_TOKEN`

There is no singleton, no shared resolver instance, no connection pool. Each call is fresh but they all point to the same remote.

### `resolver.set()` does NOT write to git

This is the critical detail: **`resolver.set(key, value)` writes to the local content cache on disk, not to git.** The change exists locally until a separate explicit push step is called.

The push step is `pushSkillsContent()` in `src/content/publishSkills.ts`:

```typescript
// In publishSkills.ts — called only when explicitly triggered
const git = simpleGit(localPath);
await git.add(".");
await git.commit(message);
await git.push(remote, branch);
```

This is exposed via:
- `POST /functions/:id:push` (requires `SKILLS_LOCAL_PATH` env)
- `npm run content:sync` (CLI, writes then pushes)

**Implication:** Most write operations (`setSkillInstructions`, `appendRace`, `setSkillTestCases`, etc.) write to local disk only. If the server restarts before a push, the changes are gone. If two concurrent requests write the same key, the last write wins with no conflict detection.

### Two modes: `prod` vs `dev`

The resolver has a `mode` option:

- **`prod`** (default on the server): reads from git first; local overrides only if explicitly set.
- **`dev`** (used in scripts like `testOptimizeAndPush.ts`): local `.content/` folder wins; git is secondary.

The server always uses `prod` mode. Scripts that run locally (content sync, index build) use `dev` mode with `localRoot: path.join(rootDir, ".content")`.

### No transactions, no locking, no atomic multi-file writes

There is no mechanism to:
- atomically update two keys at once
- detect that another writer has changed a key since you read it
- lock a function while optimizing it

`appendRace` illustrates the pattern:

```typescript
// raceStorage.ts — read-modify-write, no locking
const races = await getRaces(resolver, skillName);   // read current array
races.unshift(record);                               // prepend new record
const trimmed = races.slice(0, MAX_RACES);           // cap at 200
await resolver.set(key, JSON.stringify(trimmed));    // overwrite entire file
```

If two race jobs finish at the same time and both do this sequence, one record will be silently dropped.

### Key naming convention

The canonical prefix is **`functions/<id>/`** (recently migrated from `skills/<id>/`; old keys may still exist in content repos). Keys map directly to file paths under the content root:

```
functions/extract-invoice-lines/strong          → file: functions/extract-invoice-lines/strong
functions/extract-invoice-lines/race-config.json
functions/extract-invoice-lines/races.json
```

`normalizeKeySegment(id)` lowercases and replaces spaces/dots with hyphens before building the key.

---

## 2. Actual Data Shapes (on disk)

### `functions/<id>/strong` — instructions

Plain text, no wrapper. This is the raw system prompt sent to the LLM.

```
Extract all line items from the invoice text provided.
Return a JSON object with this shape: { "lines": [{ "description": string, "amount": number }] }.
Rules:
- Amount must be numeric (no currency symbols).
- If a line item has no amount, set amount to 0.
- Do not invent line items.
```

Same format for `weak` and `ultra`. `normal` maps to `strong`.

---

### `functions/<id>/rules` — judge rules

JSON array. Each rule has a string and a weight (relative importance for scoring).

```json
[
  { "rule": "Output must be valid JSON matching the schema", "weight": 3 },
  { "rule": "Amount fields must be numeric, not strings", "weight": 2 },
  { "rule": "Description must not be empty", "weight": 1 }
]
```

Score = weighted average of rule pass/fail results. Normalized to 0–1.

---

### `functions/<id>/test-cases.json` — stored test cases

JSON array. Each case has an `id` and an `inputMd` (the user prompt string). Optional `expectedOutputMd` for known-answer cases.

```json
[
  {
    "id": "t1",
    "inputMd": "Invoice #1234\nConsulting: $4,500\nTravel reimbursement: $320"
  },
  {
    "id": "t2",
    "inputMd": "Invoice #5678\nSoftware license (annual): $12,000\nSupport: $1,200",
    "expectedOutputMd": "{\"lines\":[{\"description\":\"Software license (annual)\",\"amount\":12000},{\"description\":\"Support\",\"amount\":1200}]}"
  }
]
```

**This is one file, shared by all users.** There is no dataset label, no author, no domain tag.

---

### `functions/<id>/race-config.json` — best model per profile

A flat JSON object. Written by `setProfiles()` at the end of every race. **Last writer wins.**

```json
{
  "defaults": {
    "maxTokens": 800
  },
  "profiles": {
    "best": {
      "model": "anthropic/claude-3-5-haiku",
      "temperature": 0.2,
      "vendor": "anthropic"
    },
    "cheapest": {
      "model": "openai/gpt-4o-mini",
      "vendor": "openai"
    },
    "fastest": {
      "model": "openai/gpt-4o-mini",
      "vendor": "openai"
    },
    "balanced": {
      "model": "anthropic/claude-3-5-haiku",
      "vendor": "anthropic"
    }
  }
}
```

This file contains **no record of which test cases were used**, no date, no author. It is overwritten in full on every race completion. If user A runs a race with their 10 examples and user B runs a race with their 10 examples an hour later, B's result is all that remains — with no trace of A's.

---

### `functions/<id>/races.json` — race history

JSON array, newest first, capped at 200 records by `appendRace`. Each record is a `RaceRecord`:

```json
[
  {
    "raceId": "race-a1b2c3",
    "type": "model",
    "label": "March baseline",
    "notes": "Using Q1 invoice sample",
    "applyDefaults": true,
    "candidates": ["anthropic/claude-3-5-haiku", "openai/gpt-4o-mini", "mistral/mistral-large"],
    "attempts": [
      {
        "modelId": "claude",
        "model": "anthropic/claude-3-5-haiku",
        "avgScoreNormalized": 0.91,
        "passRate": 0.9,
        "latencyMs": 1820,
        "costSnapshot": 0.00042
      },
      {
        "modelId": "gpt4omini",
        "model": "openai/gpt-4o-mini",
        "avgScoreNormalized": 0.87,
        "passRate": 0.85,
        "latencyMs": 950,
        "costSnapshot": 0.00008
      }
    ],
    "winners": {
      "best": "anthropic/claude-3-5-haiku",
      "cheapest": "openai/gpt-4o-mini",
      "fastest": "openai/gpt-4o-mini",
      "balanced": "anthropic/claude-3-5-haiku"
    },
    "runAt": "2026-03-05T14:22:00.000Z",
    "summary": "claude-3-5-haiku wins on quality; gpt-4o-mini wins on cost and latency"
  }
]
```

**What is absent from every record:** which test cases were used (no `testCaseIds`, no embedded inputs), which user ran it, which domain it was for. The record is self-contained as a model comparison but has no provenance linking it to the data it was run against.

---

### `functions/<id>/meta.json` — lifecycle state

```json
{
  "status": "released",
  "version": "v3",
  "releasedAt": "2026-02-28T09:00:00.000Z",
  "lastValidation": {
    "score": 0.91,
    "passed": true,
    "runAt": "2026-02-28T08:55:00.000Z"
  },
  "scoreGate": 0.85
}
```

`status` is `"draft"` or `"released"`. `version` is a git tag (`functions/<id>/vN`). There is one `meta.json` per function; there is no per-user or per-domain meta.

---

## 3. What `projectId` Is and Is NOT

The README describes `projectId` as an optional field on any POST body:

```json
{
  "input": { "text": "..." },
  "projectId": "cognni-prod"
}
```

`projectId` is **an analytics attribution tag only.** It is embedded in the outgoing OpenRouter `user` field as `"cognni-prod:extract-invoice-lines"` so generations can be filtered by project in `/analytics/openrouter/generations`.

`projectId` does **not** affect:
- which content is read (`functions/<id>/...` keys are the same for all callers)
- which race-config is used
- which test cases are loaded
- any write path

It is invisible to the content store. Two callers with different `projectId` values read and write the same files.

---

## 4. The Versioning Model and Its Limits

Git commit history is available for instruction files via `getSkillInstructionVersions(resolver, id)`, which calls `resolver.getVersions("functions/<id>/strong")` — a git log on that specific file path.

This gives a linear timeline of instruction changes:

```json
[
  { "sha": "a1b2c3d", "message": "optimize: improved line item detection", "date": "2026-03-01T10:00:00Z" },
  { "sha": "e4f5g6h", "message": "chore: update skill content", "date": "2026-02-28T09:00:00Z" }
]
```

Rollback via `setSkillInstructionsActiveVersion(resolver, id, sha)` rewrites the current `strong` file to the content of the given sha.

**What this captures:** "What did the instruction text look like at commit X?"

**What this does not capture:**
- Which test cases were active when that instruction was created
- Which model was winning at that point in time
- Whether the instruction is currently performing well on domain A vs domain B
- Any user or domain dimension

The history is instruction-only and linear. It has no awareness of the multi-dimensional variation problem described in the companion document.

---

## 5. Connection to the Broader Roadmap

For context on what is already planned:

- **Phase 2.5** (ROADMAP.md): `:release` endpoint — score-gated promotion that creates a git tag `functions/<id>/vN`. This is a deployment snapshot on the linear history, not a domain branch.
- **Phase 3.2** (ROADMAP.md): Per-org content namespacing — `orgs/<orgId>/functions/<id>/...` instead of `functions/<id>/...`. This isolates org A from org B but still gives each org only one flat namespace, no dataset dimension within an org.

The solutions in ROADMAP-VARIATION-AND-RACE-ON-YOUR-DATA.md (datasets, contexts, ephemeral sessions) sit **within** the per-org namespace from Phase 3.2. They solve the intra-org problem: different teams or domains within the same org needing different race results and example sets for the same function.

The right sequencing is therefore:

```
Phase 3.2 (org namespacing)
  → Phase 2.7 (ephemeral race sessions, no namespace dependency)
  → Phase 2.8 (named datasets, works per-org once 3.2 is in)
  → Phase 3.6 (full context branches, needs both)
```

Phase 2.7 (ephemeral race sessions) has no dependency on org namespacing because sessions are not persisted in the content store — they live in the jobs store. It can be built independently and delivers immediate value: "race against your own examples right now, without modifying any shared state."
