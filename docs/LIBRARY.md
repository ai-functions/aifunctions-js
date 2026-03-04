# Library: Functions and skills

**Canonical I/O and templates:** For every function’s **Request/Response**, **Modes** (weak / normal / strong), and **SYSTEM / USER (INPUT_MD)** templates, see [FUNCTIONS_SPEC.md](FUNCTIONS_SPEC.md). That spec also lists planned skills (judge, compare, fix-instructions, generate-rule, etc.) for content-based or future implementation, marks which are **generic** (use the core executor) vs **orchestration** or **deterministic**, and describes how to **improve instructions and rules for all of them** via `optimizeInstructions` (bootstrap) and `generateInstructions` (iterative optimizer).

This document describes how the library is organized:

1. **Listed functions** — Built-in skills that are always available. They are implemented in code and registered by name (e.g. `extractTopics`, `matchLists`). You can call them directly or via `run(skillName, request)`.
2. **Unlisted (content-based) functions** — Any skill that has instructions (and optional rules) in the content repo is runnable even if it is not in the list below. As long as the content for that skill exists in git (e.g. `skills/<name>-instructions.md` and optionally `skills/<name>-rules.json`), you can run it with `run(skillName, request)` or `runWithContent(skillName, request, { resolver })`. For a **generic** add/manage story (I/O known in the repo, optional validation), see [GENERIC_SKILLS_IO.md](GENERIC_SKILLS_IO.md) and the library index ([skills-index.v1.md](skills-index.v1.md)). See also [Content-based skills](#content-based-skills-unlisted) and [CONTENT_SKILLS.md](CONTENT_SKILLS.md).

All listed skills support optional **rules** from content: when you call `run(skillName, request, { resolver })`, the resolver is used to load rules for that skill (if present) and they are applied automatically to the model’s system instruction.

---

## Listed functions (built-in skills)

These are the skills that are implemented and registered in the library. You can invoke them by name via `run(skillName, request)` or by calling the function directly.

### extractTopics

Extracts key topics from text.

| | |
|---|---|
| **Params** | `text: string`, `maxTopics?: number` (default 5), `mode?`, `client?`, `model?` |
| **Returns** | `{ topics: string[] }` |
| **Run name** | `extractTopics` |

---

### extractEntities

Extracts named entities (e.g. Person, Organization, Location) from text.

| | |
|---|---|
| **Params** | `text: string`, `entityTypes?: string[]` (default: Person, Organization, Location, Date, Product), `mode?`, `client?`, `model?` |
| **Returns** | `{ entities: Array<{ name: string; type: string; context?: string }> }` |
| **Run name** | `extractEntities` |

---

### matchLists

Matches items from two lists by semantic similarity and naming. Supports incremental runs via `existingMatches`.

| | |
|---|---|
| **Params** | `list1: any[]`, `list2: any[]`, `guidance: string`, `existingMatches?: MatchResult[]`, `mode?`, `client?`, `model?`, `additionalInstructions?` |
| **Returns** | `{ matches: Array<{ source; target; reason? }>; unmatched: any[] }` |
| **Run name** | `matchLists` |

---

### summarize

Generates a summary and key points from text.

| | |
|---|---|
| **Params** | `text: string`, `length?: "brief" \| "medium" \| "detailed"`, `mode?`, `client?`, `model?` |
| **Returns** | `{ summary: string; keyPoints: string[] }` |
| **Run name** | `summarize` |

Also: **summarizeStream** — same params, returns an async generator of `{ type: "text" \| "usage" \| "done"; text?; usage? }`.

---

### classify

Classifies text into one or more provided categories.

| | |
|---|---|
| **Params** | `text: string`, `categories: string[]`, `allowMultiple?: boolean`, `mode?`, `client?`, `model?` |
| **Returns** | `{ categories: string[]; confidence?: number }` |
| **Run name** | `classify` |

---

### sentiment

Analyzes sentiment of text (positive / negative / neutral) with a score.

| | |
|---|---|
| **Params** | `text: string`, `mode?`, `client?`, `model?` |
| **Returns** | `{ sentiment: "positive" \| "negative" \| "neutral"; score: number }` |
| **Run name** | `sentiment` |

---

### translate

Translates text to a target language.

| | |
|---|---|
| **Params** | `text: string`, `targetLanguage: string`, `mode?`, `client?`, `model?` |
| **Returns** | `{ translatedText: string; detectedSourceLanguage?: string }` |
| **Run name** | `translate` |

---

### rank

Ranks a list of items by relevance to a query.

| | |
|---|---|
| **Params** | `items: any[]`, `query: string`, `mode?`, `client?`, `model?` |
| **Returns** | `{ rankedItems: Array<{ item: any; score: number; reason? }> }` |
| **Run name** | `rank` |

---

### cluster

Groups items into semantic clusters with labels.

| | |
|---|---|
| **Params** | `items: any[]`, `numClusters?: number`, `mode?`, `client?`, `model?` |
| **Returns** | `{ clusters: Array<{ label: string; items: any[] }> }` |
| **Run name** | `cluster` |

---

### ai.ask (generic skill)

Generic “do what the instruction says” skill. You provide an instruction, an output contract (e.g. JSON shape), and optional input data. The model returns parsed JSON.

| | |
|---|---|
| **Params** | `instruction: string`, `outputContract: string`, `inputData?: string \| Record<string, unknown>`, `mode?`, `client?`, `model?` |
| **Returns** | Parsed JSON (shape defined by your contract) |
| **Run name** | `ai.ask` |

---

## Running skills by name: run and runWithContent

- **`run(skillName, request, options?)`**  
  Runs a skill by name. If the skill is one of the [listed](#listed-functions-built-in-skills) built-in skills, it runs that implementation. Otherwise it uses the content resolver (from `options.resolver` or the default) to load instructions and rules from the repo and runs the skill via **runWithContent**. So both listed and unlisted (content-based) skills can be run with the same API.

- **`runWithContent(skillName, request, { resolver, client?, mode? })`**  
  Runs a skill using instructions (and optional rules) resolved from the content resolver. Use this when the skill is defined only in content (e.g. instructions in `skills/<name>-instructions.md` or legacy `skills/<name>/weak`, `skills/<name>/normal`). Rules, when present in content (`skills/<name>-rules.json` or legacy `skills/<name>/rules`), are appended to the system instruction automatically.

- **`getSkillNames()`**  
  Returns the list of built-in skill names (sync).

- **`getSkillNamesAsync(resolver?)`**  
  Returns built-in names plus any skill names discovered from the content resolver (e.g. from keys under `skills/`). Use this to see “all available skills” including unlisted ones that exist only in git.

---

## Content-based skills (unlisted)

Any skill that is **not** in the [listed](#listed-functions-built-in-skills) set can still be used if it has content in the skills repo:

- **Instructions**: either file-based (`skills/<name>-instructions.md`) or legacy (`skills/<name>/weak`, `skills/<name>/normal`, `skills/<name>/strong`).
- **Rules** (optional): either file-based (`skills/<name>-rules.json`) or legacy (`skills/<name>/rules`).

When content exists for a given name, that name is discoverable via `getSkillNamesAsync(resolver)` and runnable via `run(skillName, request)` (or `runWithContent(skillName, request, { resolver })`). The library does not need to “list” these skills in code; they are available as long as the content is present in the repo. See [CONTENT_SKILLS.md](CONTENT_SKILLS.md) for a catalog of content-only skills (e.g. judge, compare, fixInstructions) and the content key conventions in [skillsResolver](../src/content/skillsResolver.ts).

---

## Core: executor and standardisation

All listed skills (and `runWithContent`) use a **single execution path**:

- **executeSkill(config)** — Standardised executor. Takes `request`, `buildPrompt(request)`, `instructions` (weak/normal/strong), optional `rules`, and optional `client`/`mode`/`model`. Builds the prompt, merges instruction + rules, calls the LLM, parses JSON and returns. Every built-in skill calls this with a skill-specific `buildPrompt` and `instructions`.
- **executeSkillStream(config)** — Streaming variant; yields text, usage, and done chunks (e.g. used by `summarizeStream`).
- **buildRequestPrompt(request)** — Builds a standard `# Request` section with the payload as JSON. Used by content-based skills and by `runWithContent`.

Config shape: **ExecuteSkillConfig** (`request`, `buildPrompt`, `instructions`, `rules?`, `client?`, `mode?`, `model?`). This keeps instruction handling, rules appending, and JSON parsing in one place.

---

## Core helpers (not run by name)

These are used by the executor or for custom flows; they are not invoked via `run(skillName, ...)`.

| Function | Purpose |
|----------|---------|
| **callAI** | Generic LLM call with mode-based instructions (weak/normal/strong), optional `rules` appended to system. Returns parsed JSON. Used by the executor. |
| **callAIStream** | Streaming variant of callAI; yields `{ type: "text" \| "usage" \| "done"; text?; usage? }`. |
| **askJson** | Ask the model with an instruction and optional output contract; returns parsed JSON. |
| **parseJsonResponse** | Parse or extract JSON from model text (with optional LLM fallback). |
| **extractFirstJson** | Extract the first JSON object from a string (for parsing model output). |
| **formatRulesForInstruction** | Format an array of `{ rule, weight }` into a “Rules to follow” section string. |
| **ask** | Generic instruction + output-contract skill (same as `ai.ask` when run by name). |

---

## Summary

- **Listed functions** are the built-in skills (extractTopics, extractEntities, matchLists, summarize, classify, sentiment, translate, rank, cluster, ai.ask). They are always available and can use rules from content when you pass a resolver.
- **Unlisted functions** are any other skill name that has instructions (and optionally rules) in the content repo. They are run the same way: `run(skillName, request)` or `runWithContent(skillName, request, { resolver })`. No code change is required to “add” them; add the content in git and they become available.

For content key conventions and how to add instructions and rules to the repo, see [skillsResolver](../src/content/skillsResolver.ts) and the sync/optimize scripts in the repo (e.g. `content:sync`).
