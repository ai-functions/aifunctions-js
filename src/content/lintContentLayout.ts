/**
 * Layout lint: enforce canonical folder-based skill content. No root-level *-instructions.md / *-rules.json.
 * Callable from CLI (scripts/lintContentLayout.ts) and REST (POST /content/layout-lint).
 */
import type { ContentResolver } from "nx-content";

const FORBIDDEN_ROOT_PATTERN = /^skills\/[^/]+-(?:instructions\.md|rules\.json)$/;

export type LayoutLintReport = {
  ok: boolean;
  errors: string[];
};

export async function runLayoutLint(resolver: ContentResolver): Promise<LayoutLintReport> {
  const errors: string[] = [];
  let keys: string[];
  try {
    keys = await resolver.listKeys("skills/");
  } catch (e) {
    return { ok: false, errors: [`Failed to list skills/: ${e instanceof Error ? e.message : String(e)}`] };
  }

  for (const key of keys) {
    const normalized = key.replace(/\\/g, "/").trim();
    if (!normalized.startsWith("skills/")) continue;
    const parts = normalized.slice("skills/".length).split("/").filter(Boolean);
    if (FORBIDDEN_ROOT_PATTERN.test(normalized)) {
      errors.push(`Forbidden root-level key (use folder-based): ${normalized}`);
    } else if (parts.length === 1) {
      errors.push(`Key must be under a skill folder (skills/<id>/...): ${normalized}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
