# Skills library index (v1)

This document describes the **library indexing + auto-update** feature: a deterministic JSON index of every skill/function for discovery, input/output contracts, and automation.

## Goals

1. **Library info** as a JSON index: `id`, `displayName`, `description`, `inputs`/`outputs` schema, optional metadata for routing and automation.
2. **Update workflow**: enumerate skills → read source files → LLM infers metadata → write/update index in content.
3. **LLM-assisted naming + IO**: per skill, extract/normalize display name, 1–2 sentence description, input/output JSON schema (restricted subset).
4. **Runtime use**: input validation, UI forms/autocomplete, function-calling orchestration (choose skill, build args, check output).

## Non-goals (v1)

- No deep code execution or dynamic type inference.
- No TypeScript AST parsing (optional future).
- No change to how light-skills runs skills; metadata layer only.
- No full JSON Schema edge cases; “good enough + consistent” restricted subset.

## Content model

### Index storage

- **Aggregate (runtime load):** `functions/index.v1.json` — single file with `skills[]` array of `{ "$refKey": "functions/index/v1/<skillId>.json" }`.
- **Per-function (canonical):** `functions/index/v1/<skillId>.json` — one file per function for merge-friendliness.
- **Meta/report:** `functions/index/v1/_meta.json` — generation stats and errors.

All under content root (nx-content), so the index is shipped via Git/local like other content.

### What gets scanned

- `functions/` subtree via `resolver.listKeys('functions/')`: instructions, rules, task prompts. Keys are grouped by function id (folder-based only).

### Key-to-entity mapping

- Each function entity: one **canonical id** (from key path), one or more **source keys** (instructions, rules, prompt). Use folder-based keys: `skillInstructionsKeyForMode`, `skillRulesKey` (e.g. `functions/<id>/strong`, `functions/<id>/rules`).

## Index JSON schema (v1)

See **`docs/skills-index.schema.v1.json`** for the exact contract. Summary:

### Per-function `functions/index/v1/<skillId>.json`

| Field | Required | Description |
|-------|----------|-------------|
| `schemaVersion` | yes | `"1.0"` |
| `id` | yes | Stable string (e.g. skill name or dot-path). |
| `displayName` | yes | Short human name (Title Case). |
| `description` | yes | 1–2 sentences, ≤240 chars recommended. |
| `source` | yes | `contentPrefix`, `files[]` (key + kind), `contentHash` (sha256:...). |
| `runtime` | yes | `callName`, optional `modes[]`, `defaults`. |
| `io` | yes | `input` and `output` as restricted JSON Schema v1 objects. |
| `examples` | no | `[{ "input": {}, "output": {} }]`. |
| `tags` | no | `string[]`. |
| `quality` | yes | `confidence` (0–1), `notes[]`. |

**Source file kinds:** `instructions` | `rules` | `prompt` | `other`.

**Restricted JSON Schema v1 (for `io.input` / `io.output`):**

- Root: `{ "type": "object", "additionalProperties": false, "properties": {...}, "required": [...] }`.
- Allowed: `type`, `additionalProperties`, `properties`, `required`, `items`, `enum`, `default`, `description`, `minLength`, `maxLength`, `minimum`, `maximum`, `minItems`, `maxItems`.
- Not allowed: `$ref`, `oneOf`, `anyOf`, `allOf`, `patternProperties`, etc.

### Aggregate `skills/index.v1.json`

- `schemaVersion`, `generatedAt`, `generator` (name, mode, model), `skills`: array of `{ "$refKey": "skills/index/v1/<id>.json" }`.

### Meta `skills/index/v1/_meta.json`

- `schemaVersion`, `generatedAt`, `stats` (skillsTotal, skillsUpdated, skillsUnchanged, skillsErrored), `errors[]` (skillId, reason, lastGoodRefKey).

**Generic skills and known I/O:** The index is the place where I/O is “known” for content-driven skills so the runtime can validate input/output and so generic skills can be added/managed by anyone (instructions + index in the repo). See [GENERIC_SKILLS_IO.md](GENERIC_SKILLS_IO.md) for analysis and how the index fits into a generic add/manage mechanism.

## Public API

- **`getLibraryIndex({ resolver, key?, allowMissing? })`** — Read and parse aggregate index. Default key `skills/index.v1.json`. If missing, throws unless `allowMissing: true` (then returns empty structure).
- **`updateLibraryIndex({ resolver, prefix?, indexKey?, mode?, model?, dryRun?, incremental? })`** — Regenerate index: list keys, group by skill, LLM per skill, validate, write per-skill + aggregate + meta. Returns report (counts, added/updated/unchanged, errors). `dryRun=true`: no writes, return would-be diff. `incremental`: skip skill if `contentHash` unchanged.
- **`validateLibraryIndex(index)`** / **`validateSkillIndexEntry(entry)`** — Schema check and required fields; returns `{ valid: boolean, errors?: string[] }`.

## LLM usage

- Use **askJson** (light-skills) so the model returns a single JSON object.
- **Modes:** weak | normal | strong; default **normal**.
- **Determinism:** low temperature (e.g. 0.2), strict rules: no markdown, no extra keys, restricted schema.
- **Flow:** Primary prompt → validate → on failure, repair prompt (once) → on failure, minimal fallback prompt. LLM output is wrapped with `schemaVersion`, `source`, `runtime` by the indexer (code adds provenance; LLM provides id, displayName, description, io, examples, tags, quality).

Prompt templates (primary, repair, fallback) are defined in the indexer module; see code or `docs/FUNCTIONS_SPEC.md` if we add an “Indexer” function spec.

## Errors and safety

- If `listKeys(prefix)` fails: return clear error (“content backend unavailable”).
- If a skill’s files are missing/corrupt: continue other skills, collect errors in report.
- Do not overwrite index with empty/partial data unless explicitly `--force`.
