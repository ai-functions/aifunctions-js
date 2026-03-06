#!/usr/bin/env node
/**
 * Build a FULL library snapshot in .docs with embedded source content.
 * Run after index generation (content:index or content:index:static).
 */
import { ContentResolver } from "nx-content";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFullLibrarySnapshot,
  writeFullLibrarySnapshot,
  DEFAULT_FULL_LIBRARY_DOCS_PATH,
} from "../src/content/fullLibrarySnapshot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const contentDir = path.join(root, ".content");
const outPath = path.join(root, DEFAULT_FULL_LIBRARY_DOCS_PATH);

async function main(): Promise<void> {
  const resolver = new ContentResolver({
    localRoot: contentDir,
    mode: "dev",
  });

  if (!resolver.getContentRoot()) {
    console.log("Content root not available. Ensure .content exists with a skills/ subtree.");
    process.exit(0);
  }

  const snapshot = await buildFullLibrarySnapshot({ resolver });
  await writeFullLibrarySnapshot(snapshot, outPath);
  console.log("Wrote full library snapshot:", outPath);
}

main().catch((e) => {
  const err = e as NodeJS.ErrnoException;
  if (err?.code === "ENOENT") {
    console.log("Missing index files under .content. Run npm run content:index or npm run content:index:static first.");
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});
