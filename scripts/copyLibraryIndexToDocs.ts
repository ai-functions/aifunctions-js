#!/usr/bin/env node
/**
 * Copy the built library index from .content to .docs as fallback.
 * Run after: npm run content:index
 * Usage: npx tsx scripts/copyLibraryIndexToDocs.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, ".content", "functions", "index.v1.json");
const destDir = path.join(root, ".docs");
const dest = path.join(destDir, "library-index.fallback.json");

try {
  const data = readFileSync(src, "utf-8");
  const parsed = JSON.parse(data);
  if (typeof parsed.schemaVersion !== "string" || !Array.isArray(parsed.skills)) {
    throw new Error("Invalid index shape");
  }
  mkdirSync(destDir, { recursive: true });
  writeFileSync(dest, JSON.stringify(parsed, null, 2), "utf-8");
  console.log("Copied", src, "->", dest);
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  if (err?.code === "ENOENT") {
    console.log("No index at", src, "- run npm run content:index first. Fallback unchanged.");
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
}
