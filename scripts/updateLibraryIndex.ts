#!/usr/bin/env node
/**
 * CLI to regenerate the skills library index (skills/index.v1.json and per-skill files).
 * Uses nx-content resolver and light-skills askJson for LLM indexing.
 *
 * Usage:
 *   npx tsx scripts/updateLibraryIndex.ts [options]
 *
 * Options:
 *   --dry-run       Do not write; print report only.
 *   --incremental   Skip skills whose content hash is unchanged.
 *   --force         Overwrite index even if result would be empty/partial.
 *   --prefix=PREFIX Content prefix to list (default: skills/).
 *   --mode=MODE     LLM mode: weak | normal | strong (default: normal).
 *   --model=MODEL   Override model.
 *
 * Prerequisites: .content with skills/ subtree (or set localRoot). OPENROUTER_API_KEY for normal/strong.
 */
import { ContentResolver } from "nx-content";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { updateLibraryIndex } from "../src/content/libraryIndex.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function parseArg(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.split("=")[1]?.trim() : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const incremental = args.includes("--incremental");
  const force = args.includes("--force");
  const prefix = parseArg(args, "prefix") ?? "skills/";
  const mode = (parseArg(args, "mode") ?? "normal") as "weak" | "normal" | "strong";
  const model = parseArg(args, "model");

  const contentDir = path.join(rootDir, ".content");
  const resolver = new ContentResolver({
    localRoot: contentDir,
    mode: "dev",
  });

  if (!resolver.getContentRoot()) {
    console.error("Content root not available. Ensure .content exists with a skills/ subtree.");
    process.exit(1);
  }

  console.log("Updating library index...");
  console.log("  prefix:", prefix, "| mode:", mode, "| dryRun:", dryRun, "| incremental:", incremental);

  const report = await updateLibraryIndex({
    resolver,
    prefix,
    mode,
    model,
    dryRun,
    incremental,
    force,
  });

  console.log("\nReport:");
  console.log("  generatedAt:", report.generatedAt);
  console.log("  stats:", JSON.stringify(report.stats, null, 2));
  if (report.errors.length) {
    console.log("  errors:");
    report.errors.forEach((e) => console.log("   -", e.skillId, ":", e.reason));
  }
  console.log("  refKeys count:", report.refKeys.length);
  if (dryRun) console.log("\n(dry-run: no files written)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
