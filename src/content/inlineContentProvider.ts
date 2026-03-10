/**
 * Resolves function content from runtime configuration (inline mode).
 * No external store; content is provided in code at initialization.
 */

import { FunctionContentNotFoundError } from "./functionContentErrors.js";
import type {
  FunctionContentProvider,
  GetFunctionContentInput,
  HasFunctionInput,
  InlineFunctionDefinition,
  ListFunctionsInput,
  ResolvedFunctionContent,
} from "./functionContentProvider.js";

function normalizeInstructions(
  instructions?: Partial<Record<"strong" | "weak" | "ultra", string>>
): Partial<Record<"strong" | "weak" | "ultra", string>> {
  if (!instructions || typeof instructions !== "object") return {};
  const out: Partial<Record<"strong" | "weak" | "ultra", string>> = {};
  for (const k of ["strong", "weak", "ultra"] as const) {
    const v = instructions[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function normalizeToResolved(
  def: InlineFunctionDefinition
): ResolvedFunctionContent {
  return {
    functionId: def.functionId,
    instructions: normalizeInstructions(def.instructions),
    rules: def.rules,
    meta: def.meta && typeof def.meta === "object" && !Array.isArray(def.meta)
      ? (def.meta as Record<string, unknown>)
      : undefined,
    testCases: Array.isArray(def.testCases) ? def.testCases : undefined,
    source: { mode: "inline" },
  };
}

export class InlineContentProvider implements FunctionContentProvider {
  private readonly byId: Map<string, InlineFunctionDefinition>;

  constructor(functions: InlineFunctionDefinition[]) {
    this.byId = new Map(
      functions.map((f) => [f.functionId, f])
    );
  }

  async getFunctionContent(
    input: GetFunctionContentInput
  ): Promise<ResolvedFunctionContent> {
    const def = this.byId.get(input.functionId);
    if (!def) {
      throw new FunctionContentNotFoundError(
        `Function not found: ${input.functionId}`,
        { functionId: input.functionId }
      );
    }
    return normalizeToResolved(def);
  }

  async hasFunction(input: HasFunctionInput): Promise<boolean> {
    return this.byId.has(input.functionId);
  }

  async listFunctions(_input?: ListFunctionsInput): Promise<string[]> {
    return [...this.byId.keys()];
  }
}
