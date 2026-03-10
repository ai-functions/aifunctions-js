/**
 * Canonical store key mapping for function content.
 * Used by SharedStoreContentProvider and any compatible store server.
 * Keep this module dedicated so key layout can evolve independently.
 *
 * Key layout:
 *   functions/<functionId>/strong
 *   functions/<functionId>/weak
 *   functions/<functionId>/ultra
 *   functions/<functionId>/rules
 *   functions/<functionId>/meta.json
 *   functions/<functionId>/test-cases.json
 */

const CONTENT_PREFIX = "functions/";

/** Normalize a functionId segment for use in keys (lowercase, spaces/dots to hyphens). */
export function normalizeFunctionIdSegment(functionId: string): string {
  return functionId
    .toLowerCase()
    .trim()
    .replace(/[\s.]+/g, "-")
    .replace(/\\/g, "");
}

export type FunctionStoreKeys = {
  strong: string;
  weak: string;
  ultra: string;
  rules: string;
  metaJson: string;
  testCasesJson: string;
};

/**
 * Return canonical store keys for a function.
 * All providers and store servers should use this layout.
 */
export function getStoreKeys(functionId: string): FunctionStoreKeys {
  const segment = normalizeFunctionIdSegment(functionId);
  const base = `${CONTENT_PREFIX}${segment}`;
  return {
    strong: `${base}/strong`,
    weak: `${base}/weak`,
    ultra: `${base}/ultra`,
    rules: `${base}/rules`,
    metaJson: `${base}/meta.json`,
    testCasesJson: `${base}/test-cases.json`,
  };
}
