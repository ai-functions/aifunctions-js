# Content restructure: functions/ prefix and one folder per function

This document describes the restructure from a mixed `skills/` layout (folder-per-skill plus legacy flat files) to a single canonical layout: **`functions/`** prefix with **one folder per function** and no backward compatibility to the old paths.

---

## What changed

### Before

- **Content root:** `.content/skills/` with a mix of:
  - **Folder-per-skill:** e.g. `classify/`, `matchLists/`, each with `normal.md`, `weak.md`, `rules`, `test-cases.json`, `meta.json`.
  - **Legacy flat files** at the same level: `classify-instructions.md`, `classify-rules.json`, `matchLists-instructions.md`, etc.
- **Resolver and index** used the prefix `skills/` everywhere: `skills/<id>/strong`, `skills/<id>/rules`, `skills/index.v1.json`, `skills/index/v1/<id>.json`.
- **Deprecated helpers** existed for flat keys: `skillInstructionsFileKey` → `skills/<id>-instructions.md`, `skillRulesFileKey` → `skills/<id>-rules.json`. Some code paths could still reference these.

### After

- **Single content prefix:** `functions/`. All keys and paths use this prefix only.
- **Strict layout:** One folder per function: `functions/<functionId>/` with only folder-based keys (no root-level flat files).
- **Index and discovery:** Index at `functions/index.v1.json`; per-function entries at `functions/index/v1/<id>.json`; discovery via `listKeys("functions/")`.
- **No flat files:** No `functions/<id>-instructions.md` or `functions/<id>-rules.json`; the deprecated flat-key helpers were removed.

---

## How it is now

### On-disk layout (`.content/`)

```
.content/
└── functions/
    ├── index.v1.json              # aggregate index (list of $refKey)
    ├── index/
    │   └── v1/
    │       ├── _meta.json         # last index run stats/errors
    │       ├── classify.json      # per-function index entry
    │       ├── matchLists.json
    │       └── ...
    ├── classify/
    │   ├── normal.md              # instructions (API "normal" → strong)
    │   ├── weak.md
    │   ├── rules.md               # or rules (judge rules JSON)
    │   ├── test-cases.json
    │   └── meta.json
    ├── matchLists/
    │   ├── normal.md
    │   ├── weak.md
    │   ├── rules.md
    │   ├── test-cases.json
    │   ├── meta.json
    │   ├── race-config.json       # optional
    │   └── races.json             # optional
    └── <functionId>/
        └── ...                    # same pattern
```

There are **no** files like `functions/classify-instructions.md` or `functions/classify-rules.json` at the root of `functions/`.

### Content keys (what the resolver uses)

| Purpose              | Key pattern                         | Example                    |
|----------------------|-------------------------------------|----------------------------|
| Instructions (mode)  | `functions/<id>/strong`, `weak`, `ultra` | `functions/classify/strong` |
| Rules                | `functions/<id>/rules`             | `functions/classify/rules` |
| Test cases           | `functions/<id>/test-cases.json`   | `functions/matchLists/test-cases.json` |
| Function meta        | `functions/<id>/meta.json`         | `functions/matchLists/meta.json` |
| Race config          | `functions/<id>/race-config.json`   | `functions/matchLists/race-config.json` |
| Race history         | `functions/<id>/races.json`        | `functions/matchLists/races.json` |
| Aggregate index     | `functions/index.v1.json`          | —                          |
| Per-function index   | `functions/index/v1/<id>.json`     | `functions/index/v1/classify.json` |
| Index meta           | `functions/index/v1/_meta.json`    | —                          |

The API mode **"normal"** maps to the **strong** instruction key; there is no separate `normal` file key in the schema.

### Discovery

- **List all function ids:** `getSkillNamesFromContent(resolver)` calls `resolver.listKeys("functions/")` and derives ids from keys like `functions/<id>/strong` (i.e. keys with at least two path segments under `functions/`).
- **Layout lint:** `runLayoutLint(resolver)` ensures every key under `functions/` is folder-based (`functions/<id>/...`) and reports any remaining flat-style keys as errors.

### Code and config

- **`src/content/skillsResolver.ts`:** Exports `CONTENT_PREFIX = "functions/"`. All key helpers (`skillInstructionsKeyForMode`, `skillRulesKey`, `skillTestCasesKey`, `functionMetaKey`) and `getSkillNamesFromContent` use `CONTENT_PREFIX`. The deprecated `skillInstructionsFileKey` and `skillRulesFileKey` were removed.
- **`src/content/libraryIndex.ts`:** `CONTENT_PREFIX`, `DEFAULT_INDEX_KEY` (`functions/index.v1.json`), `INDEX_PREFIX`, `META_KEY` all use `functions/`. Default prefix for `updateLibraryIndex` is `CONTENT_PREFIX`.
- **`src/content/raceStorage.ts`:** Paths are `functions/${segment}/race-config.json` and `functions/${segment}/races.json`.
- **`src/content/validateFunction.ts`,** **`lintContentLayout.ts`,** **`fullLibrarySnapshot.ts`,** **`updateLibraryIndexCli.ts`:** All reference `functions/` (or the shared prefix constant) and no longer use `skills/` or flat keys.
- **`src/serve.ts`:** Default index prefix and error paths use `functions/`.
- **Scripts** (e.g. `updateLibraryIndex.ts`, `copyLibraryIndexToDocs.ts`, `ensureAllFunctionsCoverage.ts`, `copyFullLibraryIndexToDocs.ts`, `runFixtures.ts`, `lintContentLayout.ts`, `commitContentIndex.sh`): Paths and messages use `functions/` and `functions/index.v1.json`.

### Docs and fallbacks

- **.docs/library-index-json-and-api.md:** Updated to describe paths under `functions/` and the canonical content layout (see “Canonical content layout” there).
- **.docs/skills-index.v1.md,** **.docs/skills-index.schema.v1.json:** Paths and defaults use `functions/`.
- **.docs/library-index.fallback.json,** **.docs/library-index.full.fallback.json:** `$refKey` and `contentPrefix` use `functions/` so fallback loading is consistent with the new layout.

---

## Migration that was performed

1. **Rename:** `.content/skills/` was renamed to `.content/functions/`.
2. **Flat files:** For each legacy flat file (`*-instructions.md`, `*-rules.json`): if the corresponding function folder already had instructions or rules, the flat file was deleted; otherwise the flat content would have been copied into the folder. In this repo, all relevant folders already had content, so flat files were only removed.
3. **No backward compatibility:** The codebase does not read from `skills/` or from flat keys under `functions/`.

---

## Related docs

- [library-index-json-and-api.md](library-index-json-and-api.md) — Index format, API, and canonical content layout.
- [skills-index.v1.md](skills-index.v1.md) — Index schema and key-to-entity mapping.
- [INTERNALS-CONTENT-STORE-AND-WRITE-MODEL.md](INTERNALS-CONTENT-STORE-AND-WRITE-MODEL.md) — How the content store and resolver work (key naming, write model, modes).
