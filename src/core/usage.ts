import type { Usage } from "./types.js";

export function normalizeUsage(partial: Partial<Usage> | undefined): Usage {
  const p = partial?.prompt_tokens ?? 0;
  const c = partial?.completion_tokens ?? 0;
  const t = partial?.total_tokens ?? p + c;
  const base: Usage = {
    prompt_tokens: p,
    completion_tokens: c,
    total_tokens: t,
  };
  if (partial && typeof partial === "object") {
    for (const k of Object.keys(partial)) {
      if (k !== "prompt_tokens" && k !== "completion_tokens" && k !== "total_tokens") {
        (base as Record<string, unknown>)[k] = (partial as Record<string, unknown>)[k];
      }
    }
  }
  return base;
}
