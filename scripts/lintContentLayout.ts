#!/usr/bin/env node
/**
 * Layout lint: enforce canonical folder-based function content under functions/.
 * - No root-level functions/*-instructions.md or functions/*-rules.json.
 * - Every key under functions/ must be functions/<functionId>/<rest> (at least 3 path segments).
 *
 * Usage: npx tsx scripts/lintContentLayout.ts
 * Exits 0 if layout is valid, 1 with messages if invalid.
 */
import { getSkillsResolver } from "../src/index.js";
import { runLayoutLint } from "../src/content/lintContentLayout.js";

async function main(): Promise<void> {
  const resolver = getSkillsResolver();
  const contentRoot = resolver.getContentRoot?.();
  if (!contentRoot) {
    console.error("Content root not available. Ensure .content exists.");
    process.exit(1);
  }

  const report = await runLayoutLint(resolver);

  if (!report.ok) {
    console.error("Content layout lint failed:\n");
    report.errors.forEach((e) => console.error("  -", e));
    console.error("\nCanonical layout: all function content under functions/<functionId>/ (weak, strong, ultra, rules, test-cases.json, meta.json).");
    process.exit(1);
  }

  console.log("Content layout OK (folder-based keys only).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
