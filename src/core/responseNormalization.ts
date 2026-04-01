import { NxAiApiError } from "./errors.js";
import type {
  AskOptions,
  AskResult,
  ResponseFormat,
  ResponseNormalization,
} from "./types.js";

const _think = "think";

/** Default paired / vendor reasoning wrappers seen on OpenRouter and similar chat APIs. */
export const DEFAULT_REASONING_BLOCK_PATTERNS: RegExp[] = [
  new RegExp("<" + _think + ">[\\s\\S]*?<\\/" + _think + ">", "gis"),
  new RegExp(
    "<" + "redacted_reasoning" + ">[\\s\\S]*?<\\/" + "redacted_reasoning" + ">",
    "gis"
  ),
  /<thinking>[\s\S]*?<\/thinking>/gi,
  /<reasoning>[\s\S]*?<\/reasoning>/gi,
  new RegExp("`" + _think + "`[\\s\\S]*?`" + _think + "`", "gis"),
];

const SNIPPET_MAX = 200;

function excerpt(s: string, max = SNIPPET_MAX): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function stripMarkdownFences(s: string): string {
  const t = s.trim();
  const m = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (m) return m[1].trim();
  return t;
}

export function stripReasoningBlocksFromText(
  s: string,
  patterns: RegExp[] = DEFAULT_REASONING_BLOCK_PATTERNS
): string {
  let out = s;
  for (const re of patterns) {
    out = out.replace(re, "");
  }
  return out;
}

/**
 * First `{` through matching `}` with JSON-style double-quoted string and escape awareness.
 */
export function extractBalancedJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function effectiveNormalization(
  norm: ResponseNormalization | undefined,
  /** When false, caller skipped pipeline (text mode). */
  jsonMode: boolean
): {
  stripReasoningBlocks: boolean;
  stripMarkdownFences: boolean;
  extractBalancedJsonObject: boolean;
  reasoningPatterns: RegExp[];
} {
  if (!jsonMode) {
    return {
      stripReasoningBlocks: false,
      stripMarkdownFences: false,
      extractBalancedJsonObject: false,
      reasoningPatterns: DEFAULT_REASONING_BLOCK_PATTERNS,
    };
  }
  const patterns =
    norm?.reasoningBlockPatterns !== undefined
      ? norm.reasoningBlockPatterns
      : DEFAULT_REASONING_BLOCK_PATTERNS;
  return {
    stripReasoningBlocks: norm?.stripReasoningBlocks !== false,
    stripMarkdownFences: norm?.stripMarkdownFences !== false,
    extractBalancedJsonObject: norm?.extractBalancedJsonObject !== false,
    reasoningPatterns: patterns,
  };
}

/**
 * Run trim → reasoning → fences → balanced extract → JSON.parse for structured JSON responses.
 */
export function normalizeAndParseJsonObjectResponse(
  rawText: string,
  norm: ResponseNormalization | undefined
): { text: string; parsed: unknown } {
  const eff = effectiveNormalization(norm, true);
  let s = rawText.trim();
  if (eff.stripReasoningBlocks) s = stripReasoningBlocksFromText(s, eff.reasoningPatterns);
  s = s.trim();
  if (eff.stripMarkdownFences) s = stripMarkdownFences(s);
  s = s.trim();

  let toParse = s;
  if (eff.extractBalancedJsonObject) {
    const extracted = extractBalancedJsonObject(s);
    if (extracted == null) {
      throw new NxAiApiError("No JSON object found after response normalization", {
        code: "RESPONSE_NORMALIZATION_FAILED",
        details: { snippet: excerpt(s), stage: "extractBalancedJsonObject" },
      });
    }
    toParse = extracted;
  }

  try {
    const parsed = JSON.parse(toParse) as unknown;
    return { text: toParse, parsed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new NxAiApiError(`JSON.parse failed after response normalization: ${msg}`, {
      code: "RESPONSE_NORMALIZATION_FAILED",
      details: { snippet: excerpt(toParse), parseError: msg, stage: "json_parse" },
    });
  }
}

export function applyResponseFormatToAskResult(opts: AskOptions, result: AskResult): AskResult {
  const rf = opts.responseFormat;
  if (rf == null || rf.kind === "text") {
    return { ...result, text: result.text.trim() };
  }
  if (rf.kind === "json_object" || rf.kind === "json_schema") {
    const { text, parsed } = normalizeAndParseJsonObjectResponse(result.text, opts.responseNormalization);
    return { ...result, text, parsed };
  }
  return { ...result, text: result.text.trim() };
}

export function openRouterResponseFormatBody(
  rf: ResponseFormat | undefined
): Record<string, unknown> | undefined {
  if (rf == null || rf.kind === "text") return undefined;
  if (rf.kind === "json_object") {
    return { type: "json_object" };
  }
  if (rf.kind === "json_schema") {
    return {
      type: "json_schema",
      json_schema: {
        name: rf.name ?? "response",
        strict: true,
        schema: rf.schema,
      },
    };
  }
  return undefined;
}
