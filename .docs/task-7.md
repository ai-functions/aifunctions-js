# CR: Content Source Abstraction for `aiFunctions-js` (Inline + Store-Backed Mode)

## Objective

Introduce a unified content-loading abstraction in `aiFunctions-js` that allows function content to be resolved from two supported modes:

1. **`shared-store`** — store-backed mode via HTTP to a compatible `nx-content-store-server`
2. **`inline`** — content provided directly in code

This CR clarifies that **`shared-store` is not limited to the hosted shared service**.
It supports **any compatible store server deployment**, including:

* the hosted shared store
* customer self-hosted deployments

This enables both **managed infrastructure** and **self-managed infrastructure** without changing the runtime architecture.

---

# Scope

## 1. Introduce a Content Provider Abstraction

Add an internal abstraction that is responsible for resolving function content regardless of the underlying storage.

```ts
export interface FunctionContentProvider {
  getFunctionContent(input: GetFunctionContentInput): Promise<ResolvedFunctionContent>;
  hasFunction?(input: HasFunctionInput): Promise<boolean>;
  listFunctions?(input?: ListFunctionsInput): Promise<string[]>;
}
```

This interface becomes the **single entry point** for resolving function content inside `aiFunctions-js`.

All runtime execution must obtain content through this provider.

---

# 2. Supported Content Modes

The system supports **exactly two modes**.

## Mode 1 — `shared-store`

A **store-backed mode** that loads content through the `nx-content-store` client by calling a compatible `nx-content-store-server` deployment.

This includes:

* the hosted shared store service
* a customer self-hosted compatible deployment

In this mode the library **does not access storage directly**.
It only communicates with the store server via HTTP.

### Behavior

* Uses `nx-content-store` client
* Retrieves function content using canonical keys
* Normalizes content into runtime format

### Important clarification

`shared-store` refers to **any compatible store server endpoint**, not only the hosted shared service.

---

## Mode 2 — `inline`

Content is provided directly in code and passed to `aiFunctions-js` during initialization.

No external store is used.

Typical use cases:

* local experimentation
* embedded applications
* simple deployments without store infrastructure

---

# 3. Provider Implementations

Two implementations must be created.

### `SharedStoreContentProvider`

Responsible for resolving function content via the store server.

Responsibilities:

* use `nx-content-store` client
* fetch canonical function content files
* parse structured content
* normalize output

---

### `InlineContentProvider`

Responsible for resolving function content from runtime configuration.

Responsibilities:

* load inline definitions
* validate definitions
* normalize output

---

# 4. Provider Factory

Introduce a factory responsible for selecting the correct provider.

```ts
createFunctionContentProvider(config: AiFunctionsContentConfig): FunctionContentProvider
```

Provider selection is determined by the configured mode.

---

# 5. Normalized Runtime Content Model

All providers must normalize to a common runtime structure.

```ts
export interface ResolvedFunctionContent {
  functionId: string;

  instructions: Partial<
    Record<'strong' | 'weak' | 'ultra', string>
  >;

  rules?: unknown;
  meta?: Record<string, unknown>;
  testCases?: unknown[];

  source: {
    mode: 'shared-store' | 'inline';
    storeId?: string;
    baseUrl?: string;
  };
}
```

The rest of the runtime must consume **only this structure**.

---

# 6. Configuration Model

```ts
export interface AiFunctionsContentConfig {
  mode: 'shared-store' | 'inline';

  sharedStore?: {
    baseUrl?: string;
    storeId?: string;
    publishableKey?: string;
    secretKey?: string;
  };

  inline?: {
    functions: InlineFunctionDefinition[];
  };
}
```

### Clarification for `shared-store`

`sharedStore.baseUrl` may point to:

* the hosted shared service
* **any compatible self-hosted deployment**

`storeId` identifies the logical store within that deployment.

---

# 7. Canonical Store Key Mapping

The store-backed provider must derive canonical keys for function content.

Example:

```
functions/<functionId>/strong
functions/<functionId>/weak
functions/<functionId>/ultra
functions/<functionId>/rules
functions/<functionId>/meta.json
functions/<functionId>/test-cases.json
```

This mapping must exist in a **dedicated helper module** to allow future evolution.

---

# 8. Runtime Integration

All content resolution in `aiFunctions-js` must go through the provider abstraction.

Example:

```ts
const content = await provider.getFunctionContent({
  functionId
});
```

The runtime must **not** directly access:

* files
* Git
* databases
* nx-content
* other storage systems

---

# 9. Typed Error Model

Add structured errors:

* `FunctionContentError`
* `FunctionContentNotFoundError`
* `FunctionContentParseError`
* `FunctionContentConfigError`

These errors are used to represent:

* configuration problems
* missing functions
* malformed content
* provider failures

---

# 10. Test Coverage

Test coverage must include:

### Provider Factory

* correct provider selection

### Inline Provider

* successful content resolution
* missing function behavior
* normalization

### Shared Store Provider

* key resolution
* content loading
* JSON parsing
* normalization

### Runtime Integration

* runtime execution path using the provider abstraction

---

# Non-Goals

This CR does **not** introduce or redesign:

* scopes
* corpus revisions
* evaluation sessions
* apply flows
* profile resolution
* versioning models

These belong to later architectural changes.

---

# Infrastructure Boundary

`aiFunctions-js` **does not connect directly** to:

* Mongo
* xronox
* Git repositories
* `nx-content`

Self-managed infrastructure is supported **only by pointing to a compatible `nx-content-store-server` deployment**.

This keeps the runtime architecture clean and storage-agnostic.

---

# Acceptance Criteria

The CR is complete when:

1. `FunctionContentProvider` abstraction exists
2. Exactly two supported modes exist:

   * `shared-store`
   * `inline`
3. `shared-store` supports **any compatible store server deployment**
4. `SharedStoreContentProvider` uses `nx-content-store`
5. `InlineContentProvider` resolves content from config
6. Both providers produce the same normalized `ResolvedFunctionContent`
7. Runtime code resolves content only through the provider
8. Canonical key mapping exists in a dedicated helper
9. Typed content errors are implemented
10. Unit tests cover providers and factory
11. Documentation clarifies that `shared-store` includes hosted and self-hosted store servers

