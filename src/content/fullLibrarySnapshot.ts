import type { ContentResolver } from "nx-content";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getLibraryIndex, type SkillIndexEntry, type SourceFile } from "./libraryIndex.js";

export type FullEmbeddedFile = {
  key: string;
  name: string;
  kind: SourceFile["kind"];
  content: string;
};

export type FullLibrarySkillEntry = Omit<SkillIndexEntry, "source"> & {
  source:
    | {
      kind: "built-in";
    }
    | {
      contentPrefix?: string;
      contentHash: string;
      embeddedFiles: FullEmbeddedFile[];
    };
};

export type FullLibrarySnapshot = {
  schemaVersion: "1.0-full";
  generatedAt: string;
  basedOn: {
    aggregateKey: string;
    aggregateGeneratedAt: string;
    aggregateSchemaVersion: string;
    skillCount: number;
  };
  skills: FullLibrarySkillEntry[];
};

export type BuildFullLibrarySnapshotOptions = {
  resolver: ContentResolver;
  indexKey?: string;
};

const DEFAULT_INDEX_KEY = "skills/index.v1.json";
export const DEFAULT_FULL_LIBRARY_DOCS_PATH = ".docs/library-index.full.fallback.json";

async function readTextSafe(resolver: ContentResolver, key: string): Promise<string> {
  try {
    const raw = await resolver.get(key);
    return typeof raw === "string" ? raw : "";
  } catch {
    return "";
  }
}

export async function buildFullLibrarySnapshot(
  options: BuildFullLibrarySnapshotOptions
): Promise<FullLibrarySnapshot> {
  const { resolver, indexKey = DEFAULT_INDEX_KEY } = options;
  const aggregate = await getLibraryIndex({ resolver, key: indexKey, allowMissing: false });

  const skills: FullLibrarySkillEntry[] = [];
  for (const ref of aggregate.skills) {
    const entryText = await readTextSafe(resolver, ref.$refKey);
    if (!entryText.trim()) continue;
    let entry: SkillIndexEntry;
    try {
      entry = JSON.parse(entryText) as SkillIndexEntry;
    } catch {
      continue;
    }

    const source = entry.source;
    if ("kind" in source && source.kind === "built-in") {
      skills.push({
        ...entry,
        source: { kind: "built-in" },
      });
    } else {
      const contentSource = source as Extract<SkillIndexEntry["source"], { files: SourceFile[] }>;
      const files = Array.isArray(contentSource.files) ? contentSource.files : [];
      const embeddedFiles: FullEmbeddedFile[] = [];
      for (const f of files) {
        const content = await readTextSafe(resolver, f.key);
        embeddedFiles.push({
          key: f.key,
          name: path.basename(f.key),
          kind: f.kind,
          content,
        });
      }

      skills.push({
        ...entry,
        source: {
          contentPrefix: contentSource.contentPrefix,
          contentHash: contentSource.contentHash ?? "",
          embeddedFiles,
        },
      });
    }
  }

  return {
    schemaVersion: "1.0-full",
    generatedAt: new Date().toISOString(),
    basedOn: {
      aggregateKey: indexKey,
      aggregateGeneratedAt: aggregate.generatedAt,
      aggregateSchemaVersion: aggregate.schemaVersion,
      skillCount: skills.length,
    },
    skills,
  };
}

export async function writeFullLibrarySnapshot(
  snapshot: FullLibrarySnapshot,
  absoluteOutputPath: string
): Promise<void> {
  const outDir = path.dirname(absoluteOutputPath);
  await mkdir(outDir, { recursive: true });
  await writeFile(absoluteOutputPath, JSON.stringify(snapshot, null, 2), "utf-8");
}
