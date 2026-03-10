# Library functions — manual mode (full list)

All functions in the library are supported for **manual** (programmatic) use: you can call them directly in code without using the REST server. Rules, optimization, and validation are available the same way.

**Source of truth:** `getSkillNames()` in `functions/router.ts` and the built-in manifest in `functions/builtinManifest.ts`.

---

## All built-in functions (manual mode)

These are the canonical names returned by `getSkillNames()`. Every one can be:

- **Imported and called directly** from `aifunctions-js/functions` (or `light-skills/functions`).
- **Run by name** via `run(skillName, request, options)` with optional `contentProvider` or `resolver` so instructions and **rules** are loaded from content.
- **Validated** with `validateOutput: true` in `run()` when a resolver is provided (contract compliance against the library index).

| Name | Description |
|------|-------------|
| `matchLists` | Match items from two lists by semantic meaning and naming similarity. |
| `extractTopics` | Extract key topics from input text. |
| `extractEntities` | Extract named entities from input text. |
| `summarize` | Summarize text and extract key points. |
| `classify` | Classify text into one or more provided categories. |
| `sentiment` | Determine sentiment and confidence score for input text. |
| `translate` | Translate text to a target language while preserving context. |
| `rank` | Rank items by relevance to a query. |
| `cluster` | Group items into semantic clusters. |
| `ai.ask` | Run a generic AI prompt and return text output. |
| `judge` | Score a response against weighted rules. |
| `compare` | Compare multiple responses and rank the best candidate. |
| `generateInstructions` | Generate and iteratively improve instructions from test cases. |
| `optimizeInstructions` | Rewrite instructions to improve quality. |
| `fixInstructions` | Fix instructions based on judge feedback. |
| `generateRule` | Generate one weighted judge rule from instructions/context. |
| `generateJudgeRules` | Generate a set of weighted judge rules. |
| `raceModels` | Benchmark candidate models on shared test cases. |
| `collectionMapping` | Infer collection and field mappings between two schemas. |
| `validateFieldRelationship` | Validate whether two fields represent the same semantic relationship. |
| `suggestFieldRelationship` | Suggest relationship type and confidence between two fields. |
| `ai.normalize-judge-rules.v1` | Normalize and sanitize judge rules. |
| `ai.aggregate-judge-feedback.v1` | Aggregate multiple judge outputs into a single feedback report. |

---

## How to use in manual mode

### 1) Direct import (with rules in request when needed)

```ts
import {
  matchLists,
  summarize,
  judge,
  compare,
  fixInstructions,
  generateJudgeRules,
  generateInstructions,
  raceModels,
} from "aifunctions-js/functions";

// Prebuilt functions — no content needed
const { matches } = await matchLists({ list1, list2, guidance: "..." });
const { summary } = await summarize({ text: longDoc, length: "brief" });

// Judge/optimization — pass rules in the request
const verdict = await judge({
  instructions: "...",
  response: "...",
  rules: [{ rule: "Must output valid JSON", weight: 2 }],
  threshold: 0.8,
});
const { fixedInstructions } = await fixInstructions({ instructions, judgeFeedback: verdict });
```

### 2) Run by name with rules from content

When you use a content provider or resolver, **rules and instructions** for that function are loaded automatically:

```ts
import { run, getSkillNames } from "aifunctions-js/functions";
import { createFunctionContentProvider } from "aifunctions-js"; // or your store/inline provider

const contentProvider = createFunctionContentProvider({ mode: "shared-store", baseUrl: "..." });
// or resolver from getSkillsResolver() for git-backed content

// Run any built-in (or content) function; rules come from content
const result = await run("judge", request, {
  contentProvider,  // or resolver
  validateOutput: true,  // optional: validate against library index schema
});
```

### 3) List everything available

```ts
import { getSkillNames, getSkillNamesAsync } from "aifunctions-js/functions";

const builtInOnly = getSkillNames();
const builtInPlusContent = await getSkillNamesAsync(resolver);
```

---

## Rules and optimization in manual mode

- **Rules:** For built-in skills that support rules (e.g. `judge`), pass `rules` in the request when calling directly, or pass `contentProvider` / `resolver` to `run()` so rules are loaded from content (`functions/<id>/rules` or provider equivalent).
- **Optimization:** All optimization flows are available as direct imports: `generateInstructions`, `optimizeInstructions`, `fixInstructions`, `generateJudgeRules`, `compare`, `raceModels`. Use them with the same request shapes as the REST API (see [API_CONTRACT.md](API_CONTRACT.md) and README).
- **Validation:** Use `run(skill, request, { resolver, validateOutput: true })` to get `{ result, validation }` and check contract compliance against the library index.

---

## REST API parity

The same functions are exposed over HTTP. Manual mode and the server share the same implementation:

- **POST /run** — `run(skill, input, …)`
- **POST /functions/:id/run** — same, with function-scoped content
- **POST /optimize/judge**, **/optimize/rules**, **/optimize/fix**, **/optimize/compare**, **/optimize/generate** — map to `judge`, `generateJudgeRules`, `fixInstructions`, `compare`, `generateInstructions`

So anything you can do via the API you can do in code with the same behavior and rules/optimization support.
