/**
 * Layout lint: enforce canonical folder-based function content under functions/.
 * No root-level *-instructions.md / *-rules.json.
 * Callable from CLI (scripts/lintContentLayout.ts) and REST (POST /content/layout-lint).
 */
import type { ContentResolver } from "nx-content";

const CONTENT_PREFIX = "functions/";
const FORBIDDEN_ROOT_PATTERN = /^functions\/[^/]+-(?:instructions\.md|rules\.json)$/;

export type LayoutLintReport = {
  ok: boolean;
  errors: string[];
};

export async function runLayoutLint(resolver: ContentResolver): Promise<LayoutLintReport> {
  const errors: string[] = [];
  let keys: string[];
  try {
    keys = await resolver.listKeys(CONTENT_PREFIX);
  } catch (e) {
    return { ok: false, errors: [`Failed to list ${CONTENT_PREFIX}: ${e instanceof Error ? e.message : String(e)}`] };
  }

  for (const key of keys) {
    const normalized = key.replace(/\\/g, "/").trim();
    if (!normalized.startsWith(CONTENT_PREFIX)) continue;
    const parts = normalized.slice(CONTENT_PREFIX.length).split("/").filter(Boolean);
    if (FORBIDDEN_ROOT_PATTERN.test(normalized)) {
      errors.push(`Forbidden root-level key (use folder-based): ${normalized}`);
    } else if (parts.length === 1) {
      errors.push(`Key must be under a function folder (functions/<id>/...): ${normalized}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
