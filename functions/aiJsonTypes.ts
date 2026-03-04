/**
 * Standardized result and error types for JSON execution paths (runJsonCompletion, askJson pipeline).
 * Enables deterministic handling without string matching.
 */

export const ERR_NO_JSON_FOUND = "ERR_NO_JSON_FOUND";
export const ERR_JSON_PARSE = "ERR_JSON_PARSE";
export const ERR_SCHEMA_INVALID = "ERR_SCHEMA_INVALID";

export type AiJsonErrorCode =
  | typeof ERR_NO_JSON_FOUND
  | typeof ERR_JSON_PARSE
  | typeof ERR_SCHEMA_INVALID;

export type AiJsonError = {
  ok: false;
  errorCode: AiJsonErrorCode;
  message: string;
  details?: unknown;
  attemptsUsed: number;
  rawText: string;
};

export type ValidationOk = { ok: true };
export type ValidationFail = {
  ok: false;
  errors: Array<{ path: string; message: string }>;
};
export type AiJsonValidation = ValidationOk | ValidationFail;

export type AiJsonSuccess<T = unknown> = {
  ok: true;
  parsed: T;
  rawText: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model?: string;
  attemptsUsed: number;
  validation?: AiJsonValidation;
};

export type AiJsonResult<T = unknown> = AiJsonSuccess<T> | AiJsonError;

export function isAiJsonError(r: AiJsonResult<unknown>): r is AiJsonError {
  return r.ok === false;
}

export function isAiJsonSuccess<T>(r: AiJsonResult<T>): r is AiJsonSuccess<T> {
  return r.ok === true;
}
