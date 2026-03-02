/**
 * Re-exports callOpenAI from the x-llm package.
 * This keeps the functions/ directory self-contained while avoiding duplication.
 * Note: x-llm ships no .d.ts — full typing lives in the individual function files.
 */
// @ts-ignore – x-llm has no type declarations; typed wrappers are in each function file
export { callOpenAI } from "x-llm";
