/**
 * Re-export from functions for CLI use. Run after build (uses dist/functions).
 */
export {
  optimizeInstruction,
  type OptimizeInstructionResult,
  type OptimizeInstructionOptions,
} from "../dist/functions/index.js";
