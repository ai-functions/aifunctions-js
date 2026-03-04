/**
 * JSON extraction helper for LLM output. Extracts the first brace-balanced {...} and parses it.
 */
import { extractJSON } from "extract-first-json";
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

/** Match first fenced block: ```json or ``` followed by content and closing ``` */
const FENCED_JSON_RE = /```(?:json)?\s*\n?([\s\S]*?)```/i;

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
 * otherwise uses extract-first-json. Returns both the raw JSON string and the parsed value (parsed via safeJsonParse).
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
    const fenced = FENCED_JSON_RE.exec(trimmed);
    if (fenced) {
        const block = fenced[1].trim();
        try {
            const parsed = safeJsonParse(block);
            return { jsonText: block, parsed };
        } catch {
            // Block existed but didn't parse; fall through to extract-first-json on full text
        }
    }

    const parsedFromPkg = extractJSON(trimmed);
    if (parsedFromPkg === undefined) {
        throw new NoJsonFoundError("No JSON object or array found in text");
    }
    const jsonText = JSON.stringify(parsedFromPkg);
    const parsed = safeJsonParse(jsonText);
    return { jsonText, parsed };
}
