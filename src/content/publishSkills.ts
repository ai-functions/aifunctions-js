import { simpleGit } from "simple-git";
import { DEFAULT_SKILLS_BRANCH } from "./skillsRepo.js";

export type PushSkillsContentOptions = {
  /** Local path that is a Git repo (e.g. content root or clone of the skills repo). */
  localPath: string;
  /** Git branch to push. Default: DEFAULT_SKILLS_BRANCH. */
  branch?: string;
  /** Commit message. Default: "chore: update skill content". */
  message?: string;
  /** Remote name. Default: "origin". */
  remote?: string;
};

/**
 * Add all changes in localPath, commit, and push to the remote.
 * Ensure the remote is configured (e.g. origin) and you have push access
 * (e.g. set SKILLS_PUBLISHER_TOKEN or GITHUB_TOKEN in env for HTTPS, or use SSH).
 */
export async function pushSkillsContent(
  options: PushSkillsContentOptions
): Promise<{ committed: boolean; pushed: boolean }> {
  const {
    localPath,
    branch = DEFAULT_SKILLS_BRANCH,
    message = "chore: update skill content",
    remote = "origin",
  } = options;

  const git = simpleGit(localPath);

  const status = await git.status();
  if (status.isClean()) {
    return { committed: false, pushed: false };
  }

  await git.add(".");
  await git.commit(message);
  await git.push(remote, branch);
  return { committed: true, pushed: true };
}
