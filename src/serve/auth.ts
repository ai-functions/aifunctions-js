/**
 * Optional API key auth: when LIGHT_SKILLS_API_KEY is set, require x-api-key header.
 */
import type { IncomingMessage } from "node:http";

const API_KEY = process.env.LIGHT_SKILLS_API_KEY;

export function requireAuth(req: IncomingMessage): { ok: true } | { ok: false; status: number; message: string } {
  if (!API_KEY || API_KEY.trim() === "") {
    return { ok: true };
  }
  const header = req.headers["x-api-key"];
  const key = typeof header === "string" ? header.trim() : Array.isArray(header) ? header[0]?.trim() : undefined;
  if (key === API_KEY) {
    return { ok: true };
  }
  if (!key) {
    return { ok: false, status: 401, message: "Missing x-api-key header" };
  }
  return { ok: false, status: 403, message: "Invalid API key" };
}
