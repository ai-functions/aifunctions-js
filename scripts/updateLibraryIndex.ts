#!/usr/bin/env node
/**
 * CLI to regenerate the library index (functions/index.v1.json and per-function files).
 * Uses nx-content resolver and light-skills askJson for LLM indexing.
 *
 * Usage:
 *   npx tsx scripts/updateLibraryIndex.ts [options]
 *
 * Options:
 *   --dry-run       Do not write; print report only.
 *   --static-only   Build index from content only (no LLM). Use for visibility when API is unavailable.
 *   --incremental   Skip functions whose content hash is unchanged.
 *   --force         Overwrite index even if result would be empty/partial.
 *   --prefix=PREFIX Content prefix to list (default: functions/).
 *   --mode=MODE     LLM mode: weak | normal | strong (default: normal).
 *   --model=MODEL   Override model.
 *
 * Prerequisites: .content with functions/ subtree (or set localRoot). OPENROUTER_API_KEY for normal/strong (omit for --static-only).
 */
import { ContentResolver } from "nx-content";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { updateLibraryIndex } from "../src/content/libraryIndex.js";
import { parseUpdateLibraryIndexCliArgs } from "../src/content/updateLibraryIndexCli.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parsed = parseUpdateLibraryIndexCliArgs(args);

  const contentDir = path.join(rootDir, ".content");
  const resolver = new ContentResolver({
    localRoot: contentDir,
    mode: "dev",
  });

  if (!resolver.getContentRoot()) {
    console.error("Content root not available. Ensure .content exists with a functions/ subtree.");
    process.exit(1);
  }

  console.log("Updating library index...");
  console.log(
    "  prefix:", parsed.prefix,
    "| mode:", parsed.mode,
    "| dryRun:", parsed.dryRun,
    "| staticOnly:", parsed.staticOnly,
    "| incremental:", parsed.incremental,
    "| includeBuiltIn:", parsed.includeBuiltIn,
    "| judgeAfterIndex:", parsed.judgeAfterIndex
  );

  const report = await updateLibraryIndex({
    resolver,
    prefix: parsed.prefix,
    mode: parsed.mode,
    model: parsed.model,
    dryRun: parsed.dryRun,
    incremental: parsed.incremental,
    force: parsed.force,
    staticOnly: parsed.staticOnly,
    includeBuiltIn: parsed.includeBuiltIn,
    judgeAfterIndex: parsed.judgeAfterIndex,
  });

  console.log("\nReport:");
  console.log("  generatedAt:", report.generatedAt);
  console.log("  stats:", JSON.stringify(report.stats, null, 2));
  if (report.errors.length) {
    console.log("  errors:");
    report.errors.forEach((e) => console.log("   -", e.skillId, ":", e.reason));
  }
  console.log("  refKeys count:", report.refKeys.length);
  if (parsed.dryRun) console.log("\n(dry-run: no files written)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
