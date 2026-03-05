/**
 * Race profiles and history per function/skill.
 * Stores defaults + profiles in skills/<id>/race-config.json and race history in skills/<id>/races.json.
 */
import type { ContentResolver } from "nx-content";
import { normalizeKeySegment } from "nx-content";

export type RaceProfile = {
  model: string;
  temperature?: number;
  maxTokens?: number;
  vendor?: string;
};

export type RaceProfileKey = "best" | "cheapest" | "fastest" | "balanced";

export type RaceConfig = {
  defaults?: { maxTokens?: number };
  profiles?: Partial<Record<RaceProfileKey, RaceProfile>>;
};

export type RaceAttempt = {
  modelId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  avgScoreNormalized?: number;
  passRate?: number;
  avgLostPoints?: number;
  latencyMs?: number;
  costSnapshot?: unknown;
};

export type RaceRecord = {
  raceId: string;
  type: "model" | "temperature";
  label?: string;
  notes?: string;
  applyDefaults: boolean;
  candidates: unknown;
  attempts: RaceAttempt[];
  winners: Partial<Record<RaceProfileKey, string>>;
  runAt: string;
  summary?: string;
};

const MAX_RACES = 200;

function raceConfigKey(skillName: string): string {
  const segment = normalizeKeySegment(skillName);
  return `skills/${segment}/race-config.json`;
}

function racesKey(skillName: string): string {
  const segment = normalizeKeySegment(skillName);
  return `skills/${segment}/races.json`;
}

export async function getRaceConfig(
  resolver: ContentResolver,
  skillName: string
): Promise<RaceConfig> {
  const key = raceConfigKey(skillName);
  try {
    const raw = await resolver.get(key);
    const parsed = JSON.parse(typeof raw === "string" ? raw : "{}") as Partial<RaceConfig>;
    return {
      defaults: parsed.defaults ?? undefined,
      profiles: parsed.profiles ?? undefined,
    };
  } catch {
    return {};
  }
}

export async function setRaceConfig(
  resolver: ContentResolver,
  skillName: string,
  config: RaceConfig
): Promise<void> {
  const key = raceConfigKey(skillName);
  await resolver.set(key, JSON.stringify(config, null, 2));
}

export async function getProfiles(
  resolver: ContentResolver,
  skillName: string
): Promise<{ defaults: RaceConfig["defaults"]; profiles: RaceConfig["profiles"] }> {
  const config = await getRaceConfig(resolver, skillName);
  return {
    defaults: config.defaults,
    profiles: config.profiles,
  };
}

export async function setProfiles(
  resolver: ContentResolver,
  skillName: string,
  profiles: RaceConfig["profiles"]
): Promise<void> {
  const config = await getRaceConfig(resolver, skillName);
  await setRaceConfig(resolver, skillName, { ...config, profiles });
}

export async function setDefaults(
  resolver: ContentResolver,
  skillName: string,
  defaults: RaceConfig["defaults"]
): Promise<void> {
  const config = await getRaceConfig(resolver, skillName);
  await setRaceConfig(resolver, skillName, { ...config, defaults });
}

export async function getRaces(
  resolver: ContentResolver,
  skillName: string
): Promise<RaceRecord[]> {
  const key = racesKey(skillName);
  try {
    const raw = await resolver.get(key);
    const arr = JSON.parse(typeof raw === "string" ? raw : "[]") as unknown[];
    return Array.isArray(arr) ? (arr as RaceRecord[]) : [];
  } catch {
    return [];
  }
}

export async function appendRace(
  resolver: ContentResolver,
  skillName: string,
  record: RaceRecord
): Promise<void> {
  const races = await getRaces(resolver, skillName);
  races.unshift(record);
  const trimmed = races.slice(0, MAX_RACES);
  const key = racesKey(skillName);
  await resolver.set(key, JSON.stringify(trimmed, null, 2));
}

export type GetRaceReportOptions = {
  last?: number;
  since?: string;
  raceId?: string;
};

export async function getRaceReport(
  resolver: ContentResolver,
  skillName: string,
  opts: GetRaceReportOptions = {}
): Promise<RaceRecord[]> {
  let races = await getRaces(resolver, skillName);
  if (opts.raceId) {
    const one = races.find((r) => r.raceId === opts.raceId);
    return one ? [one] : [];
  }
  if (opts.since) {
    const sinceTime = new Date(opts.since).getTime();
    races = races.filter((r) => new Date(r.runAt).getTime() >= sinceTime);
  }
  if (opts.last != null && opts.last > 0) {
    races = races.slice(0, opts.last);
  }
  return races;
}

export async function listRaces(
  resolver: ContentResolver,
  skillName: string
): Promise<Array<{ raceId: string; runAt: string; type: string }>> {
  const races = await getRaces(resolver, skillName);
  return races.map((r) => ({ raceId: r.raceId, runAt: r.runAt, type: r.type }));
}

export async function readRace(
  resolver: ContentResolver,
  skillName: string,
  raceId: string
): Promise<RaceRecord | null> {
  const races = await getRaces(resolver, skillName);
  return races.find((r) => r.raceId === raceId) ?? null;
}
