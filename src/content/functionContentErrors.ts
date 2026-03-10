/**
 * Typed errors for function content resolution.
 * Used by providers and factory for config problems, missing function,
 * malformed content, and provider failures.
 */

export class FunctionContentError extends Error {
  override name: string = "FunctionContentError";
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, opts: { code: string; details?: unknown } = { code: "FUNCTION_CONTENT_ERROR" }) {
    super(message);
    this.code = opts.code;
    this.details = opts.details;
    Object.setPrototypeOf(this, FunctionContentError.prototype);
  }
}

export class FunctionContentNotFoundError extends FunctionContentError {
  readonly functionId?: string;

  constructor(message: string, opts?: { functionId?: string; details?: unknown }) {
    super(message, { code: "FUNCTION_CONTENT_NOT_FOUND", details: opts?.details });
    this.name = "FunctionContentNotFoundError";
    this.functionId = opts?.functionId;
    Object.setPrototypeOf(this, FunctionContentNotFoundError.prototype);
  }
}

export class FunctionContentParseError extends FunctionContentError {
  readonly key?: string;

  constructor(message: string, opts?: { key?: string; details?: unknown }) {
    super(message, { code: "FUNCTION_CONTENT_PARSE_ERROR", details: opts?.details });
    this.name = "FunctionContentParseError";
    this.key = opts?.key;
    Object.setPrototypeOf(this, FunctionContentParseError.prototype);
  }
}

export class FunctionContentConfigError extends FunctionContentError {
  constructor(message: string, opts?: { details?: unknown }) {
    super(message, { code: "FUNCTION_CONTENT_CONFIG_ERROR", details: opts?.details });
    this.name = "FunctionContentConfigError";
    Object.setPrototypeOf(this, FunctionContentConfigError.prototype);
  }
}
