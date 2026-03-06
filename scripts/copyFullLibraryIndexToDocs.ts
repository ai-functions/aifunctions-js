#!/usr/bin/env node
/**
 * Build a FULL library snapshot in .docs with embedded source content.
 * This expands aggregate refs and per-skill source.files into inline content.
 *
 * Input:
 *   .content/skills/index.v1.json
 *   .content/skills/index/v1/<skill>.json
 *
 * Output:
 *   .docs/library-index.full.fallback.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Aggregate = {
  schemaVersion: string;
  generatedAt: string;
  generator?: { name?: string; mode?: string; model?: string };
  skills: Array<{ $refKey: string }>;
};

type SourceFile = { key: string; kind: string };
type SkillEntry = {
  schemaVersion: string;
  id: string;
  displayName: string;
  description: string;
  source?: { contentPrefix?: string; files?: SourceFile[]; contentHash?: string };
  runtime?: unknown;
  io?: unknown;
  examples?: unknown[];
  tags?: string[];
  quality?: unknown;
};

type FullSkill = Omit<SkillEntry, "source"> & {
  source: {
    contentPrefix?: string;
    contentHash?: string;
    embeddedFiles: Array<{ name: string; kind: string; content: string }>;
  };
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const contentRoot = path.join(root, ".content");
const docsRoot = path.join(root, ".docs");

const aggregatePath = path.join(contentRoot, "skills", "index.v1.json");
const outPath = path.join(docsRoot, "library-index.full.fallback.json");

function readJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, "utf-8")) as T;
}

function readSafe(p: string): string {
  try {
    return readFileSync(p, "utf-8");
  } catch {
    return "";
  }
}

try {
  const aggregate = readJson<Aggregate>(aggregatePath);
  if (!Array.isArray(aggregate.skills)) throw new Error("Invalid aggregate index: missing skills[]");

  const fullSkills: FullSkill[] = aggregate.skills.map((ref) => {
    const refKey = ref.$refKey;
    const entryPath = path.join(contentRoot, refKey);
    const entry = readJson<SkillEntry>(entryPath);

    const files = Array.isArray(entry.source?.files) ? entry.source!.files! : [];
    const embeddedFiles = files.map((f) => {
      const srcPath = path.join(contentRoot, f.key);
      return {
        name: path.basename(f.key),
        kind: f.kind,
        content: readSafe(srcPath),
      };
    });

    const fullEntry: FullSkill = {
      ...entry,
      source: {
        contentPrefix: entry.source?.contentPrefix,
        contentHash: entry.source?.contentHash,
        embeddedFiles,
      },
    };
    return fullEntry;
  });

  const fullSnapshot = {
    schemaVersion: "1.0-full",
    generatedAt: new Date().toISOString(),
    basedOn: {
      aggregateKey: "skills/index.v1.json",
      aggregateGeneratedAt: aggregate.generatedAt,
      aggregateSchemaVersion: aggregate.schemaVersion,
      skillCount: fullSkills.length,
    },
    skills: fullSkills,
  };

  mkdirSync(docsRoot, { recursive: true });
  writeFileSync(outPath, JSON.stringify(fullSnapshot, null, 2), "utf-8");
  console.log("Wrote full library snapshot:", outPath);
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  if (err?.code === "ENOENT") {
    console.log("Missing index files under .content. Run npm run content:index or npm run content:index:static first.");
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
}
