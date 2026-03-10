/**
 * Legacy adapter: implements FunctionContentProvider by delegating to an
 * existing nx-content ContentResolver. Enables backward compatibility so
 * the runtime can use the provider abstraction while still supporting
 * getSkillsResolver()-based setups. Content source is reported as "inline"
 * for type compatibility.
 */

import type { ContentResolver } from "nx-content";
import {
  getFunctionMeta,
  getSkillInstructions,
  getSkillNamesFromContent,
  getSkillRules,
  getSkillTestCases,
  resolveSkillInstructions,
} from "./skillsResolver.js";
import type {
  FunctionContentProvider,
  GetFunctionContentInput,
  HasFunctionInput,
  ListFunctionsInput,
  ResolvedFunctionContent,
} from "./functionContentProvider.js";

export class ResolverBackedContentProvider implements FunctionContentProvider {
  constructor(private readonly resolver: ContentResolver) {}

  async getFunctionContent(
    input: GetFunctionContentInput
  ): Promise<ResolvedFunctionContent> {
    const id = input.functionId;
    const [weak, strong, ultra] = await Promise.all([
      resolveSkillInstructions(this.resolver, id, "weak").catch(() => ""),
      getSkillInstructions(this.resolver, id),
      resolveSkillInstructions(this.resolver, id, "ultra").catch(() => ""),
    ]);
    const rules = await getSkillRules(this.resolver, id);
    const meta = await getFunctionMeta(this.resolver, id);
    const testCases = await getSkillTestCases(this.resolver, id);

    return {
      functionId: id,
      instructions: { weak: weak || undefined, strong: strong || undefined, ultra: ultra || undefined },
      rules,
      meta: meta as Record<string, unknown>,
      testCases,
      source: { mode: "inline" },
    };
  }

  async hasFunction(input: HasFunctionInput): Promise<boolean> {
    const names = await getSkillNamesFromContent(this.resolver);
    return names.includes(input.functionId);
  }

  async listFunctions(_input?: ListFunctionsInput): Promise<string[]> {
    return getSkillNamesFromContent(this.resolver);
  }
}
