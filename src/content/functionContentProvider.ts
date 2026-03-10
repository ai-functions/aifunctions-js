/**
 * Unified content-loading abstraction for aiFunctions-js.
 * All runtime resolution of function content goes through FunctionContentProvider.
 * Supports two modes: shared-store (HTTP to store server) and inline (config).
 */

/** Instruction variant keys; API "normal" maps to strong. */
export type InstructionMode = "strong" | "weak" | "ultra";

/** Normalized runtime content for one function. All providers produce this shape. */
export interface ResolvedFunctionContent {
  functionId: string;
  instructions: Partial<Record<InstructionMode, string>>;
  rules?: unknown;
  meta?: Record<string, unknown>;
  testCases?: unknown[];
  source: {
    mode: "shared-store" | "inline";
    storeId?: string;
    baseUrl?: string;
  };
}

export interface GetFunctionContentInput {
  functionId: string;
}

export interface HasFunctionInput {
  functionId: string;
}

export interface ListFunctionsInput {
  /** Optional prefix or filter; implementation-defined. */
  prefix?: string;
}

/**
 * Single entry point for resolving function content in the runtime.
 * No direct access to files, Git, or storage—only through this provider.
 */
export interface FunctionContentProvider {
  getFunctionContent(input: GetFunctionContentInput): Promise<ResolvedFunctionContent>;
  hasFunction?(input: HasFunctionInput): Promise<boolean>;
  listFunctions?(input?: ListFunctionsInput): Promise<string[]>;
}

/** Per-function definition for inline mode. */
export interface InlineFunctionDefinition {
  functionId: string;
  instructions?: Partial<Record<InstructionMode, string>>;
  rules?: unknown;
  meta?: Record<string, unknown>;
  testCases?: unknown[];
}

export interface SharedStoreConfig {
  baseUrl?: string;
  storeId?: string;
  publishableKey?: string;
  secretKey?: string;
}

export interface AiFunctionsContentConfig {
  mode: "shared-store" | "inline";
  sharedStore?: SharedStoreConfig;
  inline?: {
    functions: InlineFunctionDefinition[];
  };
}

/** Minimal store client interface for SharedStoreContentProvider. Real client can be wired when available. */
export interface StoreClient {
  get(key: string): Promise<string>;
  listKeys?(prefix: string): Promise<string[]>;
}

// Factory is in createFunctionContentProvider.ts to avoid circular deps with provider implementations.
