#!/usr/bin/env node
/**
 * Test, sync skill instructions to content, and (by default) push to remote.
 * 1) Ensures .content exists (creates and git inits if missing).
 * 2) Writes current skill instructions (from manifest) to local content root.
 * 3) Runs full test suite (build + npm test) unless --skip-tests.
 * 4) By default pushes local content to remote via nx-content's pushToRemote().
 *    Use --no-push to skip pushing (e.g. local-only sync or after optimization).
 *
 * Flags:
 *   --skip-tests   Skip build and test; only write instructions and optionally push.
 *   --no-push      Do not push to git (default: push). Use after optimization if you want to review first.
 *
 * Prerequisites for push:
 * - Env: SKILLS_PUBLISHER_TOKEN or GITHUB_TOKEN (if using HTTPS).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContentResolver } from "nx-content";
import simpleGit from "simple-git";
import { DEFAULT_SKILLS_BRANCH, DEFAULT_SKILLS_REPO_URL } from "../src/content/skillsRepo.js";
import { skillInstructionsKeyForMode } from "../src/content/skillsResolver.js";
import { getSkillNames } from "../dist/functions/index.js";
import { DEFAULT_SKILL_INSTRUCTIONS } from "./skillInstructionsManifest.js";

// Note: run after build so dist/functions exists (npm run build && tsx scripts/testOptimizeAndPush.ts)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const contentDir = path.join(rootDir, ".content");

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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const skipTests = args.includes("--skip-tests");
  /** By default push to git; set --no-push or --push=false to skip. */
  const pushToGit = parseBoolArg(args, "push", true);

  console.log("Content root:", contentDir);
  if (!pushToGit) console.log("Push to git: disabled (--no-push)");

  if (!fs.existsSync(contentDir)) {
    console.log("Cloning skills repo into .content...");
    const git = simpleGit(rootDir);
    await git.clone(DEFAULT_SKILLS_REPO_URL, contentDir, ["--depth", "1"]);
    console.log("Cloned", DEFAULT_SKILLS_REPO_URL, "into .content");
  } else {
    const git = simpleGit(contentDir);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      await git.init();
      try {
        await git.getRemotes();
      } catch {
        await git.addRemote("origin", DEFAULT_SKILLS_REPO_URL);
      }
      console.log("Initialized git in .content.");
    }
  }

  const resolver = new ContentResolver({
    localRoot: contentDir,
    mode: "dev",
    gitRepoUrl: DEFAULT_SKILLS_REPO_URL,
    gitBranch: DEFAULT_SKILLS_BRANCH,
    gitToken: process.env.SKILLS_PUBLISHER_TOKEN || process.env.GITHUB_TOKEN,
  });

  if (!resolver.getContentRoot()) {
    console.error("Content resolver not enabled. Ensure .content exists and nx-content can use it.");
    process.exit(1);
  }

  const skillNames = getSkillNames().filter((name) => name !== "ai.ask");
  let written = 0;
  for (const skillName of skillNames) {
    const instr = DEFAULT_SKILL_INSTRUCTIONS[skillName];
    if (!instr) continue;
    const weakKey = skillInstructionsKeyForMode(skillName, "weak");
    const normalKey = skillInstructionsKeyForMode(skillName, "normal");
    await resolver.set(weakKey, instr.weak);
    await resolver.set(normalKey, instr.normal);
    written += 2;
  }
  console.log("Wrote", written, "instruction files for", skillNames.length, "skills.");

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
      message: "chore: sync skill instructions (test-and-push)",
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
