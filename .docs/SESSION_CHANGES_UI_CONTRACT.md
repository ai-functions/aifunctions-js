# Session changes: API, UI contract, and fixes

This document summarizes changes made in this session for the **optimize judge rules** and **race profiles + persistent history** work. It is intended for the UI team and anyone integrating with the API.

**Contract alignment:** The canonical API contract is in [API_CONTRACT.md](./API_CONTRACT.md). Current server vs contract sync status (what matches and what still differs) is in [CONTRACT_SYNC.md](./CONTRACT_SYNC.md). The server returns the standard envelope `{ "ok": true, "data": ... }` / `{ "ok": false, "error": { "code", "message" } }` and uses error code **`NO_RACE_PROFILE`** (422) when run is called with mode best/cheapest/fastest/balanced and no race profile exists.

---

## 1. Summary

- **Optimize judge rules:** New capability to edit existing rules from good/bad examples that include a “why” (rationale). Supports append or replace. Existing “generate rules from examples” flow now accepts optional rationale.
- **Race profiles and history:** Race results can be stored per function; new modes (best/cheapest/fastest/balanced) resolve from stored profiles; temperature races and two new GET endpoints for profiles and race history.
- **Contract:** New endpoints and extended request/response shapes where noted below.

---

## 2. Optimize judge rules

### 2.1 New endpoint: `POST /optimize/rules-optimize`

**Purpose:** Revise existing judge rules using good/bad examples that include a rationale (why each example is good or bad). Supports either merging with existing rules (append) or returning a full replacement set (replace).

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `existingRules` | `Array<{ rule: string; weight: number }>` | No (default `[]`) | Current rules to revise. |
| `examples` | `Array<{ id?, input?, output?, label, rationale? }>` | **Yes** | Good/bad examples. `label`: `"good"` \| `"bad"`. `rationale`: short explanation (recommended). |
| `ruleMode` | `"append"` \| `"replace"` | No (default `"replace"`) | `append` = merge new/updated with existing; `replace` = return full new set. |
| `instructions` | string | No | Extra context for the optimizer. |
| `targetRuleCount` | number | No | Hint for max rules. |
| `weightScale` | `"1-3"` \| `"1-5"` \| `"1-10"` | No | Weight scale for rules. |
| `model` | string | No | Model override. |

**Response:** JSON with:

- `schemaVersion`: `"ai.optimize-judge-rules.v1"`
- `rules`: `Array<{ rule: string; weight: number }>` — revised rules
- `changes` (optional): `{ added: string[]; removed: string[]; modified: Array<{ before: string; after: string }> }`
- `summary`: string
- `usage` (if usage tracking): token/usage info

**UI:** Send good/bad examples with a `rationale` (or `why`) per example when calling this endpoint for better rule quality.

---

### 2.2 Extended: `POST /optimize/rules` (generate rules from examples)

**Contract change:** The `examples` array items may now include an optional **`rationale`** (or “why”) field.

- **Before:** `examples: Array<{ id?, input?, output?, label? }>`
- **After:** `examples: Array<{ id?, input?, output?, label?, rationale? }>`

When present, `rationale` is included in the synthesized instructions so the model sees why each example is good or bad. This improves generated rules.

**UI:** Optional: add a “Why is this good/bad?” field per example and send it as `rationale`.

---

### 2.3 Methodology (documentation)

- When providing good/bad examples (for rules generation or rules optimization), include a **brief rationale** (why it’s good or bad) when possible.
- This is documented in the README and reflected in the new optimize-rules flow.

---

## 3. Race: profiles, history, and new modes

### 3.1 Extended: `POST /race/models`

**New request fields (all optional):**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `functionKey` | string | — | Skill/function id. When set, race result is stored under this key and winner profiles can be written. |
| `applyDefaults` | boolean | `true` | If `true`, after the race the winner profiles (best/cheapest/fastest/balanced) and defaults are written for `functionKey`. If `false`, only the race record is appended to history. |
| `raceLabel` | string | — | Label for this run (e.g. “March tuning”). Stored in the race record. |
| `notes` | string | — | Free-form notes. Stored in the race record. |
| `type` | `"model"` \| `"temperature"` | `"model"` | Race type (see below). |
| `model` | string | — | For `type: "temperature"`: single model to run at different temperatures. |
| `temperatures` | number[] | — | For `type: "temperature"`: list of temperatures to compare (e.g. `[0, 0.3, 0.7]`). One value = single run + optional maxTokens default. |

**Behavior when `functionKey` is set:**

- If `functionKey` is provided and skill/instructions are not fully provided in the body, the server can load instructions and rules from content for that key.
- After the race completes, a **race record** is appended to history for that function.
- If `applyDefaults === true`, **profiles** (best/cheapest/fastest/balanced) and optionally **defaults** (e.g. `maxTokens` for temperature run with one temp) are written.

**Temperature race (`type: "temperature"`):**

- Send `type: "temperature"`, `model`, and `temperatures` (and `functionKey`, `testCases`, etc. as needed).
- Same model is run at each temperature; results are ranked and stored as a temperature race.
- If `temperatures.length === 1` and `applyDefaults` is true, a default `maxTokens` is set for that function.

**UI:** To persist races and use profile modes later, always send `functionKey` (and optionally `raceLabel`, `notes`). Use `applyDefaults: false` to record a race without changing current profiles.

---

### 3.2 New endpoint: `GET /functions/:id/profiles`

**Purpose:** Return the current race winner profiles and defaults for a function (for use when calling run with mode best/cheapest/fastest/balanced).

**Response:** JSON:

```json
{
  "defaults": { "maxTokens": 2048 } | null,
  "profiles": {
    "best":     { "model": "...", "temperature": 0.2, "maxTokens": 900 },
    "cheapest": { "model": "...", "temperature": 0,   "maxTokens": 700 },
    "fastest":  { "model": "...", "temperature": 0.3, "maxTokens": 800 },
    "balanced": { "model": "...", "temperature": 0.2, "maxTokens": 800 }
  } | null
}
```

If no race has been run (or no profiles stored), `profiles` and/or `defaults` may be `null`.

**UI:** Use this to show which model/settings are active for “best”, “cheapest”, etc., or to show “Run a race first” when `profiles` is null.

---

### 3.3 New endpoint: `GET /functions/:id/race-report`

**Purpose:** Return race history for a function.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `last` | number | Return only the last N races. |
| `since` | string (ISO date) | Return only races run at or after this time. |
| `raceId` | string | Return only the race with this id. |

**Response:** JSON:

```json
{
  "races": [
    {
      "raceId": "...",
      "type": "model" | "temperature",
      "label": "...",
      "notes": "...",
      "applyDefaults": true,
      "candidates": { ... },
      "attempts": [ { "modelId", "avgScoreNormalized", "passRate", "avgLostPoints", ... } ],
      "winners": { "best": "...", "cheapest": "...", "fastest": "...", "balanced": "..." },
      "runAt": "2026-03-05T...",
      "summary": "..."
    }
  ]
}
```

**UI:** Use for a “Race history” view or to show the exact attempts and winners for a given run.

---

### 3.4 Run with profile modes: `POST /functions/:id/run` (or `POST /run` with skill in body)

**Contract change:** The `mode` field for a **content** skill (e.g. run via function key or skill name from content) may now be one of:

- `"best"`
- `"cheapest"`
- `"fastest"`
- `"balanced"`

**Behavior:**

- For these modes, the server resolves the actual model, temperature, and maxTokens from the **stored profiles** for that function (from the last race with `applyDefaults: true`).
- If there is no profile for the requested mode, the server returns an **actionable error**, e.g.:  
  `No race profile for mode "best" on function "mySkill". Run a race first (POST /race/models with functionKey) to set winner profiles.`

**UI:**

- In the run form, allow selecting mode: weak / normal / strong / **best** / **cheapest** / **fastest** / **balanced** for functions that support it.
- If the user picks best/cheapest/fastest/balanced and the server returns the error above, show a short message and a link or hint to run a race (e.g. “Run a race for this function first to use this mode”).

---

## 4. Contract summary (for UI)

| Area | Change |
|------|--------|
| **POST /optimize/rules** | Request: `examples[].rationale` optional. |
| **POST /optimize/rules-optimize** | **New.** Request: `existingRules`, `examples`, `ruleMode`, optional `instructions`, `targetRuleCount`, `weightScale`, `model`. Response: `rules`, `changes?`, `summary`, `usage?`. |
| **POST /race/models** | Request: `functionKey?`, `applyDefaults?` (default true), `raceLabel?`, `notes?`, `type?` (`"model"` \| `"temperature"`), `model?`, `temperatures?`. Race result and optional profiles/defaults persisted when `functionKey` is set. |
| **GET /functions/:id/profiles** | **New.** Response: `defaults`, `profiles` (best/cheapest/fastest/balanced). |
| **GET /functions/:id/race-report** | **New.** Query: `last?`, `since?`, `raceId?`. Response: `races[]`. |
| **Run (content skills)** | Request: `mode` may be `"best"` \| `"cheapest"` \| `"fastest"` \| `"balanced"`. Server uses stored profiles; error if profile missing. |

---

## 5. Storage (for reference)

- **Profiles and defaults:** `skills/<functionId>/race-config.json` (defaults + profiles object).
- **Race history:** `skills/<functionId>/races.json` (append-only array of race records, capped at 200).
- These paths are used by the content resolver; the UI does not call them directly but can rely on the GET endpoints above.

---

## 6. Fixes and implementation notes

- **optimizeJudgeRules:** Prompt uses `ruleMode` (append/replace), not `mode`, so the correct field is sent to the model.
- **Rules from examples:** `synthesizeInstructionsFromExamples` and the rules handler accept and render `rationale` so the model sees “Why good” / “Why bad”.
- **Race persistence:** `getSkillRules` is imported and used when building the race request from `functionKey` and when loading skill for a temperature race.
- **Race attempts typing:** Per-test judge result (e.g. `pass`) is correctly typed when computing passRate in the race handler.
- **Profile modes in run:** When `mode` is best/cheapest/fastest/balanced, the executor is called with explicit `model`, `temperature`, `maxTokens` from the profile; `callAI` and `executeSkill` support these overrides so no preset is used.

---

*Document generated from session changes. If the API or storage layout changes, this doc should be updated accordingly.*
