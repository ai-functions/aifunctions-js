/**
 * Resolves function content via a compatible store server (shared-store mode).
 * Uses a StoreClient (e.g. nx-content-store client) to fetch canonical keys.
 * Supports any compatible deployment: hosted or self-hosted.
 */

import { FunctionContentConfigError, FunctionContentNotFoundError, FunctionContentParseError } from "./functionContentErrors.js";
import type {
  FunctionContentProvider,
  GetFunctionContentInput,
  HasFunctionInput,
  ListFunctionsInput,
  ResolvedFunctionContent,
  SharedStoreConfig,
} from "./functionContentProvider.js";
import { getStoreKeys } from "./storeKeys.js";

/** Default meta shape for missing meta.json; matches skillsResolver DEFAULT_META. */
const DEFAULT_META: Record<string, unknown> = {
  status: "draft",
  version: null,
  releasedAt: null,
  lastValidation: null,
  scoreGate: 0.85,
};

/** Rule shape: { rule: string; weight: number } */
function parseRules(raw: string): unknown {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseMeta(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { ...DEFAULT_META };
  } catch {
    return { ...DEFAULT_META };
  }
}

function parseTestCases(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Minimal HTTP store client using fetch.
 * Can be replaced by nx-content-store client when available.
 */
function createFetchStoreClient(config: SharedStoreConfig): {
  get(key: string): Promise<string>;
  listKeys(prefix: string): Promise<string[]>;
} {
  const baseUrl = (config.baseUrl ?? "").replace(/\/$/, "");
  const storeId = config.storeId;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.publishableKey) headers["X-Publishable-Key"] = config.publishableKey;
  if (config.secretKey) headers["Authorization"] = `Bearer ${config.secretKey}`;

  async function get(key: string): Promise<string> {
    const url = storeId
      ? `${baseUrl}/stores/${encodeURIComponent(storeId)}/content/${encodeURIComponent(key)}`
      : `${baseUrl}/content/${encodeURIComponent(key)}`;
    const res = await fetch(url, { headers });
    if (res.status === 404) throw new FunctionContentNotFoundError(`Not found: ${key}`, { details: { key } });
    if (!res.ok) {
      throw new FunctionContentParseError(
        `Store request failed: ${res.status} ${res.statusText}`,
        { key, details: await res.text() }
      );
    }
    return res.text();
  }

  async function listKeys(prefix: string): Promise<string[]> {
    const url = storeId
      ? `${baseUrl}/stores/${encodeURIComponent(storeId)}/keys?prefix=${encodeURIComponent(prefix)}`
      : `${baseUrl}/keys?prefix=${encodeURIComponent(prefix)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const data = (await res.json()) as { keys?: string[] };
    return Array.isArray(data?.keys) ? data.keys : [];
  }

  return { get, listKeys };
}

export class SharedStoreContentProvider implements FunctionContentProvider {
  private readonly client: { get(key: string): Promise<string>; listKeys(prefix: string): Promise<string[]> };
  private readonly config: SharedStoreConfig;

  constructor(config: SharedStoreConfig) {
    this.config = config;
    if (!config.baseUrl?.trim()) {
      throw new FunctionContentConfigError("sharedStore.baseUrl is required");
    }
    this.client = createFetchStoreClient(config);
  }

  async getFunctionContent(
    input: GetFunctionContentInput
  ): Promise<ResolvedFunctionContent> {
    const keys = getStoreKeys(input.functionId);
    const source = {
      mode: "shared-store" as const,
      storeId: this.config.storeId,
      baseUrl: this.config.baseUrl,
    };

    const instructions: Partial<Record<"strong" | "weak" | "ultra", string>> = {};
    let foundAny = false;
    for (const mode of ["strong", "weak", "ultra"] as const) {
      try {
        const text = await this.client.get(keys[mode]);
        if (typeof text === "string" && text.trim()) {
          instructions[mode] = text;
          foundAny = true;
        }
      } catch (e) {
        if (!(e instanceof FunctionContentNotFoundError)) throw e;
      }
    }

    let rules: unknown;
    try {
      const raw = await this.client.get(keys.rules);
      rules = parseRules(raw);
      foundAny = true;
    } catch (e) {
      if (e instanceof FunctionContentNotFoundError) rules = [];
      else throw e;
    }

    let meta: Record<string, unknown> = { ...DEFAULT_META };
    try {
      const raw = await this.client.get(keys.metaJson);
      meta = parseMeta(raw);
      foundAny = true;
    } catch {
      // optional
    }

    let testCases: unknown[] = [];
    try {
      const raw = await this.client.get(keys.testCasesJson);
      testCases = parseTestCases(raw);
      foundAny = true;
    } catch {
      // optional
    }

    if (!foundAny) {
      throw new FunctionContentNotFoundError(
        `No content found for function: ${input.functionId}`,
        { functionId: input.functionId }
      );
    }

    return {
      functionId: input.functionId,
      instructions,
      rules,
      meta,
      testCases,
      source,
    };
  }

  async hasFunction(input: HasFunctionInput): Promise<boolean> {
    const keys = getStoreKeys(input.functionId);
    try {
      await this.client.get(keys.strong);
      return true;
    } catch {
      try {
        await this.client.get(keys.weak);
        return true;
      } catch {
        return false;
      }
    }
  }

  async listFunctions(input?: ListFunctionsInput): Promise<string[]> {
    const prefix = input?.prefix ?? "functions/";
    const keys = await this.client.listKeys(prefix);
    const ids = new Set<string>();
    for (const key of keys) {
      const match = key.match(/^functions\/([^/]+)\//);
      if (match) ids.add(match[1]);
    }
    return [...ids];
  }
}
