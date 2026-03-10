/**
 * Factory: create the correct FunctionContentProvider from AiFunctionsContentConfig.
 */

import { FunctionContentConfigError } from "./functionContentErrors.js";
import type { AiFunctionsContentConfig, FunctionContentProvider } from "./functionContentProvider.js";
import { InlineContentProvider } from "./inlineContentProvider.js";
import { ResolverBackedContentProvider } from "./resolverBackedContentProvider.js";
import { SharedStoreContentProvider } from "./sharedStoreContentProvider.js";
import { getSkillsResolver } from "./skillsResolver.js";

/**
 * Create the appropriate provider from config.
 * @throws FunctionContentConfigError when config is invalid or missing for the chosen mode
 */
export function createFunctionContentProvider(
  config: AiFunctionsContentConfig
): FunctionContentProvider {
  if (config.mode === "shared-store") {
    if (!config.sharedStore) {
      throw new FunctionContentConfigError(
        "shared-store mode requires config.sharedStore"
      );
    }
    return new SharedStoreContentProvider(config.sharedStore);
  }
  if (config.mode === "inline") {
    if (!config.inline?.functions) {
      throw new FunctionContentConfigError(
        "inline mode requires config.inline.functions"
      );
    }
    return new InlineContentProvider(config.inline.functions);
  }
  const _: never = config.mode;
  throw new FunctionContentConfigError(
    `Unknown content mode: ${(config as { mode: string }).mode}`
  );
}

let defaultProvider: FunctionContentProvider | null = null;

/**
 * Default provider for backward compatibility: wraps getSkillsResolver() so the
 * runtime resolves content through the provider abstraction. Use this when no
 * AiFunctionsContentConfig is set (e.g. serve default).
 */
export function getDefaultContentProvider(): FunctionContentProvider {
  if (!defaultProvider) {
    defaultProvider = new ResolverBackedContentProvider(getSkillsResolver());
  }
  return defaultProvider;
}
