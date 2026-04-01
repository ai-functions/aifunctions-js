# Feature Request: Generic `match` Function in `aifunctions-js`

## Summary

Add a generic built-in function for structured matching:

- input: one `query` + many `candidates`
- output: best matches with stable IDs, scores, and concise reasons
- optional constraints for deterministic behavior

This should be reusable across domains (data mapping, taxonomy alignment, field matching, entity linking, triage routing).

## Why

Many projects need the same primitive:

- "Given X, choose best matching Y from known options."

Today each consumer re-implements prompt design, schema enforcement, retries, and post-validation. A generic built-in function would reduce glue code and improve reliability.

## Proposed Function

### Name

`match` (or `matchCandidates`)

### Input (generic)

```ts
type MatchInput = {
  query: string;
  candidates: Array<{
    id: string | number;
    label: string;
    metadata?: Record<string, unknown>;
  }>;
  guidance?: string;
  maxResults?: number;           // default: 3
  minScore?: number;             // optional threshold
  allowNoMatch?: boolean;        // default: true
  returnReasons?: boolean;       // default: true
  mode?: "weak" | "normal" | "strong" | "ultra";
};
```

### Output (generic)

```ts
type MatchOutput = {
  query: string;
  matches: Array<{
    id: string | number;
    score: number;               // 0..1
    reason?: string;
  }>;
  noMatch: boolean;
};
```

## Behavior Requirements

- Return only candidate IDs that exist in input list.
- Preserve deterministic ordering (highest score first).
- Enforce `maxResults`.
- If `allowNoMatch=true` and nothing is strong enough, return `noMatch=true` and empty `matches`.
- Score range must be normalized to `[0, 1]`.
- Must support JSON-safe retries/repair internally (same reliability expectations as existing JSON utilities).

## Optional Advanced Capabilities

- `strategy`: `"semantic"` | `"lexical"` | `"hybrid"`
- `calibration`: convert model confidence to normalized score
- `strictIdsOnly`: return IDs only (no labels in output)
- `explanations`: `"none"` | `"short"` | `"full"`
- `tieBreak`: deterministic tie policy

## Example Usage

```ts
import { match } from "aifunctions-js/functions";

const out = await match({
  query: "cve or equivalent vulnerability id",
  candidates: [
    { id: "root.refNorm", label: "Normalized reference field" },
    { id: "layers.nodes.cve", label: "CVE-like identifier on node records" },
    { id: "layers.records.pluginId", label: "Plugin identifier field" }
  ],
  guidance: "Prefer direct vulnerability identity fields over indirect signals.",
  maxResults: 3,
  allowNoMatch: true,
  mode: "normal"
});
```

## Acceptance Criteria

- Generic function available under `aifunctions-js/functions`.
- Works with any candidate list and query text.
- Enforces ID validity and output shape.
- Supports mode-based model routing.
- Returns stable machine-friendly result for downstream logic.

## Backward Compatibility

This is additive. No breaking changes required.

