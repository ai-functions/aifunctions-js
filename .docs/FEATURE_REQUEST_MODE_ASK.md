# Feature request: `mode` in low-level `ask()` and configurable strong/normal model

**Target:** aifunctions-js (this repo / light-skills)  
**Type:** Feature request  
**Date:** 2026-03-04  
**Implemented:** 2026-03-05

This document maps the feature request to the current implementation and lists **covered** vs **gaps**.

---

## Summary

| Requested item | Status | Notes |
|----------------|--------|--------|
| **1. Configurable strong (and normal) model** | ✅ Done | Env `LLM_MODEL_STRONG` / `LLM_MODEL_NORMAL` (and `AI_MODEL_*`). Client config `createClient({ models: { normal, strong } })`. Resolution: opts.model → client config → env → preset. |
| **2. `mode` in low-level `ask()` options** | ✅ Done | `AskOptions.mode` added. OpenRouter (and llama-cpp, transformersjs) resolve model/temperature/maxTokens from mode when set; explicit opts override. |

---

## Implemented (2026-03-05)

- **AskOptions:** `mode?: LlmMode` added. When set, backends resolve model (OpenRouter), temperature, and maxTokens from client config → env → `getModePreset(mode)`. Explicit `opts.model` / `opts.temperature` / `opts.maxTokens` override.
- **CreateClientOptions (openrouter):** `models?: { normal?: string; strong?: string }` added. Used when resolving model for `opts.mode`.
- **Env:** `getModelOverrides()` in `src/env.ts` reads `LLM_MODEL_NORMAL`, `LLM_MODEL_STRONG` (and `AI_MODEL_NORMAL`, `AI_MODEL_STRONG`). Applied when resolving model for `ask(..., { mode })`.
- **OpenRouter:** `ask()` and `askStream()` use `resolveOpts(opts)` so `ask(instruction, { mode: "strong", maxTokens: 500 })` works without passing `model`. Error message when neither model nor mode: suggest `opts.mode` or env.
- **llama-cpp / transformersjs:** When `opts.mode` is set, temperature and maxTokens come from `resolveOptionsFromMode(opts)` so preset applies.
- **Exports:** `resolveOptionsFromMode`, `ResolvedAskOptions` exported from main index.

---

## Gap 1: Configurable strong (and normal) model

**Requested:** A single place to configure which model is used for `mode: "strong"` and `mode: "normal"` (e.g. env `LLM_MODEL_STRONG` / `LLM_MODEL_NORMAL`, or `createClient({ models: { normal: "...", strong: "..." } })`).

**Current:** `getModePreset()` in `src/core/modePreset.ts` returns fixed strings: normal → `"gpt-5-nano"`, strong/ultra → `"gpt-5.2"`. No env or client config is read for these. Callers (e.g. xmemory-records-mapper) that want a deployer-configurable strong model must implement their own env and pass `model` on every `ask()`.

**Needed:** Either or both of:
- Env: `LLM_MODEL_STRONG`, `LLM_MODEL_NORMAL` (or `AI_MODEL_*`) — when set, presets use these instead of built-in defaults.
- Client config: `createClient({ backend: "openrouter", models: { normal: "...", strong: "..." } })`. Env could override when present.

---

## Gap 2: `mode` in low-level `ask()` options

**Requested:** Extend `AskOptions` with optional `mode?: "weak" | "normal" | "strong" | "ultra"`. When `mode` is set, the client resolves **model** (and optionally temperature / maxTokens) from configured models or `getModePreset(mode)`. Explicit `opts.model` overrides for that call.

**Current:**
- `AskOptions` in `src/core/types.ts` has: `maxTokens`, `temperature`, `model?`, `vendor?`, `system?`, `timeoutMs?` — **no `mode`**.
- OpenRouter client in `src/backends/openrouter.ts` does `const model = opts.model; if (!model) throw ...`. So raw `client.ask(instruction, opts)` **must** receive `model`; there is no way to pass `mode` and have the client resolve it.

**Needed:**
- Add `mode?: LlmMode` to `AskOptions`.
- In each backend’s `ask()` (at least OpenRouter): if `opts.mode` is set and `opts.model` is not, resolve model (and optionally temperature/maxTokens) from client-level config or `getModePreset(opts.mode)`. If `opts.model` is set, use it (ignore preset model for that call).

Result: one client can serve both tiers with `ask(instruction, { mode: "normal" })` vs `ask(instruction, { mode: "strong" })`, and the strong/normal model can be set once via env or client config.

---

## References in this repo

- Modes and presets: `src/core/modePreset.ts`, `src/core/types.ts` (`LlmMode`).
- High-level usage of `mode`: `functions/callAI.ts`, `functions/askJson.ts`, `functions/runJsonCompletion.ts`, judge/orchestration functions.
- Low-level `ask()`: `src/core/types.ts` (`AskOptions`), `src/backends/openrouter.ts` (requires `opts.model`).
- Env: `src/env.ts` (no model env vars).

---

## Impact on playground / HTTP contract

**No change.** The contract with the playground UI is the **HTTP API**: endpoints (e.g. `POST /run`, `POST /optimize/judge`) and their request/response body shapes. The server already accepts `mode` (and optional `model`) in request bodies and passes them into high-level library functions. Implementing this feature request only affects:

- **Library:** `AskOptions` and client creation (programmatic API).
- **Server config:** How the server builds the client (env or `createClient` options). Request/response shapes stay the same; the playground keeps sending `mode` (and optionally `model`) in the body and gets the same response shapes.
