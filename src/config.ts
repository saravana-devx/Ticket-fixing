import "dotenv/config";
import path from "node:path";

/**
 * The repository the agent reads, edits, commits and pushes in. Set TARGET_REPO_PATH to
 * point at a different checkout than the agent's own directory (e.g. ../sample-app).
 */
export function repoRoot(): string {
  return path.resolve(process.env.TARGET_REPO_PATH ?? process.cwd());
}

/** Where the agent keeps its own files (fix-plan.md, data/). Always the agent's directory. */
export function agentDir(): string {
  return process.cwd();
}

/** When true, GitHub issues/PRs are logged and given fake URLs instead of being created. */
export function isDryRun(): boolean {
  return process.env.GITHUB_DRY_RUN === "true";
}
