#!/usr/bin/env node
/**
 * Test, sync skill instructions to content, optionally optimize them, and (by default) push to remote.
 * Push-by-default gives the project "memory": the skills repo persists rules, instructions, and skill definitions so we can keep improving. Use --no-push only when you want to sync locally without persisting (e.g. to review before pushing).
 * 1) Ensures .content exists (clones repo if missing).
 * 2) Writes current skill instructions and rules (from manifest) to local content root. Definition of done: git remote has both instructions and rules (skills/<name>-instructions.md, skills/<name>-rules.json, and legacy keys).
 * 3) If --optimize: runs LLM optimization per skill. Legacy skills: weak + normal modes, report with both sections, writes legacy keys and file-based key (optimized normal). File-only skills: single instruction, single-section report, writes skills/<name>-instructions.md.
 * 4) Runs full test suite (build + npm test) unless --skip-tests.
 * 5) By default pushes local content to remote via nx-content's pushToRemote() so the remote stays the source of truth (memory).
 *
 * Flags:
 *   --optimize          Run optimization on each skill's instructions; write reports to reports/optimize/ and update content.
 *   --report / --no-report  When --optimize: write report files (default: true). Use --no-report to skip.
 *   --skills=name1,name2   Only run optimization on these skills (default: all).
 *   --only-file-based     Only run optimization on "new" skills (file-only, no manifest entry). Use this to run on new ones first.
 *   --skip-tests   Skip build and test; only write instructions and optionally push.
 *   --no-push      Do not push to git. Default is push (persist to remote for memory); use --no-push only to sync locally.
 *
 * Prerequisites: push = SKILLS_PUBLISHER_TOKEN or GITHUB_TOKEN. Defaults are loaded from src/config/default.content.env (package default); set env to override. Optimization = OPENROUTER_API_KEY.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { ContentResolver } from "nx-content";
import simpleGit from "simple-git";
import { DEFAULT_SKILLS_BRANCH, getSkillsRepoUrl } from "../src/content/skillsRepo.js";
import {
  getSkillInstructions,
  setSkillInstructions,
  setSkillRules,
  skillInstructionsKeyForMode,
} from "../src/content/skillsResolver.js";
import { getSkillNamesAsync } from "../dist/functions/index.js";
import { DEFAULT_SKILL_INSTRUCTIONS, DEFAULT_SKILL_RULES } from "./skillInstructionsManifest.js";
import { optimizeInstruction } from "./optimizeInstructions.js";

// Note: run after build so dist/functions exists (npm run build && tsx scripts/testOptimizeAndPush.ts)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const contentDir = path.join(rootDir, ".content");

// Package default env (e.g. GITHUB_TOKEN, GITHUB_REPO_URL); override: false so user env wins
const defaultEnvPath = path.join(rootDir, "src/config/default.content.env");
if (fs.existsSync(defaultEnvPath)) {
  dotenv.config({ path: defaultEnvPath, override: false });
}

function parseBoolArg(args: string[], name: string, defaultValue: boolean): boolean {
  if (args.includes(`--no-${name}`)) return false;
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) {
    const v = eq.split("=")[1]?.toLowerCase();
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
  }
  return defaultValue;
}

const reportsDir = path.join(rootDir, "reports", "optimize");

function buildReportMd(
  skillName: string,
  weak: { original: string; optimized: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; durationMs: number },
  normal: { original: string; optimized: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; durationMs: number }
): string {
  const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const lines: string[] = [
    `# Optimization report: ${skillName}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Weak mode",
    "",
    "### Original",
    "",
    "```",
    weak.original,
    "```",
    "",
    `Words: ${wordCount(weak.original)}`,
    "",
    "### Optimized",
    "",
    "```",
    weak.optimized,
    "```",
    "",
    `Words: ${wordCount(weak.optimized)} (${wordCount(weak.optimized) - wordCount(weak.original) >= 0 ? "+" : ""}${wordCount(weak.optimized) - wordCount(weak.original)})`,
    "",
    "### Optimization details",
    "",
    `| Metric | Value |`,
    "|--------|-------|",
    `| Duration (ms) | ${weak.durationMs} |`,
    `| Prompt tokens | ${weak.usage.promptTokens} |`,
    `| Completion tokens | ${weak.usage.completionTokens} |`,
    `| Total tokens | ${weak.usage.totalTokens} |`,
    "",
    "---",
    "",
    "## Normal mode",
    "",
    "### Original",
    "",
    "```",
    normal.original,
    "```",
    "",
    `Words: ${wordCount(normal.original)}`,
    "",
    "### Optimized",
    "",
    "```",
    normal.optimized,
    "```",
    "",
    `Words: ${wordCount(normal.optimized)} (${wordCount(normal.optimized) - wordCount(normal.original) >= 0 ? "+" : ""}${wordCount(normal.optimized) - wordCount(normal.original)})`,
    "",
    "### Optimization details",
    "",
    `| Metric | Value |`,
    "|--------|-------|",
    `| Duration (ms) | ${normal.durationMs} |`,
    `| Prompt tokens | ${normal.usage.promptTokens} |`,
    `| Completion tokens | ${normal.usage.completionTokens} |`,
    `| Total tokens | ${normal.usage.totalTokens} |`,
    "",
  ];
  return lines.join("\n");
}

/** Single-instruction report (file-based key). */
function buildReportMdSingle(
  skillName: string,
  original: string,
  optimized: string,
  usage: { promptTokens: number; completionTokens: number; totalTokens: number },
  durationMs: number
): string {
  const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  return [
    `# Optimization report: ${skillName} (file-based)`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Original",
    "",
    "```",
    original,
    "```",
    "",
    `Words: ${wordCount(original)}`,
    "",
    "## Optimized",
    "",
    "```",
    optimized,
    "```",
    "",
    `Words: ${wordCount(optimized)} (${wordCount(optimized) - wordCount(original) >= 0 ? "+" : ""}${wordCount(optimized) - wordCount(original)})`,
    "",
    "## Metrics",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| Duration (ms) | ${durationMs} |`,
    `| Prompt tokens | ${usage.promptTokens} |`,
    `| Completion tokens | ${usage.completionTokens} |`,
    `| Total tokens | ${usage.totalTokens} |`,
    "",
  ].join("\n");
}

function parseSkillsFilter(args: string[]): string[] | undefined {
  const eq = args.find((a) => a.startsWith("--skills="));
  if (!eq) return undefined;
  const list = eq.split("=")[1]?.trim();
  if (!list) return undefined;
  return list.split(",").map((s) => s.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const skipTests = args.includes("--skip-tests");
  const doOptimize = args.includes("--optimize");
  /** When --optimize, write reports unless --no-report. */
  const writeReports = parseBoolArg(args, "report", doOptimize);
  /** Only optimize these skills when set; otherwise all. */
  const skillsFilter = parseSkillsFilter(args);
  /** Only optimize file-only (new) skills when set. */
  const onlyFileBased = args.includes("--only-file-based");
  /** By default push to git so the skills repo stays our memory; set --no-push to sync locally only. */
  const pushToGit = parseBoolArg(args, "push", true);

  console.log("Content root:", contentDir);
  if (doOptimize) {
    console.log("Optimization: enabled (--optimize)");
    if (writeReports) console.log("Reports: enabled (reports/optimize/)");
    else console.log("Reports: disabled (--no-report)");
    if (skillsFilter?.length) console.log("Skills filter:", skillsFilter.join(", "));
    if (onlyFileBased) console.log("Only file-based (new) skills: yes");
  }
  if (pushToGit) {
    console.log("Push to remote: enabled (default). Use --no-push to sync locally only.");
  } else {
    console.log("Push to git: disabled (--no-push). Content is local only.");
  }

  if (!fs.existsSync(contentDir)) {
    console.log("Cloning skills repo into .content...");
    const git = simpleGit(rootDir);
    const repoUrl = getSkillsRepoUrl();
    await git.clone(repoUrl, contentDir, ["--depth", "1"]);
    console.log("Cloned", repoUrl, "into .content");
  } else {
    const git = simpleGit(contentDir);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      await git.init();
      try {
        await git.getRemotes();
      } catch {
        await git.addRemote("origin", getSkillsRepoUrl());
      }
      console.log("Initialized git in .content.");
    }
  }

  const resolver = new ContentResolver({
    localRoot: contentDir,
    mode: "dev",
    gitRepoUrl: getSkillsRepoUrl(),
    gitBranch: DEFAULT_SKILLS_BRANCH,
    gitToken: process.env.SKILLS_PUBLISHER_TOKEN || process.env.GITHUB_TOKEN,
  });

  if (!resolver.getContentRoot()) {
    console.error("Content resolver not enabled. Ensure .content exists and nx-content can use it.");
    process.exit(1);
  }

  const allSkillNames = (await getSkillNamesAsync(resolver)).filter((name) => name !== "ai.ask");
  const currentInstructions = new Map<string, { weak: string; normal: string }>();
  const fileOnlyInstructions = new Map<string, string>();
  let written = 0;
  for (const skillName of allSkillNames) {
    const weakKey = skillInstructionsKeyForMode(skillName, "weak");
    const normalKey = skillInstructionsKeyForMode(skillName, "normal");
    const manifest = DEFAULT_SKILL_INSTRUCTIONS[skillName];
    let currentWeak: string;
    let currentNormal: string;
    if (manifest) {
      currentWeak = manifest.weak;
      currentNormal = manifest.normal;
      await resolver.set(weakKey, currentWeak);
      await resolver.set(normalKey, currentNormal);
      await setSkillInstructions(resolver, skillName, currentNormal);
      currentInstructions.set(skillName, { weak: currentWeak, normal: currentNormal });
      written += 3;
    } else {
      const w = await resolver.get(weakKey).catch(() => undefined);
      const n = await resolver.get(normalKey).catch(() => undefined);
      const fileBased = await getSkillInstructions(resolver, skillName);
      if (w === undefined && n === undefined && !fileBased) continue;
      currentWeak = w ?? "";
      currentNormal = n ?? "";
      if (fileBased && w === undefined && n === undefined) {
        fileOnlyInstructions.set(skillName, fileBased);
      } else {
        currentInstructions.set(skillName, { weak: currentWeak, normal: currentNormal });
      }
    }
  }
  for (const skillName of allSkillNames) {
    await setSkillRules(resolver, skillName, DEFAULT_SKILL_RULES[skillName] ?? []);
    written++;
  }
  console.log("Wrote", written, "files (instructions + rules); processing", currentInstructions.size, "skills (legacy) +", fileOnlyInstructions.size, "file-based only.");

  if (doOptimize) {
    const matchesFilter = (name: string) => !skillsFilter || skillsFilter.includes(name);
    const legacyToRun = onlyFileBased
      ? new Map<string, { weak: string; normal: string }>()
      : new Map([...currentInstructions].filter(([name]) => matchesFilter(name)));
    const fileOnlyToRun = new Map(
      [...fileOnlyInstructions].filter(([name]) => matchesFilter(name))
    );
    if (onlyFileBased) {
      legacyToRun.clear();
    }
    const totalToRun = legacyToRun.size + fileOnlyToRun.size;
    if (totalToRun === 0) {
      console.log(
        "No skills to optimize (--only-file-based with no file-only skills? or --skills= none match). Skipping."
      );
    } else {
      fs.mkdirSync(reportsDir, { recursive: true });
      console.log(
        "Optimizing instructions (LLM)" +
          (writeReports ? ` and writing reports to ${reportsDir}` : "") +
          "..."
      );
      for (const [skillName, instr] of legacyToRun) {
      try {
        const [weakResult, normalResult] = await Promise.all([
          optimizeInstruction(instr.weak, "weak", skillName),
          optimizeInstruction(instr.normal, "normal", skillName),
        ]);
        if (writeReports) {
          const reportMd = buildReportMd(skillName, {
            original: instr.weak,
            optimized: weakResult.optimized,
            usage: weakResult.usage,
            durationMs: weakResult.durationMs,
          }, {
            original: instr.normal,
            optimized: normalResult.optimized,
            usage: normalResult.usage,
            durationMs: normalResult.durationMs,
          });
          const reportPath = path.join(reportsDir, `${skillName}.md`);
          fs.writeFileSync(reportPath, reportMd, "utf-8");
          console.log("  Report:", reportPath);
        }
        const weakKey = skillInstructionsKeyForMode(skillName, "weak");
        const normalKey = skillInstructionsKeyForMode(skillName, "normal");
        await resolver.set(weakKey, weakResult.optimized);
        await resolver.set(normalKey, normalResult.optimized);
        await setSkillInstructions(resolver, skillName, normalResult.optimized);
      } catch (err) {
        console.error("  Optimization failed for", skillName, err);
      }
      }
      for (const [skillName, content] of fileOnlyToRun) {
      try {
        const result = await optimizeInstruction(content, "normal", skillName);
        if (writeReports) {
          const reportMd = buildReportMdSingle(
            skillName,
            content,
            result.optimized,
            result.usage,
            result.durationMs
          );
          const reportPath = path.join(reportsDir, `${skillName}.md`);
          fs.writeFileSync(reportPath, reportMd, "utf-8");
          console.log("  Report (file-based):", reportPath);
        }
        await setSkillInstructions(resolver, skillName, result.optimized);
      } catch (err) {
        console.error("  Optimization failed for (file-based)", skillName, err);
      }
      }
      console.log(
        "Optimization done." + (writeReports ? ` Reports in ${reportsDir}` : "")
      );
    }
  }

  if (!skipTests) {
    console.log("Running build and tests...");
    const build = spawnSync("npm", ["run", "build"], { cwd: rootDir, stdio: "inherit", shell: true });
    if (build.status !== 0) {
      console.error("Build failed.");
      process.exit(build.status ?? 1);
    }
    const test = spawnSync("npm", ["test"], { cwd: rootDir, stdio: "inherit", shell: true });
    if (test.status !== 0) {
      console.error("Tests failed. Not pushing.");
      process.exit(test.status ?? 1);
    }
  } else {
    console.log("Skipping tests (--skip-tests).");
  }

  if (!pushToGit) {
    console.log("Skipping push (--no-push). Content is in", contentDir);
    return;
  }

  console.log("Pushing content to remote...");
  try {
    const result = await resolver.pushToRemote({
      message: doOptimize ? "chore: sync and optimize skill instructions" : "chore: sync skill instructions (test-and-push)",
    });
    if (result.pushed) {
      console.log("Pushed. Commit:", result.commitHash ?? "(unknown)");
    } else if (result.noChanges) {
      console.log("No changes to commit; nothing to push.");
    } else {
      console.log("Push result:", result);
    }
  } catch (err) {
    console.error("Push failed:", err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
