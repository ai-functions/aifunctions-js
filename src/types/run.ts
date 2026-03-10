/**
 * Run input types. functionId, scopeId, profile are the runtime scoping primitives.
 * projectId is analytics-only and must not influence scope/profile resolution.
 */

import type { ProfileKey } from "../content/scopedRuntime.js";

export interface AiFunctionRunInput {
  /** Function to run. */
  functionId: string;
  /** Scope for applied profile / release. Omit for default scope. */
  scopeId?: string;
  /** Profile key (best, cheapest, fastest, balanced) for model selection. */
  profile?: ProfileKey;
  /** Optional explicit model override; override only, not primary routing. */
  modelOverride?: string;
  /** Request payload for the function (e.g. inputMd, input, etc.). */
  request?: unknown;
  /** Analytics attribution only; must not influence scope or profile resolution. */
  projectId?: string;
  traceId?: string;
}
