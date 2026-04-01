/**
 * JSON extraction helper for LLM output. Extracts the first brace-balanced {...} and parses it.
 */
import { ERR_NO_JSON_FOUND } from "./aiJsonTypes.js";
import { safeJsonParse } from "./safeJsonParse.js";

export type ExtractFirstJsonSuccess = { ok: true; data: unknown };
export type ExtractFirstJsonFailure = {
    ok: false;
    errorCode: string;
    message: string;
};
export type ExtractFirstJsonResult = ExtractFirstJsonSuccess | ExtractFirstJsonFailure;

/**
 * Finds the first `{` and the matching `}` (brace-balanced), extracts that substring,
 * and parses it as JSON. Use for model output that may contain markdown or prose around a JSON object.
 *
 * @returns `{ ok: true, data }` with the parsed object, or `{ ok: false, errorCode, message }` on failure.
 */
export function extractFirstJson(text: string): ExtractFirstJsonResult {
    if (typeof text !== "string") {
        return { ok: false, errorCode: "INVALID_INPUT", message: "Input must be a string" };
    }
    const trimmed = text.trim();
    const start = trimmed.indexOf("{");
    if (start === -1) {
        return { ok: false, errorCode: "NO_JSON_OBJECT", message: "No '{' found in text" };
    }
    let depth = 0;
    let inString = false;
    let escape = false;
    let quote: string | null = null;
    for (let i = start; i < trimmed.length; i++) {
        const c = trimmed[i];
        if (escape) {
            escape = false;
            continue;
        }
        if (inString) {
            if (c === "\\") escape = true;
            else if (c === quote) inString = false;
            continue;
        }
        if (c === '"' || c === "'") {
            inString = true;
            quote = c;
            continue;
        }
        if (c === "{") depth++;
        else if (c === "}") {
            depth--;
            if (depth === 0) {
                const slice = trimmed.slice(start, i + 1);
                try {
                    const data = JSON.parse(slice) as unknown;
                    return { ok: true, data };
                } catch (e) {
                    return {
                        ok: false,
                        errorCode: "JSON_PARSE_ERROR",
                        message: e instanceof Error ? e.message : String(e),
                    };
                }
            }
        }
    }
    return { ok: false, errorCode: "UNBALANCED_BRACES", message: "No matching '}' for first '{'" };
}

/** First ```json / ``` fence inner payload (linear scan; avoids ReDoS from nested quantifiers). */
function extractFirstFenceInner(trimmed: string): string | null {
  const openMatch = trimmed.match(/```(?:json)?\s*\r?\n?/i);
  if (!openMatch || openMatch.index === undefined) return null;
  const contentStart = openMatch.index + openMatch[0].length;
  const closeIdx = trimmed.indexOf("```", contentStart);
  if (closeIdx === -1) return null;
  return trimmed.slice(contentStart, closeIdx).trim();
}

/** JSON string / escape aware; `open`/`close` are one of `{}` or `[]`. */
function extractBalancedDelimited(
  s: string,
  start: number,
  open: "{" | "[",
  close: "}" | "]"
): string | null {
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
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/** First top-level `{...}` or `[...]` slice (avoids extract-first-json hang on adjacent values). */
function extractFirstBalancedJsonSlice(trimmed: string): string | null {
  let inString = false;
  let escape = false;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
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
    if (c === "{") return extractBalancedDelimited(trimmed, i, "{", "}");
    if (c === "[") return extractBalancedDelimited(trimmed, i, "[", "]");
  }
  return null;
}

/** Thrown when no JSON object/array can be extracted (callers can check error.code === ERR_NO_JSON_FOUND). */
export class NoJsonFoundError extends Error {
    readonly code = ERR_NO_JSON_FOUND;
    constructor(message: string = "No JSON object or array found in text") {
        super(message);
        this.name = "NoJsonFoundError";
    }
}

export type ExtractFirstJsonObjectResult = { jsonText: string; parsed: unknown };

/**
 * Extract the first JSON object or array from text. Prefers content inside ```json ... ``` blocks;
 * otherwise scans for the first brace-/bracket-balanced JSON value (linear time; safe for adjacent objects).
 * @returns { jsonText, parsed }
 * @throws NoJsonFoundError (error.code === ERR_NO_JSON_FOUND) when no JSON found
 * @throws JsonParseError (error.code === ERR_JSON_PARSE) when JSON is invalid (e.g. prototype poisoning)
 */
export function extractFirstJsonObject(text: string): ExtractFirstJsonObjectResult {
    if (typeof text !== "string") {
        throw new NoJsonFoundError("Input must be a string");
    }
    const trimmed = text.trim();

    // Prefer ```json or ``` block
    const block = extractFirstFenceInner(trimmed);
    if (block !== null && block.length > 0) {
        try {
            const parsed = safeJsonParse(block);
            return { jsonText: block, parsed };
        } catch {
            // Block existed but didn't parse; fall through
        }
    }

    const slice = extractFirstBalancedJsonSlice(trimmed);
    if (slice === null) {
        throw new NoJsonFoundError("No JSON object or array found in text");
    }
    const parsed = safeJsonParse(slice);
    return { jsonText: slice, parsed };
}
