/**
 * Attribution context helpers.
 * Extracts optional caller-provided attribution fields from a request body and
 * combines them with the server-injected functionId.
 * traceId is auto-generated when not provided.
 */
import type { AttributionContext } from "../core/types.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (!isRecord(v)) return false;
  return Object.values(v).every((val) => typeof val === "string");
}

/**
 * Build an AttributionContext for a server request.
 *
 * @param body     - Parsed request body (may be undefined or non-object)
 * @param functionId - The function identifier for this endpoint (auto-injected, never from body)
 */
export function extractAttribution(body: unknown, functionId: string): AttributionContext {
  const ctx: AttributionContext = { functionId };

  if (isRecord(body)) {
    if (typeof body.projectId === "string" && body.projectId.trim()) {
      ctx.projectId = body.projectId.trim();
    }
    if (typeof body.traceId === "string" && body.traceId.trim()) {
      ctx.traceId = body.traceId.trim();
    } else {
      ctx.traceId = crypto.randomUUID();
    }
    if (isStringRecord(body.tags)) {
      ctx.tags = body.tags;
    }
  } else {
    ctx.traceId = crypto.randomUUID();
  }

  return ctx;
}
