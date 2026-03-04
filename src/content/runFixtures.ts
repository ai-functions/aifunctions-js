/**
 * Run contract-stability fixtures: validate each skill's example outputs against io.output schema.
 * Callable from CLI (scripts/runFixtures.ts) and REST (POST /content/fixtures).
 */
import type { ContentResolver } from "nx-content";
import { getLibraryIndex, type SkillIndexEntry, type RestrictedJsonSchemaObject } from "./libraryIndex.js";
import { validateAgainstSchema } from "../../functions/validate/validateOutput.js";

export type RunFixturesResult = {
  skillId: string;
  exampleIndex: number;
  valid: boolean;
  errors?: string[];
};

export type RunFixturesReport = {
  passed: number;
  failed: number;
  results: RunFixturesResult[];
  ok: boolean;
};

export type RunFixturesOptions = {
  resolver: ContentResolver;
  skillName?: string;
};

export async function runFixtures(options: RunFixturesOptions): Promise<RunFixturesReport> {
  const { resolver, skillName: skillFilter } = options;
  const index = await getLibraryIndex({ resolver, allowMissing: true });
  const results: RunFixturesResult[] = [];

  if (!index.skills?.length) {
    return { passed: 0, failed: 0, results: [], ok: true };
  }

  for (const ref of index.skills) {
    const refKey = (ref as { $refKey?: string }).$refKey;
    if (!refKey) continue;
    let raw: string;
    try {
      raw = await resolver.get(refKey);
    } catch {
      continue;
    }
    const entry = JSON.parse(typeof raw === "string" ? raw : "{}") as SkillIndexEntry;
    const skillId = entry?.id;
    if (!skillId || !entry.io?.output) continue;
    if (skillFilter && skillId !== skillFilter) continue;

    const schema = entry.io.output as RestrictedJsonSchemaObject;
    const examples = entry.examples ?? [];
    if (examples.length === 0) continue;

    for (let i = 0; i < examples.length; i++) {
      const out = examples[i].output;
      const result = validateAgainstSchema(out, schema, `.examples[${i}].output`);
      results.push({
        skillId,
        exampleIndex: i,
        valid: result.valid,
        errors: result.valid ? undefined : result.errors,
      });
    }
  }

  const failed = results.filter((r) => !r.valid);
  const passed = results.filter((r) => r.valid);
  return {
    passed: passed.length,
    failed: failed.length,
    results,
    ok: failed.length === 0,
  };
}
