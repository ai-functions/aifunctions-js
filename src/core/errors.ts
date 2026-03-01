export type NxAiApiErrorCode =
  | "MISSING_ENV"
  | "OPENROUTER_HTTP_ERROR"
  | "TIMEOUT"
  | "MISSING_OPTIONAL_DEP";

export class NxAiApiError extends Error {
  readonly name = "NxAiApiError";
  readonly code: NxAiApiErrorCode;
  readonly status?: number;
  readonly details?: unknown;

  constructor(
    message: string,
    opts: {
      code: NxAiApiErrorCode;
      status?: number;
      details?: unknown;
    }
  ) {
    super(message);
    this.code = opts.code;
    this.status = opts.status;
    this.details = opts.details;
    Object.setPrototypeOf(this, NxAiApiError.prototype);
  }
}
