import type { Client, LlmMode } from "../../src/index.js";
import { askJson } from "../askJson.js";
import {
  clamp01,
  indexCandidates,
  renderIndexedCandidatesForPrompt,
  type CandidateId,
  type MatchCandidate,
} from "../core/indexedCandidates.js";

export type MatchInput = {
  query: string;
  candidates: MatchCandidate[];
  guidance?: string;
  maxResults?: number; // default: 3
  minScore?: number; // optional threshold
  allowNoMatch?: boolean; // default: true
  returnReasons?: boolean; // default: true
  additionalInstructions?: string;
  mode?: LlmMode;
  client?: Client;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  vendor?: string | string[];
};

export type MatchOutput = {
  query: string;
  matches: Array<{
    id: CandidateId;
    score: number; // 0..1
    reason?: string;
  }>;
  noMatch: boolean;
};

type MatchModelOutput = {
  noMatch: boolean;
  matches: Array<{
    idx: number;
    score: number;
    reason?: string;
  }>;
};

function matchSchema(maxResults: number, allowNoMatch: boolean, returnReasons: boolean): object {
  const matchItem: Record<string, unknown> = {
    type: "object",
    required: returnReasons ? ["idx", "score", "reason"] : ["idx", "score"],
    properties: {
      idx: { type: "integer", minimum: 1 },
      score: { type: "number", minimum: 0, maximum: 1 },
      ...(returnReasons ? { reason: { type: "string", minLength: 1, maxLength: 240 } } : {}),
    },
    additionalProperties: false,
  };

  const base: Record<string, unknown> = {
    type: "object",
    required: ["noMatch", "matches"],
    properties: {
      noMatch: { type: "boolean" },
      matches: {
        type: "array",
        maxItems: maxResults,
        items: matchItem,
      },
    },
    additionalProperties: false,
  };

  if (allowNoMatch) return base;

  // If noMatch is not allowed, require at least one match and force noMatch=false.
  return {
    allOf: [
      base,
      {
        type: "object",
        properties: { noMatch: { const: false }, matches: { minItems: 1 } },
      },
    ],
  };
}

function instructions(returnReasons: boolean, allowNoMatch: boolean, maxResults: number): {
  weak: string;
  normal: string;
  strong: string;
} {
  const reasonsLine = returnReasons
    ? `For each match include a short "reason" (<= 1 sentence).`
    : `Do NOT include any "reason" field.`;
  const noMatchLine = allowNoMatch
    ? `If nothing matches well, set "noMatch": true and return "matches": [].`
    : `You MUST return at least one match; "noMatch" must be false.`;
  const outShape = returnReasons
    ? `{"noMatch": boolean, "matches": [{"idx": number, "score": number, "reason": string}]}`
    : `{"noMatch": boolean, "matches": [{"idx": number, "score": number}]}`;

  const base = `You are ai.matchCandidates.
Select up to ${maxResults} best matching candidates for the given query.
Return JSON ONLY; no markdown, no extra text.
You MUST select candidates by their numeric "idx" (index), not by label text.
Output must have shape: ${outShape}
Scores must be in [0, 1] and reflect confidence (1 = exact match, 0 = not a match).
${reasonsLine}
${noMatchLine}`.trim();

  // Keep weak/strong identical for determinism; mode presets differ by model/backend.
  return { weak: base, normal: base, strong: base };
}

function normalizeMatches(params: {
  query: string;
  candidates: MatchCandidate[];
  raw: MatchModelOutput;
  maxResults: number;
  minScore?: number;
  allowNoMatch: boolean;
  returnReasons: boolean;
}): MatchOutput {
  const { query, candidates, raw, maxResults, minScore, allowNoMatch, returnReasons } = params;
  const { byIdx } = indexCandidates(candidates);

  const seen = new Set<number>();
  const cleaned: Array<{ idx: number; score: number; reason?: string }> = [];
  for (const m of Array.isArray(raw.matches) ? raw.matches : []) {
    const idx = typeof m?.idx === "number" ? m.idx : Number(m?.idx);
    if (!Number.isFinite(idx) || !Number.isInteger(idx)) continue;
    if (idx < 1) continue;
    if (seen.has(idx)) continue;
    if (!byIdx.has(idx)) continue; // out of range
    seen.add(idx);
    cleaned.push({
      idx,
      score: clamp01(m?.score),
      reason: typeof m?.reason === "string" ? m.reason : undefined,
    });
  }

  // Deterministic ordering: highest score first; tie-break by idx.
  cleaned.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx));

  const threshold = typeof minScore === "number" && Number.isFinite(minScore) ? minScore : undefined;
  const thresholdFiltered = threshold == null ? cleaned : cleaned.filter((m) => m.score >= threshold);
  let final = thresholdFiltered.slice(0, maxResults);

  if (final.length === 0 && allowNoMatch) {
    return { query, matches: [], noMatch: true };
  }

  // If allowNoMatch=false, we must return something. Fall back to best available candidate
  // even if it did not meet minScore (or model output was mostly invalid).
  if (final.length === 0 && !allowNoMatch) {
    final = cleaned.slice(0, Math.max(1, maxResults));
  }

  const mapped = final.map((m) => {
    const c = byIdx.get(m.idx)!;
    const out: { id: CandidateId; score: number; reason?: string } = {
      id: c.id,
      score: clamp01(m.score),
    };
    if (returnReasons && m.reason) out.reason = m.reason;
    return out;
  });

  return { query, matches: mapped, noMatch: mapped.length === 0 };
}

/**
 * Generic structured matching: one query + many candidates → best matches.
 * Uses internal index mapping (model selects candidate idx; library maps to stable IDs).
 */
export async function match(input: MatchInput): Promise<MatchOutput> {
  const {
    query,
    candidates,
    guidance,
    maxResults = 3,
    minScore,
    allowNoMatch = true,
    returnReasons = true,
    additionalInstructions,
    mode = "normal",
    client,
    model,
    temperature,
    maxTokens,
    timeoutMs,
    vendor,
  } = input;

  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error("match(): query must be a non-empty string");
  }
  if (!Array.isArray(candidates) || candidates.length === 0) {
    if (allowNoMatch) return { query, matches: [], noMatch: true };
    throw new Error("match(): candidates must be a non-empty array when allowNoMatch=false");
  }
  const mr = Number.isFinite(maxResults) ? Math.max(1, Math.floor(maxResults)) : 3;

  const { indexed } = indexCandidates(candidates);
  const prompt = [
    `Query: ${query}`,
    guidance ? `Guidance: ${guidance}` : undefined,
    "",
    "Candidates (pick by idx):",
    renderIndexedCandidatesForPrompt(indexed),
  ]
    .filter(Boolean)
    .join("\n");

  const schema = matchSchema(mr, allowNoMatch, returnReasons);
  const res = await askJson<MatchModelOutput>({
    prompt,
    instructions: (() => {
      const inst = instructions(returnReasons, allowNoMatch, mr);
      if (!additionalInstructions) return inst;
      const extra = `\n\nAdditional instructions:\n${additionalInstructions}`.trim();
      return {
        weak: `${inst.weak}\n\n${extra}`.trim(),
        normal: `${inst.normal}\n\n${extra}`.trim(),
        strong: `${inst.strong}\n\n${extra}`.trim(),
      };
    })(),
    client,
    mode,
    model,
    temperature,
    maxTokens,
    timeoutMs,
    vendor,
    schema,
    throwOnError: true,
  });

  if (!res.ok) {
    // throwOnError should prevent this, but keep behavior explicit.
    throw new Error(`${res.errorCode}: ${res.message}`);
  }
  const raw = res.parsed;
  return normalizeMatches({
    query,
    candidates,
    raw,
    maxResults: mr,
    minScore,
    allowNoMatch,
    returnReasons,
  });
}

