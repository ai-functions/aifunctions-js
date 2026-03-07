#!/usr/bin/env node
/**
 * Run contract-stability fixtures: validate each skill's example outputs against its io.output schema.
 * Ensures stored expected outputs still match the skill contract (safe to run in CI without API keys).
 *
 * Usage:
 *   npx tsx scripts/runFixtures.ts [--skill=id]
 *
 * Options:
 *   --skill=ID   Run only this skill's fixtures (default: all skills with examples).
 *
 * Prerequisites: .content with functions/ and a built library index (functions/index.v1.json).
 * Run after build if you use dist: npm run build && npx tsx scripts/runFixtures.ts
 */
import { getSkillsResolver } from "../src/index.js";
import { runFixtures } from "../src/content/runFixtures.js";

function parseArg(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.split("=")[1]?.trim() : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const skillFilter = parseArg(args, "skill");

  const resolver = getSkillsResolver();
  const contentRoot = resolver.getContentRoot?.();
  if (!contentRoot) {
    console.error("Content root not available. Ensure .content exists and resolver is configured.");
    process.exit(1);
  }

  const report = await runFixtures({ resolver, skillName: skillFilter });

  if (report.results.length === 0 && report.passed === 0 && report.failed === 0) {
    console.log("No skills in library index. Run content:index (or updateLibraryIndex) first.");
    process.exit(0);
  }

  for (const r of report.results) {
    const label = r.valid ? "PASS" : "FAIL";
    const msg = r.valid
      ? `${r.skillId} example[${r.exampleIndex}]`
      : `${r.skillId} example[${r.exampleIndex}]: ${(r.errors ?? []).join("; ")}`;
    console.log(`${label} ${msg}`);
  }

  console.log("");
  console.log(`Total: ${report.passed} passed, ${report.failed} failed`);

  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
