# Playground Gaps — Capabilities the UI Should Cover

This document lists capabilities in the library and server that the playground UI should expose but currently doesn't, because either the HTTP endpoint is missing or the contract doesn't describe it. Only user-facing actions are listed — internal pipeline utilities are excluded.

---

## High Priority

These are missing from the playground's primary workflow loops.

---

### 1. Generate instructions from test cases

The "1-minute function" action. A developer describes what they want, provides a few test cases, and the system writes, runs, judges, and rewrites instructions until they pass a quality threshold. Returns the best instructions found, a score, and a per-cycle history so the user can see the improvement trajectory.

The contract specifies `POST /optimize/generate` but the server has no route for it. The `generateInstructions` function is fully implemented and ready to be wrapped.

**Proposed endpoint:**
```
POST /optimize/generate
Body: { description, testCases: [{ id, input }], rules?, threshold, maxCycles, mode, targetModel }
Response: { jobId, status: "running" }  — poll GET /jobs/:id for result
```

Job result:
```json
{
  "achieved": true,
  "cyclesRun": 3,
  "best": { "instructions": "...", "avgScore": 0.91, "passRate": 1.0 },
  "history": [{ "cycle": 1, "score": 0.65 }, { "cycle": 2, "score": 0.82 }, { "cycle": 3, "score": 0.91 }]
}
```

---

### 2. Judge a response

The "why did this fail?" action. A developer runs their function, gets an output they're not sure about, and wants to score it against their rules with evidence. Shows pass/fail per rule with the specific evidence that triggered each judgment.

The contract specifies `POST /optimize/judge` but the server has no route for it. `judge` is fully implemented.

**Proposed endpoint:**
```
POST /optimize/judge
Body: { instructions, input, response, rules: [{ rule, weight }], threshold, mode }
Response: {
  pass: bool,
  score: number,
  threshold: number,
  ruleResults: [{ rule, pass, score, weight, evidences: string[] }],
  usage
}
```

---

### 3. Generate quality rules from examples

The prerequisite to releasing or judging. A developer provides a few examples of good and bad outputs and the system writes the rules that capture what "correct" means for their function. Without this, users have to hand-write rules before they can score anything.

The contract specifies `POST /optimize/rules` but the server has no route for it. `generateJudgeRules` is fully implemented.

**Proposed endpoint:**
```
POST /optimize/rules
Body: { instructions, examples: [{ id, input, output, label: "good" | "bad" }], context? }
Response: { rules: [{ rule, weight }], usage }
```

---

### 4. Token and cost visibility in run responses

Every run response should include how many tokens were used, which model answered, and the latency. This is table stakes for any developer tool — without it, users can't compare model costs or understand their spend.

The contract specifies `usage` in the run response shape. The server discards it. Every LLM call internally produces this data; it just needs to be threaded up to the HTTP response.

**What the run response should include:**
```json
{
  "result": { ... },
  "usage": {
    "promptTokens": 245,
    "completionTokens": 18,
    "totalTokens": 263,
    "model": "openai/gpt-4o",
    "latencyMs": 820
  }
}
```

---

### 5. Function lifecycle — draft, validate, release

The entire draft → validate → release workflow the server implements is completely absent from the playground contract. A developer should be able to:

- Create a function (`POST /functions`)
- See its draft status and last validation score
- Run test cases against it
- Validate quality and see a score report
- Release it to a stable versioned endpoint (`POST /functions/{id}:release`)
- See version history and roll back

All of this is implemented in the server (`/functions/*` routes from Phase 2). The contract just doesn't describe it, so the UI has no surface to build against.

The contract needs a new `Functions` section covering: create, detail, run, validate, optimize, release, versions, test-cases.

---

## Medium Priority

These exist in the library with no HTTP endpoint. They would improve the instruction-editing experience.

---

### 6. Compare two instruction versions

The "which version is better?" action. A developer edits their instructions and wants to know if the new version outperforms the old one against their test cases — without running the full generate loop. `compare` scores multiple responses against the same rules and returns a ranking.

**Proposed endpoint:**
```
POST /optimize/compare
Body: { instructions, responses: [{ id, text }], rules?, threshold, mode }
Response: {
  ranking: [{ id, score, pass }],
  bestId: string,
  candidates: [{ id, ruleResults: [...] }],
  usage
}
```

---

### 7. Fix instructions from judge feedback

The "fix this" action after a failed judge result. Instead of running the full generate loop, the developer clicks Fix and gets a targeted rewrite in seconds. The response includes an itemized list of every change made and why — good diff material for the UI.

**Proposed endpoint:**
```
POST /optimize/fix
Body: { instructions, judgeFeedback, mode? }
Response: {
  fixedInstructions: string,
  changes: [{ kind: "add" | "rewrite" | "clarify", description }],
  summary: string,
  usage
}
```

---

## Summary

| Gap | Status | Priority |
|-----|--------|----------|
| `POST /optimize/generate` — generate from test cases | In contract, not in server | High |
| `POST /optimize/judge` — score a response | In contract, not in server | High |
| `POST /optimize/rules` — generate rules from examples | In contract, not in server | High |
| `usage` in run responses | In contract, discarded in server | High |
| `POST /functions/*` lifecycle | In server, not in contract | High |
| `POST /optimize/compare` — A/B instructions | In library, no HTTP route or contract entry | Medium |
| `POST /optimize/fix` — fix from feedback | In library, no HTTP route or contract entry | Medium |
