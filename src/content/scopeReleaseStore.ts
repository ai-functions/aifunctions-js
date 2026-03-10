/**
 * Scope-specific releases. Release creation and lookup are scope-aware.
 */

import type { ContentResolver } from "nx-content";
import { normalizeKeySegment } from "nx-content";
import type { ScopeRelease } from "./scopedRuntime.js";

const PREFIX = "functions/";
const RELEASES_DIR = "releases";

function releaseKey(functionId: string, scopeId: string, version: string): string {
  const fnSeg = normalizeKeySegment(functionId);
  const scopeSeg = normalizeKeySegment(scopeId);
  return `${PREFIX}${fnSeg}/scopes/${scopeSeg}/${RELEASES_DIR}/${normalizeKeySegment(version)}.json`;
}

function releasesPrefix(functionId: string, scopeId: string): string {
  const fnSeg = normalizeKeySegment(functionId);
  const scopeSeg = normalizeKeySegment(scopeId);
  return `${PREFIX}${fnSeg}/scopes/${scopeSeg}/${RELEASES_DIR}/`;
}

export async function saveScopeRelease(
  resolver: ContentResolver,
  release: ScopeRelease
): Promise<void> {
  const key = releaseKey(release.functionId, release.scopeId, release.version);
  await resolver.set(key, JSON.stringify(release, null, 2));
}

export async function getScopeRelease(
  resolver: ContentResolver,
  functionId: string,
  scopeId: string,
  version: string
): Promise<ScopeRelease | null> {
  const key = releaseKey(functionId, scopeId, version);
  try {
    const raw = await resolver.get(key);
    const parsed = JSON.parse(typeof raw === "string" ? raw : "{}") as Partial<ScopeRelease>;
    if (parsed.functionId && parsed.scopeId && parsed.version) {
      return parsed as ScopeRelease;
    }
  } catch {
    /* not found */
  }
  return null;
}

export async function listScopeReleases(
  resolver: ContentResolver,
  functionId: string,
  scopeId: string
): Promise<ScopeRelease[]> {
  const prefix = releasesPrefix(functionId, scopeId);
  let keys: string[];
  try {
    keys = await resolver.listKeys(prefix);
  } catch {
    return [];
  }
  const releases: ScopeRelease[] = [];
  for (const key of keys) {
    const match = key.match(/\.json$/);
    if (!match) continue;
    const version = key.slice(prefix.length, -5);
    const r = await getScopeRelease(resolver, functionId, scopeId, version);
    if (r) releases.push(r);
  }
  releases.sort((a, b) => new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime());
  return releases;
}
