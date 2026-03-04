/**
 * Secure JSON parse: removes __proto__ and constructor.prototype keys to prevent prototype poisoning.
 * Throws with code ERR_JSON_PARSE on invalid JSON.
 */
import sjson from "secure-json-parse";
import { ERR_JSON_PARSE } from "./aiJsonTypes.js";

const PARSE_OPTIONS = {
  protoAction: "remove" as const,
  constructorAction: "remove" as const,
};

export class JsonParseError extends Error {
  readonly code = ERR_JSON_PARSE;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "JsonParseError";
    if (cause instanceof Error && cause.cause === undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

/**
 * Parse JSON string with prototype poisoning protection.
 * Default policy: remove __proto__ and constructor keys.
 * @throws JsonParseError with code ERR_JSON_PARSE when JSON is invalid
 */
export function safeJsonParse(jsonText: string): unknown {
  if (typeof jsonText !== "string") {
    throw new JsonParseError("Input must be a string");
  }
  try {
    return sjson(jsonText, undefined, PARSE_OPTIONS);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new JsonParseError(`Invalid JSON: ${message}`, e);
  }
}
