/**
 * JSON extraction helper for LLM output. Extracts the first brace-balanced {...} and parses it.
 */

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
