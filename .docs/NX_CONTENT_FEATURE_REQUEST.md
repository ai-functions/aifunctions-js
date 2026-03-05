# nx-content feature request

This document describes features we need from **nx-content** when using it as the content backend for skill instructions and rules (e.g. in light-skills / nx-ai-api). It can be used as a feature-request spec or checklist for nx-content.

**Status:** The version and key–path features below have been **closed** in nx-content. This repo uses them via `getSkillInstructionVersions`, `getSkillInstructionsAtRef`, `setSkillInstructionsActiveVersion` (and the rules equivalents) in `src/content/skillsResolver.ts`.

---

## What we use today (thank you)

We rely on the following and they work well:

| Feature | Usage |
|--------|--------|
| **ContentResolver** | `new ContentResolver(config)` with `localRoot`, `gitRepoUrl`, `gitBranch`, `gitToken`, `mode`, `cacheTtlMs`. |
| **get(key)** | Async get of raw content by key (string). We use for instructions and JSON rules. |
| **set(key, content)** | Write content by key. We use after local edits or optimization. |
| **listKeys(prefix)** | List keys under a prefix (e.g. `"skills/"`). We use to discover skill names from the repo. |
| **resolveInstructions(key)** | Returns `{ text }` for instruction content. We use for mode-based instruction keys. |
| **getContentRoot()** | Local path when using a local backend. We use to ensure repo exists and for scripts. |
| **pushToRemote(options)** | Commit and push (e.g. `{ message }`). Returns `{ pushed, commitHash?, noChanges? }`. We use after syncing/optimizing content. |
| **normalizeKeySegment** | Sanitize key segments. We use when building keys like `skills/<segment>-instructions.md`. |

---

## Features we need

### 1. Version history (list versions for a key)

**Need:** List git history for the file that backs a given key, so users can “see all versions” and choose an active one.

**Proposed API (or equivalent):**

- `resolver.getVersions(key: string): Promise<VersionEntry[]>`  
  Where `VersionEntry` is e.g. `{ sha: string; message: string; date: string; author?: string }`.

**Notes:**

- We assume each key maps to one file path under the content root (see Key–path contract below).
- Implementation can run `git log -- <path>` under the hood when a local repo is available.

---

### 2. Get content at a specific version (ref)

**Need:** Read content at a given git ref (commit sha, tag, or branch) without changing the working tree. Used for “view this version” and for comparing versions.

**Proposed API:**

- `resolver.getAtRef(key: string, ref: string): Promise<string>`  
  Returns the raw content of the file backing `key` at git ref `ref` (e.g. `"abc123"`, `"v1.0"`, `"main"`).

**Notes:**

- Implementation can use `git show ref:path` (or equivalent) for the path that corresponds to `key`.
- If the file did not exist at that ref, reject or return a clear “not found” (e.g. throw or return `null` and document behavior).

---

### 3. Set “active” version (checkout file at ref)

**Need:** Make the current content for a key equal to what it was at a given ref (e.g. “roll back to that version” or “make this the active one”). This should only update the working tree (and optionally commit), not force-push.

**Proposed API:**

- `resolver.setActiveVersion(key: string, ref: string, options?: { commit?: boolean; message?: string }): Promise<{ updated: boolean }>`  
  - Resolve `key` to path, run `git checkout <ref> -- <path>` (or equivalent) so the file on disk matches that version.  
  - If `options.commit === true`, stage and commit that file (e.g. “Restore skills/foo-instructions.md to abc123”).  
  - Return `{ updated: true }` when the file was changed (or committed).

**Notes:**

- We do not need this to push; we already call `pushToRemote()` separately when we want to publish.

---

### 4. Key–path contract (documented or first-class)

**Need:** A clear, stable contract for how **keys** map to **file paths** under the content root, so we can:

- Implement version/ref features ourselves if they are not in nx-content (e.g. using `simple-git` and the content root).
- Avoid breaking when nx-content changes internal path layout.

**Proposed:**

- **Document:** “Key `K` corresponds to path `P` under the content root, where `P = K` (key as relative path) or `P = keyToPath(K)`.”
- **Optional API:**  
  - `resolver.getPathForKey(key: string): string | null`  
  - Or `resolver.keyToPath(key: string): string`  
  So consumers can run git commands on the path when needed.

**Our assumption today:** Key `skills/foo-instructions.md` → path `skills/foo-instructions.md` under content root. We’d like this (or the real rule) written down.

---

### 5. Optional: pushToRemote options

We currently pass `{ message }` and use `commitHash` and `noChanges` from the result. If you add more options, these would be useful:

- **branch** – Push to a specific branch (we already have `gitBranch` in config; override at push time could be useful).
- **dryRun** – Don’t push, only commit locally (or only report what would be committed).
- **paths** – Limit commit to specific keys/paths (e.g. only commit `skills/`).

Not blocking; the current API is enough for us.

---

## Summary table

| # | Feature | Priority | Notes |
|---|---------|----------|--------|
| 1 | List versions for a key (`getVersions(key)`) | High | Enables “see all versions” in UIs and scripts. |
| 2 | Get content at ref (`getAtRef(key, ref)`) | High | View/compare any version. |
| 3 | Set active version (`setActiveVersion(key, ref, options?)`) | High | “Use this version” / rollback without manual git. |
| 4 | Key–path contract (docs or `getPathForKey` / `keyToPath`) | Medium | Lets us implement 1–3 ourselves if needed. |
| 5 | pushToRemote extras (branch, dryRun, paths) | Low | Nice to have. |

---

## Consumer context

- **Repo:** light-skills / nx-ai-api (skills API with content-backed instructions and rules).
- **Content layout:** Keys like `skills/<name>-instructions.md` and `skills/<name>-rules.json`; we also use legacy keys `skills/<name>/weak`, `skills/<name>/normal`, `skills/<name>/rules`.
- **Workflow:** Clone content repo into `.content`, read/write via ContentResolver, run tests/optimization, then `pushToRemote()` to publish. We want to add “get/update instructions and rules, list versions, choose active version” on top of this.

If you maintain nx-content and want to discuss or prioritize, we can refine this (e.g. naming, return shapes, or splitting into issues). Thanks for providing the current API.
