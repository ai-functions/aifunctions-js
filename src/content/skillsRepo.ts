/**
 * Default skills content repo. Used by nx-content when no override is provided.
 * Override at runtime via env GITHUB_REPO_URL (e.g. "owner/repo" or full URL).
 */
export const DEFAULT_SKILLS_REPO_URL =
  "https://github.com/nx-morpheus/skills-functions.git";

export const DEFAULT_SKILLS_BRANCH = "main";

/** Repo URL for content scripts: env GITHUB_REPO_URL (owner/repo or full URL) or DEFAULT_SKILLS_REPO_URL. */
export function getSkillsRepoUrl(): string {
  const raw = process.env.GITHUB_REPO_URL;
  if (!raw || typeof raw !== "string") return DEFAULT_SKILLS_REPO_URL;
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_SKILLS_REPO_URL;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://github.com/${trimmed.replace(/^\/+|\/+$/g, "")}.git`;
}
