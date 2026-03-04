# Contract stability: skill identity vs implementation

This doc describes how we keep **skill identity** (contract) separate from **implementation details** (prompts, models, versions) so clients get stable behavior over time.

## The problem

If you mix identity with implementation you get:

- The same skill name producing different outputs month to month
- Breaking tests and fixtures
- "It worked yesterday" bugs
- Clients hardcoding prompt text because they don't trust the library

**Example failure:** You define `recordsMapper.collectionMapping`, then later tweak prompt wording, JSON shape, thresholds, or default model. Existing clients get different output. They start pinning to old commits or copying prompts into their code, and the library stops being a library.

---

## Solution: version skills as API contracts

### 1) Version in the skill ID

- **Skill ID must include a version:** `recordsMapper.collectionMapping.v1`, `ai.judge.v1`.
- Bump to `.v2` only when you change **contract or observable behavior** (input/output shape, semantics).
- This version is **contract + expected behavior**, not "prompt version".

### 2) Three layers per skill

| Layer | Role | Can change without new version? |
|-------|------|----------------------------------|
| **Contract** | Input schema, output schema, hard constraints, examples/fixtures | No — change = new v2 |
| **Instruction packs** | `system.weak.md`, `system.strong.md`, `system.ultra.md` (or `-instructions.md`) | Yes — refine as long as fixtures still pass |
| **Runtime policy** | Model defaults, temperature, maxTokens, timeouts, fallbacks | Yes — caller/env choice |

So: **prompt tweaks** are allowed as long as they still satisfy the contract and fixtures.

### 3) Fixtures are first-class

For each skill version, maintain a small test suite:

- 3–10 example inputs
- Expected valid outputs (shape + key invariants)
- Optional: invalid outputs that must be rejected

Then you can optimize prompts, upgrade models, and refactor without breaking clients.

### 4) Library index: contract identity + validation pointers

The library index (e.g. `skills/index.v1.json` and per-skill `skills/index/v1/<id>.json`) should carry:

- `id`: e.g. `recordsMapper.collectionMapping.v1`
- `modes`: `weak` | `normal` | `strong` (or weak/strong/ultra in spec terms)
- `io.input` / `io.output`: restricted JSON Schema (already in place)
- Optional: `contractKey`, `outputSchemaKey`, `fixtures` (examplesPrefix, expectedPrefix, invalidPrefix), `stability`: `"stable"`

Clients **pin to `id`**, not to a prompt file path.

### 5) Validation at runtime

When a skill returns:

1. Parse JSON (e.g. extract-first-json).
2. Validate `schemaVersion` and required fields / shapes (from index `io.output` or a dedicated schema file).
3. Optional: run per-skill invariants (e.g. "field names must be from provided lists").

On failure: retry with stronger settings, or fail fast with a clear error.

---

## Recommended folder structure (content repo)

Per-skill layout that separates contract from packs and fixtures:

```
skills/
  recordsMapper.collectionMapping.v1/
    contract.md
    system.weak.md
    system.strong.md
    system.ultra.md
    input.template.md
    examples/
      001.simple.md
      002.realistic.md
    expected/
      001.simple.json
      002.realistic.json
    invalid/
      001.markdown_wrapped.txt
```

- **contract.md** — Human/agent source of truth: input/output, constraints.
- **system.*.md** — Instruction packs (can evolve; must still pass fixtures).
- **input.template.md** — Standard INPUT_MD format for the skill.
- **examples/** + **expected/** + **invalid/** — Fixtures for the fixtures runner.

**Canonical source of truth:** All skill content must live under `skills/<skillId>/…`. Root-level `*-instructions.md` and `*-rules.json` are not allowed. Instruction modes use folder keys: `weak`, `strong`, `ultra` (API mode `normal` maps to `strong`). Rules: `skills/<skillId>/rules`. Run `npm run content:layout-lint` to enforce.

---

## Minimal "do this now" checklist

1. **Naming:** Every skill is named `*.v1` (already done for judge, compare, recordsMapper, etc.).
2. **Per skill v1:** Add (in content or docs):
   - Contract (input/output + constraints), e.g. `contract.md` or in index `io`.
   - Examples + expected outputs (in index `examples` or in `examples/` + `expected/`).
   - Instruction packs: `weak` / `strong` / `ultra` (or single instructions file).
3. **CI / local:** Run a step that:
   - Runs skill outputs through schema validators.
   - Checks they match contract invariants (fixtures runner).

---

## Validation layer (this repo)

- **`validateOutput(skillId, parsed, options?)`** — Validates `parsed` against the skill’s output contract (from library index `io.output` or a schema file). Returns `{ valid: true }` or `{ valid: false, errors: string[] }`.
- **Schemas** — Optional: `functions/validate/schemas/<skillId>.schema.json` (e.g. Ajv) for strict validation. Index `io.output` (restricted JSON Schema) can be used without extra files.
- **Fixtures runner** — Script or function that, for a skill, loads examples, runs the skill (or mocks), and validates outputs. Ensures prompt/instruction changes don’t break the contract.

---

## Why this fixes it

You can:

- Improve prompts continuously
- Swap models (GPT → llama → whatever)
- Add new clients safely
- Avoid silently breaking existing integrations

Clients rely on **skill id** (e.g. `recordsMapper.collectionMapping.v1`) and get stable input/output behavior as long as the contract and fixtures are enforced.
