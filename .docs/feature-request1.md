# Feature Request: Index-Constrained Matching Output in `aifunctions-js`

## Summary

Add a first-class constrained-choice mode for JSON tasks where the model must pick from a provided candidate list by **index/ID** (not free-text labels).

## Problem

Current matching flows that ask the model to choose from large candidate lists (for example, 100-500 property paths) are vulnerable to:

- output drift (near-miss strings)
- invented values not present in the candidate list
- extra normalization/repair code in downstream consumers

This increases complexity for deterministic matching pipelines.

## Requested Capability

Provide an API option that:

- accepts candidate list as numbered entries or `{ id, label }` objects
- instructs model to return only IDs/indexes
- validates returned selections against the candidate set
- enforces `maxSelections`
- optionally supports ranked outputs

## Proposed API Shape (Illustrative)

```ts
import { runJsonCompletion } from "aifunctions-js/functions";

const out = await runJsonCompletion({
  instruction: "Pick the best matches for REQUIRED_ITEM from candidates.",
  options: {
    mode: "strong",
    model: "openai/gpt-5-nano",
    maxTokens: 600
  },
  constrainedChoice: {
    candidates: [
      { id: 1, label: "root.refNorm" },
      { id: 2, label: "layers.nodes.refRaw" },
      { id: 3, label: "layers.records.cvssVector" }
    ],
    return: "ids",           // "ids" | "indexes"
    maxSelections: 3,
    allowEmpty: true,
    ranked: true
  },
  responseSchema: {
    type: "object",
    required: ["selected"],
    properties: {
      selected: { type: "array", items: { type: "integer" } }
    },
    additionalProperties: false
  }
});
```

## Validation / Safety Expectations

The library should automatically:

- reject or repair out-of-range IDs/indexes
- deduplicate selected IDs
- enforce `maxSelections`
- preserve order when `ranked=true`
- return deterministic empty array when no candidate is good enough

## Why This Matters

- improves reliability for matching/classification tasks
- removes string-level ambiguity from downstream logic
- reduces custom glue code for post-validation and normalization
- enables cheaper model usage with stronger output determinism

## Primary Use Case

Per-item property matching in scoping pipelines:

- input: one required item + list of known property candidates
- output: selected candidate IDs/indexes only
- downstream logic computes status/coverage/priority deterministically

## Acceptance Criteria

- Consumer can pass candidate list and receive ID/index-only output.
- Any non-candidate output is repaired/rejected by library layer.
- `maxSelections` and `allowEmpty` are enforced.
- Works with existing JSON repair/retry flow.
- Backward compatible (feature is opt-in).

