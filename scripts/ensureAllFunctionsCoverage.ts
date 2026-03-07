#!/usr/bin/env node
/**
 * Ensure all functions have coverage artifacts:
 * - rules (existing or generated),
 * - judged validation metadata,
 * - race profile (existing or initialized),
 * then rebuild index + fallback files.
 *
 * Usage:
 *   npm run build && tsx scripts/ensureAllFunctionsCoverage.ts
 *   npm run build && tsx scripts/ensureAllFunctionsCoverage.ts --dry-run --no-llm
 *   npm run build && tsx scripts/ensureAllFunctionsCoverage.ts --functions=classify,judge
 */
import { loadDotenv } from "nx-config2";
import { mkdir, writeFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load .env as a self-contained fallback for direct invocation (npm scripts use nx-config2 run --env-file .env).
loadDotenv(".env");

import {
  buildFullLibrarySnapshot,
  DEFAULT_FULL_LIBRARY_DOCS_PATH,
  getFunctionMeta,
  getModePreset,
  getProfiles,
  getSkillInstructions,
  getSkillNamesFromContent,
  getSkillRules,
  getSkillTestCases,
  getSkillsResolver,
  setFunctionMeta,
  setProfiles,
  setSkillRules,
  setSkillTestCases,
  updateLibraryIndex,
  writeFullLibrarySnapshot,
  createClient,
  generateExamplesForFunction,
} from "../src/index.js";
import {
  dedupeFunctionIds,
  runAllFunctionsCoverage,
  type CoverageDeps,
  type CoverageProgressEvent,
} from "../src/content/coverageOrchestrator.js";
import {
  generateJudgeRules,
  getSkillNames,
  judge,
  raceModels,
  type JudgeRule,
} from "../dist/functions/index.js";
import { fetchOpenRouterCredits } from "../src/serve/analyticsOpenRouter.js";
import { getOpenRouterEnv } from "../src/env.js";
import { getBuiltInAbilityManifest } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const coverageDir = path.join(rootDir, "reports", "coverage");
const coverageJsonPath = path.join(coverageDir, "all-functions-coverage.json");
const coverageMdPath = path.join(coverageDir, "all-functions-coverage.md");

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function parseArg(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.split("=")[1]?.trim() : undefined;
}

function parseFunctionsArg(args: string[]): string[] | undefined {
  const list = parseArg(args, "functions");
  if (!list) return undefined;
  const parsed = list.split(",").map((s) => s.trim()).filter(Boolean);
  return parsed.length > 0 ? dedupeFunctionIds(parsed) : undefined;
}

function reportMarkdown(
  report: Awaited<ReturnType<typeof runAllFunctionsCoverage>>,
  keyStatus: { state: string; balanceUsd?: number | null; usageUsd?: number; unlimited?: boolean; error?: string }
): string {
  const keyLine =
    keyStatus.state === "no-key"
      ? "No API key (set OPENROUTER_API_KEY or OPEN_ROUTER_KEY)"
      : keyStatus.state === "invalid"
      ? `Invalid key — ${keyStatus.error}`
      : keyStatus.state === "no-credits"
      ? `No credits — prepaid balance exhausted ($${keyStatus.balanceUsd?.toFixed(4)}, used $${keyStatus.usageUsd?.toFixed(4)})`
      : keyStatus.state === "low-credits"
      ? `Low credits (balance $${keyStatus.balanceUsd?.toFixed(4)}, used $${keyStatus.usageUsd?.toFixed(4)})`
      : keyStatus.unlimited
      ? `OK — pay-as-you-go (no spending cap, used $${keyStatus.usageUsd?.toFixed(4)})`
      : `OK (balance $${keyStatus.balanceUsd?.toFixed(4)}, used $${keyStatus.usageUsd?.toFixed(4)})`;

  const lines: string[] = [
    "# All Functions Coverage Report",
    "",
    `Generated: ${report.generatedAt}`,
    `API key status: ${keyLine}`,
    "",
    `Total functions: ${report.totalFunctions}`,
    `Rules generated: ${report.summary.rulesGenerated}`,
    `Examples generated: ${report.summary.examplesGenerated}`,
    `Judged: ${report.summary.judged}`,
    `Raced(existing or new): ${report.summary.raced}`,
    `Skipped: ${report.summary.skipped}`,
    `Failed: ${report.summary.failed}`,
    "",
    "| Function | Rules | Examples | Judged | Raced | Skipped reasons | Errors |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const row of report.functions) {
    lines.push(
      `| ${row.functionId} | ${row.rules} | ${row.examples} | ${row.judged} | ${row.raced} | ${row.skippedReasons.join(", ") || "-"} | ${row.errors.join(" ; ") || "-"} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

/** Build a minimal instruction string from a built-in manifest entry. */
function instructionsFromManifest(functionId: string): string {
  const entry = getBuiltInAbilityManifest().find((e) => e.id === functionId);
  if (!entry) return "";
  const inputFields = Object.keys(entry.io.input.properties ?? {}).join(", ");
  const outputFields = Object.keys(entry.io.output.properties ?? {}).join(", ");
  return [
    entry.description,
    `Input fields: ${inputFields || "unspecified"}.`,
    `Output fields: ${outputFields || "unspecified"}.`,
    entry.examples.length > 0
      ? `Example: input ${JSON.stringify(entry.examples[0].input)} → output ${JSON.stringify(entry.examples[0].output)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function toRaceModels(functionId: string, instructions: string) {
  const normal = process.env.LLM_MODEL_NORMAL ?? getModePreset("normal").model;
  const strong = process.env.LLM_MODEL_STRONG ?? getModePreset("strong").model;
  const models = [
    normal ? { id: "normal", model: normal, class: "normal" as const } : null,
    strong ? { id: "strong", model: strong, class: "strong" as const } : null,
  ].filter(Boolean) as Array<{ id: string; model: string; class: "normal" | "strong" }>;
  return {
    taskName: `coverage:${functionId}`,
    call: "ask" as const,
    skill: { strongSystem: instructions },
    threshold: 0.8,
    models,
  };
}

async function copyAggregateFallback(resolver: ReturnType<typeof getSkillsResolver>): Promise<void> {
  const raw = await resolver.get("functions/index.v1.json");
  const docsPath = path.join(rootDir, ".docs", "library-index.fallback.json");
  await writeFile(docsPath, typeof raw === "string" ? raw : JSON.stringify(raw, null, 2), "utf-8");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = hasFlag(args, "--dry-run");
  const aiEnabled = !hasFlag(args, "--no-llm");
  const includeFunctionIds = parseFunctionsArg(args);
  const resolver = getSkillsResolver({ localRoot: path.join(rootDir, ".content"), mode: "dev" });

  type KeyStatus =
    | { state: "no-key" }
    | { state: "invalid"; error: string }
    | { state: "no-credits"; balanceUsd: number; usageUsd: number }
    | { state: "low-credits"; balanceUsd: number; usageUsd: number }
    | { state: "ok"; balanceUsd: number | null; usageUsd: number; unlimited: boolean };

  let client: ReturnType<typeof createClient> | null = null;
  let keyStatus: KeyStatus = { state: "no-key" };

  if (aiEnabled) {
    const { apiKey } = getOpenRouterEnv();
    if (!apiKey) {
      keyStatus = { state: "no-key" };
      console.warn("  [key] No API key found. Set OPENROUTER_API_KEY or OPEN_ROUTER_KEY in .env");
    } else {
      try {
        const credits = await fetchOpenRouterCredits(apiKey);
        if (credits.isUnlimited) {
          // null limit = pay-as-you-go, no hard cap — always ok
          keyStatus = { state: "ok", balanceUsd: null, usageUsd: credits.usage, unlimited: true };
        } else if (credits.balance !== null && credits.balance <= 0) {
          keyStatus = { state: "no-credits", balanceUsd: credits.balance, usageUsd: credits.usage };
          console.warn(`  [key] API key is valid but prepaid balance is exhausted ($${credits.balance.toFixed(4)}) — LLM steps will be skipped`);
        } else if (credits.balance !== null && credits.balance < 0.10) {
          keyStatus = { state: "low-credits", balanceUsd: credits.balance, usageUsd: credits.usage };
          console.warn(`  [key] Low credit balance: $${credits.balance.toFixed(4)} remaining — LLM steps may fail mid-run`);
        } else {
          keyStatus = { state: "ok", balanceUsd: credits.balance, usageUsd: credits.usage, unlimited: false };
        }

        const canUseLlm = keyStatus.state === "ok" || keyStatus.state === "low-credits";
        if (canUseLlm) {
          client = createClient({ backend: "openrouter" });
          const connected = await client.testConnection().catch(() => false);
          if (!connected) {
            keyStatus = { state: "invalid", error: "testConnection() returned false" };
            client = null;
          }
        }
      } catch (err) {
        keyStatus = { state: "invalid", error: err instanceof Error ? err.message : String(err) };
        console.warn(`  [key] API key check failed: ${keyStatus.error}`);
      }
    }
  }

  const effectiveAiEnabled = Boolean(aiEnabled && client);

  const deps: CoverageDeps = {
    listFunctionIds: async () => getSkillNames(),
    listContentFunctionIds: async () => getSkillNamesFromContent(resolver),
    getRules: async (functionId) => getSkillRules(resolver, functionId),
    setRules: async (functionId, rules) => setSkillRules(resolver, functionId, rules),
    getInstructions: async (functionId) => {
      const fromContent = await getSkillInstructions(resolver, functionId);
      if (fromContent.trim()) return fromContent;
      // Fall back to built-in manifest description + I/O summary.
      return instructionsFromManifest(functionId);
    },
    generateRules: async (_functionId, instructions) => {
      if (!client) return [];
      const out = await generateJudgeRules({
        instructions,
        mode: "strong",
        client,
      });
      // The LLM may return { description, id, weight } instead of { rule, weight }.
      // Normalize to the canonical JudgeRule shape before storing or displaying.
      return ((out.rules ?? []) as unknown[])
        .map((r) => {
          const o = r as Record<string, unknown>;
          const text = (o.rule ?? o.description ?? o.text ?? "") as string;
          const weight = typeof o.weight === "number" ? o.weight : 1;
          return { rule: text.trim(), weight };
        })
        .filter((r) => r.rule.length > 0) as JudgeRule[];
    },
    getTestCases: async (functionId) => getSkillTestCases(resolver, functionId),
    generateTestCases: async (functionId, instructions, rules) => {
      if (!client) return { testCases: [], passRate: 0 };
      const examples = await generateExamplesForFunction({
        instructions,
        functionId,
        count: 3,
        client,
      });
      if (examples.length === 0) return { testCases: [], passRate: 0 };
      let passed = 0;
      const testCases = await Promise.all(
        examples.map(async (ex, i) => {
          const goodOutputMd =
            typeof ex.goodOutput === "string"
              ? ex.goodOutput
              : JSON.stringify(ex.goodOutput);
          const judged = await judge({
            instructions,
            response: goodOutputMd,
            rules: rules as JudgeRule[],
            threshold: 0.8,
            mode: "strong",
            client,
          });
          if (judged.pass) passed += 1;
          return {
            id: `generated-${i + 1}`,
            inputMd: typeof ex.input === "string" ? ex.input : JSON.stringify(ex.input),
            expectedOutputMd: goodOutputMd,
          };
        })
      );
      return {
        testCases,
        passRate: testCases.length > 0 ? passed / testCases.length : 0,
      };
    },
    setTestCases: async (functionId, testCases) =>
      setSkillTestCases(resolver, functionId, testCases),
    judge: async (_functionId, input) => {
      if (!client) return { scoreNormalized: 0, pass: false };
      const out = await judge({
        instructions: input.instructions,
        response: input.response,
        rules: input.rules as JudgeRule[],
        threshold: input.threshold,
        mode: "strong",
        client,
      });
      return {
        scoreNormalized: out.scoreNormalized,
        pass: out.pass,
        failedRules: out.failedRules,
        summary: out.summary,
      };
    },
    setValidation: async (functionId, validation) => {
      const meta = await getFunctionMeta(resolver, functionId);
      await setFunctionMeta(resolver, functionId, {
        ...meta,
        lastValidation: validation,
      });
    },
    getRaceProfile: async (functionId) => {
      const { profiles } = await getProfiles(resolver, functionId);
      return { bestModel: profiles?.best?.model };
    },
    race: async (functionId, input) => {
      if (!client) return null;
      const testCases = input.testCases
        .slice(0, 3)
        .map((tc) => ({ id: tc.id, inputMd: tc.inputMd }));
      if (testCases.length === 0) return null;
      const req = toRaceModels(functionId, input.instructions);
      if (req.models.length === 0) return null;
      const out = await raceModels({
        ...req,
        testCases,
        client,
      });
      const best = req.models.find((m) => m.id === out.bestModelId);
      if (!best?.model) return null;
      return {
        bestModel: best.model,
        ranking: out.ranking.map((r) => ({
          modelId: req.models.find((m) => m.id === r.modelId)?.model ?? r.modelId,
          avgScore: r.avgScoreNormalized,
          passRate: r.passRate,
        })),
      };
    },
    setRaceProfile: async (functionId, profile) => {
      await setProfiles(resolver, functionId, {
        best: { model: profile.bestModel },
        cheapest: { model: profile.bestModel },
        fastest: { model: profile.bestModel },
        balanced: { model: profile.bestModel },
      });
    },
    finalizeArtifacts: async ({ aiEnabled: aiReady }) => {
      await updateLibraryIndex({
        resolver,
        includeBuiltIn: true,
        staticOnly: !aiReady,
        judgeAfterIndex: aiReady,
        client: client ?? undefined,
      });
      await copyAggregateFallback(resolver);
      const full = await buildFullLibrarySnapshot({ resolver });
      await writeFullLibrarySnapshot(full, path.join(rootDir, DEFAULT_FULL_LIBRARY_DOCS_PATH));
    },
    onProgress(event: CoverageProgressEvent) {
      switch (event.type) {
        case "start":
          console.log(`\n[${event.index}/${event.total}] ${event.functionId}`);
          break;
        case "rules":
          if (event.result === "skipped" && event.detail?.endsWith("…")) {
            process.stdout.write(`  rules: ${event.detail} `);
          } else if (event.result === "generated") {
            console.log(`  rules: generated (${event.detail})`);
            for (const r of event.sampleRules ?? []) {
              console.log(`    [w${r.weight}] ${r.rule}`);
            }
            const total = parseInt(event.detail ?? "0");
            if ((event.sampleRules?.length ?? 0) < total) {
              console.log(`    … +${total - (event.sampleRules?.length ?? 0)} more`);
            }
          } else if (event.result === "existing") {
            console.log(`  rules: existing (${event.detail})`);
          } else if (event.result === "failed") {
            console.log(`  rules: FAILED — ${event.detail}`);
          } else {
            console.log(`  rules: skipped (${event.detail})`);
          }
          break;
        case "examples":
          if (event.result === "skipped" && event.detail?.endsWith("…")) {
            process.stdout.write(`  examples: ${event.detail} `);
          } else if (event.result === "generated") {
            const pct = event.passRate != null ? (event.passRate * 100).toFixed(0) : "?";
            console.log(`  examples: generated (${event.count ?? 0} cases, ${pct}% passed validation)`);
          } else if (event.result === "existing") {
            console.log(`  examples: existing (${event.detail})`);
          } else if (event.result === "failed") {
            console.log(`  examples: FAILED — ${event.detail}`);
          } else {
            console.log(`  examples: skipped (${event.detail})`);
          }
          break;
        case "judge":
          if (event.result === "skipped" && event.detail?.endsWith("…")) {
            process.stdout.write(`  judge: ${event.detail} `);
          } else if (event.result === "judged") {
            const pct = ((event.score ?? 0) * 100).toFixed(0);
            const mark = event.pass ? "✓" : "✗";
            console.log(`  judge: ${mark} ${pct}%`);
            if (event.summary) console.log(`    ${event.summary}`);
            for (const fr of event.failedRules ?? []) {
              console.log(`    ✗ ${fr}`);
            }
          } else if (event.result === "failed") {
            console.log(`  judge: FAILED — ${event.detail}`);
          } else {
            console.log(`  judge: skipped (${event.detail})`);
          }
          break;
        case "race":
          if (event.result === "skipped" && event.detail?.endsWith("…")) {
            process.stdout.write(`  race: ${event.detail} `);
          } else if (event.result === "raced") {
            console.log(`  race: best → ${event.bestModel}`);
            for (const r of event.ranking ?? []) {
              const score = (r.avgScore * 100).toFixed(0);
              const pass = (r.passRate * 100).toFixed(0);
              console.log(`    ${r.modelId}: ${score}% avg, ${pass}% pass`);
            }
          } else if (event.result === "existing") {
            console.log(`  race: existing (${event.bestModel})`);
          } else if (event.result === "failed") {
            console.log(`  race: FAILED — ${event.detail}`);
          } else {
            console.log(`  race: skipped (${event.detail})`);
          }
          break;
        case "finalize":
          console.log(`\nfinalize: ${event.detail}`);
          break;
      }
    },
  };

  const report = await runAllFunctionsCoverage(deps, {
    aiEnabled: effectiveAiEnabled,
    dryRun,
    threshold: 0.8,
    includeFunctionIds,
  });

  await mkdir(coverageDir, { recursive: true });
  await writeFile(coverageJsonPath, JSON.stringify({ keyStatus, ...report }, null, 2), "utf-8");
  await writeFile(coverageMdPath, reportMarkdown(report, keyStatus), "utf-8");

  const keyLine = keyStatus.state === "no-key"
    ? "no-key (set OPENROUTER_API_KEY or OPEN_ROUTER_KEY in .env)"
    : keyStatus.state === "invalid"
    ? `invalid — ${keyStatus.error}`
    : keyStatus.state === "no-credits"
    ? `no-credits (prepaid balance exhausted: $${keyStatus.balanceUsd.toFixed(4)}, used $${keyStatus.usageUsd.toFixed(4)})`
    : keyStatus.state === "low-credits"
    ? `low-credits (balance $${keyStatus.balanceUsd.toFixed(4)}, used $${keyStatus.usageUsd.toFixed(4)})`
    : keyStatus.unlimited
    ? `ok — pay-as-you-go (no spending cap, used $${keyStatus.usageUsd.toFixed(4)})`
    : `ok (balance $${keyStatus.balanceUsd!.toFixed(4)}, used $${keyStatus.usageUsd.toFixed(4)})`;

  console.log("All functions coverage complete.");
  console.log(`  key: ${keyLine}`);
  console.log(`  total: ${report.totalFunctions}`);
  console.log(`  rulesGenerated: ${report.summary.rulesGenerated}`);
  console.log(`  examplesGenerated: ${report.summary.examplesGenerated}`);
  console.log(`  judged: ${report.summary.judged}`);
  console.log(`  raced: ${report.summary.raced}`);
  console.log(`  skipped: ${report.summary.skipped}`);
  console.log(`  failed: ${report.summary.failed}`);
  console.log(`  aiEnabled: ${effectiveAiEnabled}`);
  console.log(`  dryRun: ${dryRun}`);
  console.log(`  report: ${coverageJsonPath}`);
  if (!dryRun && fs.existsSync(path.join(rootDir, DEFAULT_FULL_LIBRARY_DOCS_PATH))) {
    console.log(`  full fallback: ${DEFAULT_FULL_LIBRARY_DOCS_PATH}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
