# Variation, Versioning, and Race-on-Your-Data

## The Problem, in Detail

### 1. The variation space is multi-dimensional, but the storage is flat

Every function today lives at `skills/<id>/` with one of everything:

```
skills/extract-invoice-lines/
  strong              ← one instruction variant
  weak
  ultra
  rules               ← one judge-rules file
  test-cases.json     ← one example set
  race-config.json    ← one "best model" winner
  races.json          ← one log of all past races (up to 200)
  meta.json
```

But the real axes of variation are:

| Axis | Current support |
|------|----------------|
| Instruction strength (weak / strong / ultra) | Yes — three files |
| **Input domain / dataset** ("your data") | **No — one shared test-cases.json** |
| **Race results scoped to a dataset** | **No — one shared races.json** |
| **Best model per domain** | **No — one shared race-config.json** |
| Git commit history (linear) | Yes — via `getVersions` |

The git commit history is a linear timeline. It answers "what did this function look like at time T." It does not answer "which model performs best on *my* type of inputs" or "what examples apply to *my* domain." That orthogonal dimension is missing entirely.

---

### 2. "Version v1/v2" is the wrong metaphor

The release mechanism today (Phase 2.5 in ROADMAP.md) creates git tags like `functions/<id>/vN`. That is a deployment snapshot — a point-in-time contract saying "this instruction text is stable." It is useful for pinning production calls.

But the question being asked here is different: **within a single function, there are many valid variations depending on who is calling it and with what data.** Consider `extract-invoice-lines`:

- Team A: extracts from scanned PDFs of multi-page invoices → `claude-3-opus` wins their race
- Team B: extracts from structured HTML invoices → `gpt-4o-mini` is 10× cheaper with equal quality
- Team C: built their own examples, runs different judge rules

These are not v1 → v2 → v3. They are **branches of applicability**, not a sequence of improvements. Calling them v1/v2 implies one is better than another; in reality they are better *for different inputs.*

---

### 3. Race results from different users are meaningless when mixed

The current race system (`src/content/raceStorage.ts`) appends every race to the same `races.json` (capped at 200) and writes one winner to `race-config.json`. This means:

- If Alice runs a race with her 10 legal-document examples, `race-config.json` says `claude-3-opus` is best.
- Bob runs a race with his 10 short-form invoices, `race-config.json` is overwritten: `gpt-4o-mini` is best.
- Alice's race is now in `races.json` history, unlabeled, with no link to the examples used.
- Neither Alice nor Bob can trust `race-config.json` — it reflects whoever ran last.

There is no way today to say: "race against *my* examples and keep that result separate from the shared result."

---

### 4. Examples also have an origin and a scope problem

Test cases / examples today:

- Are stored in one flat `skills/<id>/test-cases.json`.
- Can be hand-authored or auto-generated (via `generateExamples`).
- Have no authorship, no dataset label, no link to race results.

If the system generates 5 examples and Alice uploads 10 from her domain and Bob uploads 10 from his domain, they all merge into one file. There is no way to know which examples are generic vs domain-specific, or to race against only Alice's subset.

---

### 5. The result: a single "best model" that may be wrong for everyone

The entire point of racing is to find the model that performs best **on your actual workload.** The shared `race-config.json` produces a single answer for a heterogeneous question. The answer is only meaningful for whoever ran the last race, and even then only if their test cases represent their real traffic.

---

## Three Solutions

---

### Solution 1 — Named Datasets (recommended starting point)

**Core idea:** Introduce a `datasets/` sub-namespace under each function. A dataset is a named collection of examples (test cases) + its own race results + its own race-config (best model). The function's instructions and rules remain shared; only the data-dependent artifacts are scoped to a dataset.

**Content layout:**

```
skills/<id>/
  strong
  weak
  ultra
  rules
  meta.json
  datasets/
    default/
      test-cases.json      ← the current test-cases.json, migrated here
      examples.json        ← fixtures / generated examples
      races.json           ← races run against THIS dataset only
      race-config.json     ← best model FOR THIS DATASET
    cognni-invoices/
      test-cases.json
      examples.json
      races.json
      race-config.json
    acme-html-invoices/
      ...
```

**New API surface:**

```
POST   /functions/:id/datasets                           create a dataset
GET    /functions/:id/datasets                           list datasets
GET    /functions/:id/datasets/:datasetId                get dataset summary
PUT    /functions/:id/datasets/:datasetId/test-cases     upload your examples
GET    /functions/:id/datasets/:datasetId/test-cases     get examples in dataset
POST   /functions/:id/datasets/:datasetId:race           race models on YOUR data
GET    /functions/:id/datasets/:datasetId/race-config    best model for YOUR data
POST   /functions/:id/datasets/:datasetId:generate-examples  auto-generate examples scoped to this dataset
```

**How call routing works:**

```json
POST /functions/extract-invoice-lines:run
{
  "inputMd": "...",
  "dataset": "cognni-invoices"      ← optional, picks that dataset's best model
}
```

If `dataset` is omitted, falls back to `default` dataset race-config, then to `race-config.json` at root for backwards compatibility.

**Migration:** Existing `test-cases.json` and `race-config.json` at the root are migrated into `datasets/default/`. Old behavior is preserved exactly.

**What this solves:**
- Race results are scoped to the dataset — Alice's race doesn't overwrite Bob's.
- `race-config.json` at the dataset level is trustworthy: it answers "best model for this data."
- Examples have explicit scope — generated vs domain-specific are in separate datasets.
- No change to the function's instructions or rules namespace.
- Backwards compatible: the `default` dataset is the current behavior.

**What it does NOT solve:**
- Different users sharing the same dataset still overwrite each other. That requires Phase 3.2 org-namespacing.
- Instructions are still shared — two teams cannot have different instruction variants unless they fork the function.

---

### Solution 2 — Contexts as Full Variation Branches

**Core idea:** A context is a named variation of an entire function — it can override instructions, rules, examples, *and* race config independently. Think of it as making git branching explicit in the content model.

**Content layout:**

```
skills/<id>/
  strong                 ← base instructions (shared / default)
  weak
  ultra
  rules                  ← base rules
  meta.json
  contexts/
    default/             ← inherits base; can override anything
    cognni/
      strong             ← overrides instructions for this context only
      rules              ← overrides rules for this context
      test-cases.json
      races.json
      race-config.json
    acme/
      test-cases.json    ← only overrides data, inherits base instructions
      races.json
      race-config.json
```

**Resolution order:** When looking up `skills/<id>/contexts/<ctx>/strong`, fall back to `skills/<id>/strong` if not found. This gives per-context instructions only where explicitly set.

**New API surface:**

```
POST   /functions/:id/contexts                           create a context
GET    /functions/:id/contexts                           list contexts
GET    /functions/:id/contexts/:ctx                      context summary
PUT    /functions/:id/contexts/:ctx/instructions         set context-specific instructions
PUT    /functions/:id/contexts/:ctx/rules                set context-specific rules
PUT    /functions/:id/contexts/:ctx/test-cases
POST   /functions/:id/contexts/:ctx:race
POST   /functions/:id/contexts/:ctx:optimize             optimize instructions scoped to this context
POST   /functions/:id/contexts/:ctx:validate
POST   /functions/:id/contexts/:ctx:release              release a context-specific version
```

**Call routing:**

```json
POST /functions/extract-invoice-lines:run
{
  "inputMd": "...",
  "context": "cognni"      ← uses cognni's instructions + cognni's best model
}
```

**What this solves:**
- Everything Solution 1 solves, plus:
- Different teams can have different instruction *and* rule variants without forking the function.
- Context-scoped optimize: optimize instructions specifically against your test cases.
- Context-scoped release: release a version that is valid only for a specific context.
- The function `extract-invoice-lines` is one identity, but serves many use cases with different tuned variants.

**Complexity cost:**
- Inheritance logic (fallback from context → base) adds complexity to every resolver call.
- "Release" semantics become unclear: is v3 for the base or for the `cognni` context?
- UI/API surface doubles in size.
- Should be built on top of Solution 1 (datasets), not instead of it.

**Recommended:** This is Phase 2 of the variation story — implement Solution 1 first, then extend contexts on top as an optional layer for teams who need different instructions per domain.

---

### Solution 3 — Ephemeral Race Sessions (Race-as-a-Service)

**Core idea:** Decouple races from the content store entirely. A race is an ephemeral session, not a content artifact. You bring your examples inline, get results back, and optionally "apply" the winner to a named slot.

**How it works:**

```
POST /functions/:id:race
{
  "examples": [                    ← examples inline (your data, not stored)
    { "inputMd": "...", "expectedOutputMd": "..." },
    ...
  ],
  "candidates": ["claude-3-opus", "gpt-4o-mini", "mistral-large"],
  "slot": "cognni-invoices"        ← optional: after race, write winner here
}
→ { "sessionId": "...", "jobId": "..." }

GET /functions/:id/race-sessions/:sessionId
→ { "status": "done", "ranking": [...], "winner": "gpt-4o-mini", "slot": "cognni-invoices" }
```

A "slot" is just a named preference entry, stored compactly (not in git, or in a lightweight sidecar store):

```
skills/<id>/preferences/<slot>.json
→ { "preferredModel": "gpt-4o-mini", "basedOnSession": "session-xyz", "runAt": "..." }
```

When calling the function:

```json
POST /functions/extract-invoice-lines:run
{
  "inputMd": "...",
  "slot": "cognni-invoices"
}
```

**What this solves:**
- Zero friction: no need to create a dataset, upload test cases, then run race. You just call `:race` with your examples.
- Race results are not mixed into shared `races.json` unless you choose to apply them.
- Multiple concurrent races from different teams don't interfere at all.
- The content store (`races.json`) stays clean — only intentional, applied results live there.
- The "bring your own examples" UX is a single API call.

**What it does NOT solve:**
- If you run many races on the same data, you're re-uploading the same examples every time.
- No persistence of your examples: you must supply them every race call.
- Not a replacement for stored test cases needed for score-gated release validation (Phase 2.4/2.5).
- Slots are lightweight — if you want full history per domain, you still need Solution 1's dataset approach.

**Best fit for:** Ad-hoc "which model works for my inputs right now?" use cases. Complements Solutions 1/2 rather than replacing them — the stored dataset path is for repeatable CI validation; the ephemeral session path is for exploration.

---

## Recommended Roadmap Addition

These three solutions are complementary and should be phased:

| Phase | Feature | Builds on |
|-------|---------|----------|
| **Phase 2.7** | Ephemeral race sessions (`POST /functions/:id:race` with inline examples + `slot`) | Existing race infrastructure |
| **Phase 2.8** | Named datasets (`datasets/<datasetId>/`) with dataset-scoped race and generate-examples | Phase 1.1 test-cases, Phase 2.7 race sessions |
| **Phase 2.9** | Generated examples: `POST /functions/:id/datasets/:datasetId:generate-examples` | Phase 2.8 datasets, existing `generateExamples` |
| **Phase 3.6** | Context branches (`contexts/<ctx>/`) with per-context instructions + release | Phase 2.8 datasets, Phase 3.2 org namespacing |

---

## What to change in the content model (concrete)

### Phase 2.7 — Ephemeral race sessions

No content model change. Add to `raceStorage.ts`:
- `RaceSession` type: `{ sessionId, functionId, examples, candidates, results, winner, slot, runAt }`
- Sessions stored in jobs store (already exists in `serve/jobs.ts`), not in git content.
- Add `slot` field to `RaceRecord` (optional, for applied sessions).
- New handler in `serve.ts` for `POST /functions/:id:race` accepting inline examples.

### Phase 2.8 — Named datasets

Content key convention:
```
skills/<id>/datasets/<datasetId>/test-cases.json
skills/<id>/datasets/<datasetId>/examples.json
skills/<id>/datasets/<datasetId>/races.json
skills/<id>/datasets/<datasetId>/race-config.json
```

New functions in `skillsResolver.ts`:
```typescript
datasetTestCasesKey(skillId, datasetId)
datasetRaceConfigKey(skillId, datasetId)
getDatasetTestCases(resolver, skillId, datasetId)
setDatasetTestCases(resolver, skillId, datasetId, cases)
getDatasetRaceConfig(resolver, skillId, datasetId)
setDatasetRaceConfig(resolver, skillId, datasetId, config)
listDatasets(resolver, skillId)
```

`raceStorage.ts`: `appendRace` / `getRaceReport` gain optional `datasetId` parameter; default (`undefined`) continues to write to the root `races.json` for backwards compat.

### Phase 2.9 — Generated examples scoped to a dataset

`generateExamples.ts` gains `datasetId` option. When provided, writes results to `datasets/<datasetId>/examples.json` instead of root.

---

## Key design constraint

The current `race-config.json` "best model" at the function root level should remain and mean: **"best model when no dataset/slot context is specified."** It is set either by a race on the `default` dataset or by an explicit admin write. All other dataset-scoped `race-config.json` files are additive and do not overwrite it. This preserves backwards compatibility for all existing callers that do not pass `dataset` or `slot`.
