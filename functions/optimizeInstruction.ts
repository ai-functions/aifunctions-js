/**
 * Single-instruction LLM optimizer for clarity/brevity. Used by content:sync:optimize and REST /optimize/instructions.
 */
import { callAI } from "./callAI.js";

const SYSTEM_WEAK = `You optimize skill instructions for small/local models. Keep the instruction clear and short. Preserve the exact meaning and the required JSON/output contract. Do not add new requirements. Output only a JSON object with one key "optimized" whose value is the optimized instruction text (plain string, no markdown).`;

const SYSTEM_NORMAL = `You optimize skill instructions for clarity and brevity. Preserve the exact meaning and the required JSON/output contract. Do not add new requirements. Output only a JSON object with one key "optimized" whose value is the optimized instruction text (plain string, no markdown).`;

export type OptimizeInstructionResult = {
  optimized: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  durationMs: number;
};

export type OptimizeInstructionOptions = {
  client?: import("../src/index.js").Client;
  model?: string;
};

export async function optimizeInstruction(
  instructionText: string,
  mode: "weak" | "normal",
  skillName: string,
  options?: OptimizeInstructionOptions
): Promise<OptimizeInstructionResult> {
  const start = Date.now();
  const system = mode === "weak" ? SYSTEM_WEAK : SYSTEM_NORMAL;
  const prompt = `Skill: ${skillName}. Mode: ${mode}.\n\nCurrent instruction:\n\n${instructionText}`;

  const result = await callAI<{ optimized: string }>({
    ...(options?.client && { client: options.client as never }),
    mode: "normal",
    instructions: { weak: system, normal: system },
    prompt,
    model: options?.model,
  });

  const durationMs = Date.now() - start;
  const optimized =
    typeof result.data?.optimized === "string" ? result.data.optimized.trim() : instructionText;

  return {
    optimized,
    usage: result.usage,
    durationMs,
  };
}
