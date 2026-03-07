/**
 * Generate good/bad examples for a function from its instructions (description).
 * Used by the coverage pipeline and by the HTTP POST /functions/generate-examples handler.
 */
import type { Client } from "../core/types.js";
import { getModePreset } from "../core/modePreset.js";
import { getModelOverrides } from "../env.js";

export type GeneratedExample = {
  input: unknown;
  goodOutput: unknown;
  goodRationale: string;
  badOutput: unknown;
  badRationale: string;
};

/** Extract JSON array from model response; handles optional markdown code fence. */
export function parseGenerateExamplesResponse(
  text: string
): Array<{
  input?: unknown;
  goodOutput?: unknown;
  goodRationale?: string;
  badOutput?: unknown;
  badRationale?: string;
}> {
  let raw = text.trim();
  const codeMatch = raw.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  if (codeMatch) raw = codeMatch[1]!.trim();
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (x): x is Record<string, unknown> => typeof x === "object" && x !== null
  );
}

/**
 * Generate diverse good/bad examples for an AI function from its instructions.
 * Uses the same LLM prompt as the HTTP generate-examples endpoint.
 */
export async function generateExamplesForFunction(opts: {
  instructions: string;
  functionId: string;
  count?: number;
  client: Client;
}): Promise<GeneratedExample[]> {
  const count = Math.min(10, Math.max(1, opts.count ?? 5));
  const preset = getModePreset("strong");
  const overrides = getModelOverrides();
  const model = overrides.strong ?? preset.model;
  if (!model) {
    throw new Error(
      "generateExamplesForFunction requires OpenRouter (set LLM_MODEL_STRONG or use createClient with openrouter)"
    );
  }

  const prompt = `You are helping create training examples for an AI function. Given this description, generate exactly ${count} diverse examples. Each example must have:
- input: an object (e.g. { "text": "..." } or similar) representing one input case
- goodOutput: the correct/ideal output for that input
- goodRationale: one sentence why this output is correct
- badOutput: an incorrect or suboptimal output for the same input
- badRationale: one sentence why this output is wrong or worse

Description: ${opts.instructions.trim()}

Return a JSON array of ${count} objects, each with keys: input, goodOutput, goodRationale, badOutput, badRationale. No other commentary.`;

  const result = await opts.client.ask(prompt, {
    model,
    temperature: 0.3,
    maxTokens: 4096,
  });

  const raw = parseGenerateExamplesResponse(result.text);
  return raw.map((x) => ({
    input: x.input,
    goodOutput: x.goodOutput,
    goodRationale: typeof x.goodRationale === "string" ? x.goodRationale : "",
    badOutput: x.badOutput,
    badRationale: typeof x.badRationale === "string" ? x.badRationale : "",
  }));
}
