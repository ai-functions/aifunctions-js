# Deferred Items

This document lists features and directions that were explicitly considered during product design and deliberately left out of the roadmap. Each item has a reason. "Deferred" does not mean "never" — it means the cost/benefit ratio is wrong for now, or the dependency isn't ready.

---

## UI / Dashboard

**What it would be:** A web interface for creating functions, running test cases, viewing scores, and monitoring calls.

**Why deferred:** The product is a developer API. Developers integrate via HTTP endpoints and SDK snippets, not a dashboard. Building UI before the API surface is stable wastes the effort — the UI would need to be rebuilt every time a route or response shape changes. The correct order is: stable API → auto-generate OpenAPI spec → build UI on top of the spec. Adding a dashboard before the API is validated is building in the wrong direction.

---

## SDK generation

**What it would be:** Typed client libraries (TypeScript, Python, etc.) generated from the OpenAPI spec, published to npm/PyPI.

**Why deferred:** SDKs must track the API surface. If the API surface changes (which it will during Phase 1 and 2), every SDK change requires a new publish, version bump, and migration path for any early adopters. The correct time to generate and publish SDKs is after the `POST /functions`, `:run`, `:validate`, and `:release` endpoints have been stable for at least one real-world usage cycle. Generating them now creates maintenance overhead with no real users to benefit.

---

## Webhooks on long-running jobs

**What it would be:** `POST` callbacks to a developer-supplied URL when a job (optimize batch, race models, content sync) completes or fails, instead of requiring the developer to poll `GET /jobs/:id`.

**Why deferred:** Polling `GET /jobs/:id` is sufficient for the current job types and durations. Webhooks add delivery guarantees, retry logic, signature verification, and endpoint registration — each of which is a meaningful piece of infrastructure. The value only becomes clear when jobs are common and long (> 30 seconds regularly). At launch, optimize batch and race models are infrequent operations. Polling is a fine DX for now.

---

## Custom model hosting / own inference layer

**What it would be:** Running LLM inference on owned hardware or a managed GPU cluster instead of routing through OpenRouter.

**Why deferred:** OpenRouter already exposes 200+ models (GPT-4o, Claude, Llama, Mistral, Gemini, etc.) under a single unified API. The `createClient` abstraction in `src/index.ts` already supports `llama-cpp` and `transformers.js` for local inference. There is no gap that custom hosting solves at this stage. Running inference is operationally expensive, requires GPU provisioning, and adds latency from cold starts. The right time to consider owned inference is when OpenRouter's pricing or reliability becomes a constraint at scale — not before.

---

## Per-org isolated git repositories (Option B namespace)

**What it would be:** One dedicated git repository per organization for skill/function storage, instead of namespaced paths within a shared repo.

**Why deferred:** Per-org repos provide stronger isolation (no shared git history, separate access tokens, independent branch strategies) but require dynamic repo provisioning, per-org token management, and more complex resolver configuration. The simpler approach — org-namespaced keys within one repo (`orgs/<orgId>/skills/<id>/...`) — provides adequate isolation for the launch phase. Per-org repos become relevant when enterprise customers require data isolation guarantees, separate audit logs, or bring-your-own-git. That is a Phase 3+ concern.

---

## Prompt-only autonomy (no examples, no rules)

**What it would be:** A mode where a developer provides only a description or seed prompt and the system generates, deploys, and guarantees a production-ready function with no human-provided ground truth.

**Why not included:** Autonomy requires a signal to measure success against. Without examples or rules, the system has no way to know if the output is correct — only that it is syntactically valid JSON. The `generateInstructions` loop can run without examples by using a model-judge, but a model judging its own output without any anchor is not a reliable quality signal. The honest position is:

- **Prompt-only** → callable in 1 minute, but not provably aligned
- **Prompt + examples/rules** → callable in 1 minute, production-ready after one optimization cycle

The product surfaces both modes but does not claim the first is production-ready. Draft mode (no examples) is deliberately lower-trust than released mode (score-gated).

---

## LangChain / LangServe as a dependency

**What it would be:** Using LangChain's abstractions (chains, agents, tools) or LangServe (chain-to-REST) as the underlying execution layer.

**Why not included:** LangChain solves a different problem. It gives you plumbing: routing between models, chaining calls, tool dispatch. It does not give you a built-in eval harness, a per-function test suite, an optimization loop that writes and rewrites instructions until a score threshold is met, or a skills library with versioned contracts. This project already has all of those things in the library layer. Adding LangChain would replace well-understood, minimal code (`src/backends/openrouter.ts`, `askJson`, `runJsonCompletion`) with a large dependency that solves problems that aren't the constraint here. The constraint is quality guarantees and developer ergonomics — not model routing.

---

## Scheduled revalidation / nightly regression

**What it would be:** An automated job that runs `validateFunction` on all released functions on a schedule (nightly, weekly), alerts on regressions, and optionally triggers re-optimization.

**Why deferred:** This is a paid-tier feature that requires durable job scheduling infrastructure (Phase 3) and a functioning validate endpoint (Phase 2.4) to be meaningful. Building it before both are stable produces something that can't be reliably operated. It is listed as a paid tier feature in the product plan and should be implemented after Phase 3 is stable and there are released functions to revalidate.

---

## `content:sync` CLI as the primary developer workflow

**What it is today:** The main way to create or update a skill's instructions is by running `npm run content:sync` from the developer's machine. This writes instruction files to the git content store and pushes to the remote.

**Why it is being superseded:** A CLI on the developer's machine is not a product API. It requires cloning the repo, configuring tokens, running Node scripts, and understanding the content store layout. It is an internal build tool, appropriate for library maintainers. For a hosted product where developers create functions via `POST /functions`, the CLI becomes an escape hatch (advanced use, CI pipelines) rather than the primary path. The Phase 2 API surface replaces it as the developer-facing workflow.

---

## Automatic OpenAPI spec generation

**What it would be:** A `GET /openapi.json` endpoint that serves a generated OpenAPI 3.x specification for all routes, enabling auto-generated documentation, SDK generation, and Postman imports.

**Why deferred:** The API surface must be stable first. Generating and publishing an OpenAPI spec before the routes are finalized creates a versioning problem: every breaking change to a route requires a spec update and re-generation of any downstream artifacts (SDKs, docs). The correct time is after Phase 2 is complete and the `functions/*` routes have been validated with real developer usage. At that point, generating the spec is straightforward from the existing handler signatures and types.

---

## Team RBAC (role-based access control)

**What it would be:** Multiple API keys per organization with scoped permissions (read-only, deploy, admin), team member management, audit logs per action.

**Why deferred:** RBAC requires the per-user key registry (Phase 3.1) and per-org namespace (Phase 3.2) to exist first. Without those, there are no "users" or "orgs" to assign roles to. RBAC is also a paid-tier feature — it solves a problem (multiple people on a team with different permissions) that only exists when teams exist. The correct time to build it is after Phase 3.1 and 3.2 are stable and there are actual paying teams using the platform.
