#!/usr/bin/env node
/**
 * Layout lint: enforce canonical folder-based skill content.
 * - No root-level skills/*-instructions.md or skills/*-rules.json.
 * - Every key under skills/ must be skills/<skillId>/<rest> (at least 3 path segments).
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
    console.error("\nCanonical layout: all skill content under skills/<skillId>/ (weak.md, strong.md, ultra.md, rules.json, contract.md, examples/, expected/).");
    process.exit(1);
  }

  console.log("Content layout OK (folder-based keys only).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
