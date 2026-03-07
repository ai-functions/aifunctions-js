export type UpdateLibraryIndexCliArgs = {
  dryRun: boolean;
  staticOnly: boolean;
  incremental: boolean;
  force: boolean;
  includeBuiltIn: boolean;
  judgeAfterIndex: boolean;
  prefix: string;
  mode: "weak" | "normal" | "strong";
  model?: string;
};

function parseArg(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.split("=")[1]?.trim() : undefined;
}

function parseBoolArg(args: string[], name: string, defaultValue: boolean): boolean {
  if (args.includes(`--${name}`)) return true;
  if (args.includes(`--no-${name}`)) return false;
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (!eq) return defaultValue;
  const raw = eq.split("=")[1]?.toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return defaultValue;
}

export function parseUpdateLibraryIndexCliArgs(args: string[]): UpdateLibraryIndexCliArgs {
  return {
    dryRun: args.includes("--dry-run"),
    staticOnly: args.includes("--static-only"),
    incremental: args.includes("--incremental"),
    force: args.includes("--force"),
    includeBuiltIn: parseBoolArg(args, "include-built-in", true),
    judgeAfterIndex: args.includes("--judge-after-index"),
    prefix: parseArg(args, "prefix") ?? "functions/",
    mode: (parseArg(args, "mode") ?? "normal") as "weak" | "normal" | "strong",
    model: parseArg(args, "model"),
  };
}
