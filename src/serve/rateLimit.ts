/**
 * Per-key rate limit: 60 requests per minute (fixed window).
 * Key = x-openrouter-key header or "server" when not provided.
 * Used to set X-RateLimit-Remaining and X-RateLimit-Reset on run responses.
 */

const MAX_PER_MINUTE = Math.max(1, Number(process.env.RATE_LIMIT_PER_MINUTE) || 60);
const WINDOW_MS = 60_000;

type Window = { count: number; windowEndMs: number };

const windows = new Map<string, Window>();

function getWindow(key: string): Window {
  const now = Date.now();
  let w = windows.get(key);
  if (!w || now >= w.windowEndMs) {
    w = { count: 0, windowEndMs: now + WINDOW_MS };
    windows.set(key, w);
  }
  return w;
}

/**
 * Derive rate-limit key from request (BYOK or server).
 */
export function getRateLimitKey(req: import("node:http").IncomingMessage): string {
  const h = req.headers["x-openrouter-key"];
  const key = (Array.isArray(h) ? h[0] : h)?.trim();
  return key && key.length > 0 ? key : "server";
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  reset: number;
};

/**
 * Consume one slot for the key. Returns whether the request is allowed and
 * the remaining count and reset time (Unix seconds) for response headers.
 */
export function consumeRateLimit(key: string): RateLimitResult {
  const w = getWindow(key);
  const now = Date.now();
  if (now >= w.windowEndMs) {
    w.count = 0;
    w.windowEndMs = now + WINDOW_MS;
  }
  w.count += 1;
  const allowed = w.count <= MAX_PER_MINUTE;
  const remaining = Math.max(0, MAX_PER_MINUTE - w.count);
  const reset = Math.ceil(w.windowEndMs / 1000);
  return { allowed, remaining, reset };
}

/**
 * Headers to set on rate-limited responses (run and other LLM endpoints).
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
  };
}
