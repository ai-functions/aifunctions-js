# Generic skills and known I/O — analysis and direction

This doc analyzes how skill I/O is defined today, what’s missing for “generic” add/manage by anyone, and how the library index + content can provide a single mechanism so I/O is known and (optionally) generic functions can be driven by metadata.

---

## 1) Current state

### Built-in skills (extractTopics, matchLists, …)

- **I/O is known only in code:** Each skill is a TypeScript function with explicit param/result types (e.g. `ExtractTopicsParams`, `ExtractTopicsResult`) and a custom `buildPrompt(request)` that turns the request into the user prompt.
- **Execution:** All go through `executeSkill<T>({ request, buildPrompt, instructions, rules, client, mode, model })`. Instructions can come from code or (when `run(..., { resolver })`) from content rules.
- **To add a skill:** You must add a new TS file and register it in `router.ts` (SKILLS). Not something “anyone” can do without touching this repo.

### Content-based skills (runWithContent)

- **Discovery:** Any key under `skills/` (e.g. `skills/<name>-instructions.md` or `skills/<name>/normal`) is discovered via `listKeys('skills/')`; skill name is derived from the key path. So “add a skill” = add instructions (and optionally rules) to the content repo.
- **Execution:** `runWithContent(skillName, request, options)` loads instructions and rules from the resolver, then calls `executeSkill` with a **generic** prompt: `buildPrompt(r) => '# ${skillName}\n\n' + buildRequestPrompt(r)`, where `buildRequestPrompt(r)` is just the request object as JSON. So the input is “whatever you pass”; there is no declared input schema.
- **I/O:** There is **no** declared or enforced I/O for content skills. The runtime does not validate the request shape or the response shape. Types are effectively `unknown`.

### Library index (v1)

- **What it is:** We have `getLibraryIndex`, `updateLibraryIndex`, and per-skill index entries under `skills/index/v1/<skillId>.json` with `id`, `displayName`, `description`, **`io.input`**, **`io.output`** (restricted JSON Schema), `runtime.callName`, etc. The index can be generated/updated by scanning content and using the LLM to infer metadata (including I/O).
- **Current use:** The index is produced and stored in content; it is **not** used by the router or by `runWithContent`. So we have “known I/O” in the index, but the runtime does not read it.

---

## 2) The gap

- **No single mechanism for “known I/O”** that works for both built-in and content skills and is usable by “anyone” (e.g. via the GitHub content repo). Today:
  - Built-in: I/O is in TS only; adding a skill requires code changes.
  - Content: Skills are addable by adding files to the repo, but their I/O is not declared anywhere the runtime uses, so we can’t validate, generate forms, or orchestrate from a schema.
- **No generic “run by metadata” path** that takes skill id + request, loads I/O from a single source of truth (e.g. index or a file in content), validates input, runs the executor, validates output. So we can’t yet say “this skill’s contract is defined in the repo/index; run it generically.”

So: we want I/O to be **known** in one place (content repo and/or index), and the runtime to **use** that so we can add/manage generic skills and, if we want, generate generic runners from metadata.

---

## 3) Desired direction: I/O known in content/index, runtime uses it

### 3.1 Single source of truth for I/O

- **Option A — Index as source of truth:** The index entry for a skill (e.g. `skills/index/v1/<id>.json`) contains `io.input` and `io.output`. That file lives in the content repo. It can be:
  - **Generated** by `updateLibraryIndex` (LLM infers from instructions/rules), or
  - **Hand-written** (someone adds or edits the index file in the repo), or
  - **Mixed** (indexer generates, humans edit and commit).
- **Option B — Explicit io file in content:** Add e.g. `skills/<id>/io.json` (or `skills/<id>-io.json`) that describes input/output schema. The indexer can merge/validate against it; the runtime can load it when present. This gives “I/O first” workflows (define contract, then add instructions).
- **Recommendation (v1):** Use the **index** as the source of truth. Anyone can add a skill by adding instructions (and optionally rules) to the repo; then run the indexer so that `skills/index/v1/<id>.json` exists with `io.input` and `io.output`. Optionally allow a hand-written index entry (or a small `io.json`) that the indexer respects/merges so that “write I/O first” is possible without running the LLM.

So: **I/O is “known” by having an index entry (and optionally an explicit io file) in the content repo.** That can be produced by the indexer from instructions, or written by hand, or both.

### 3.2 Generic run path that uses known I/O

- **Today:** `runWithContent(skillName, request, options)` runs any content skill with a generic prompt and no validation.
- **Next step:** Add an optional “validate with index” path:
  - Load the index (or the per-skill index entry) for that skill, e.g. via `getLibraryIndex` + resolve `$refKey`, or direct `resolver.get('skills/index/v1/<id>.json')`.
  - If an entry exists with `io.input`: validate `request` against `io.input` (e.g. required fields, types from the restricted schema) before calling the executor.
  - After the executor returns: if the entry has `io.output`, validate the result against `io.output`.
  - If no index entry exists, behave as today (no validation).
- That gives a **generic** path: one execution flow for any skill that has metadata in the index; no per-skill TS needed for I/O.

### 3.3 Adding / managing generic skills (by anyone)

- **Add a skill:** Add to the content repo:
  - Instructions (and optionally rules), e.g. `skills/<name>-instructions.md`, `skills/<name>-rules.json`.
  - Optionally, add or generate an index entry so I/O is known: either run `updateLibraryIndex` (indexer infers I/O from instructions) or commit a hand-written `skills/index/v1/<name>.json` (or the aggregate is regenerated by CI).
- **Manage:** Edit instructions, rules, or index entries in the repo. Re-run the indexer when instructions change so the index stays in sync (or use incremental update). No code changes in light-skills.
- So **most skills can be generic**: add/manage via the GitHub content repo; I/O known via the index (and optionally an explicit io file). Only the “orchestration” or special-case skills need to stay built-in.

### 3.4 Auto-generating “generic functions” from metadata

- The **generic function** for a skill is already the same for every content skill: `executeSkill` with instructions from content and `buildPrompt(r) => buildRequestPrompt(r)` (request as JSON). So we don’t need to generate new TS “functions” per skill; we need:
  - **Metadata** (index entry with io.input, io.output, runtime.callName), and
  - **Content** (instructions, rules).
- So “generate generic function” can mean:
  - **Runtime:** Use index entry to validate input → run existing executor → validate output. No new code; just wiring to the index.
  - **Codegen (optional):** From the index we could generate TypeScript types, OpenAPI, or UI forms (input/output schema). The runnable “function” is still the same executor + content + optional validation.
- So: **given the right metadata (I/O in the index), we can run and validate generic skills without writing a dedicated TS function.** The mechanism is: index + instructions + rules in content → runWithContent (and optionally validate using the index).

---

## 4) Summary

| Aspect | Today | Desired |
|--------|--------|--------|
| Where I/O is “known” | TS types (built-in only); docs (FUNCTIONS_SPEC, LIBRARY) | Index (and optionally io file) in content repo; index can be generated or hand-written |
| Who can add a skill | Built-in: code change. Content: add instructions in repo (no I/O) | Anyone: add instructions (and optionally rules) in repo; run indexer or add index entry so I/O is known |
| Runtime use of I/O | None for content skills | Optional: load index entry, validate request/response against io.input / io.output |
| Generic runner | runWithContent runs any content skill with generic prompt; no validation | Same, plus optional validation and discovery from index so “generic” = metadata-driven |

**Next steps (concrete):**

1. **Use the index at runtime (optional):** In `runWithContent` (or a variant), if an index entry exists for the skill, load it and validate request against `io.input` and result against `io.output`. Keep behavior when no index entry exists (no validation).
2. **Document the contract:** In FUNCTIONS_SPEC or CONTENT_SKILLS, state that for generic content skills, I/O is defined by the index entry (skills/index/v1/<id>.json); index can be generated by `updateLibraryIndex` or written by hand.
3. **Optional: io-first in content:** Allow something like `skills/<id>/io.json` (or `-io.json`) that the indexer merges into the index and the runtime can use, so “define I/O first, then add instructions” is supported without running the LLM.

This gives a single, content-driven mechanism: **I/O known in the repo (index and optionally explicit io file), runtime can validate and run generically, and most skills can be added/managed by anyone via the GitHub repo and metadata.**
