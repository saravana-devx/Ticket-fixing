import "dotenv/config";
import { Octokit } from "@octokit/rest";
import { isDryRun } from "../config.js";

export type CreateIssueFn = (args: {
  title: string;
  body: string;
  labels: string[];
}) => Promise<string>;

function repoConfig() {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    throw new Error("GITHUB_TOKEN, GITHUB_OWNER and GITHUB_REPO must be set");
  }
  return { octokit: new Octokit({ auth: GITHUB_TOKEN }), owner: GITHUB_OWNER, repo: GITHUB_REPO };
}

/** Creates a GitHub issue and returns its URL. */
export const createIssue: CreateIssueFn = async ({ title, body, labels }) => {
  if (isDryRun()) {
    console.log(`[dry-run] would create issue: ${title} (${labels.join(", ")})`);
    return `dry-run://issue/${encodeURIComponent(title)}`;
  }
  const { octokit, owner, repo } = repoConfig();
  const res = await octokit.rest.issues.create({ owner, repo, title, body, labels });
  return res.data.html_url;
};

export type CreatePRFn = (args: {
  title: string;
  head: string;
  base: string;
  body: string;
  labels: string[];
}) => Promise<string>;

/** Opens a pull request, applies labels, and returns its URL. */
export const createPR: CreatePRFn = async ({ title, head, base, body, labels }) => {
  if (isDryRun()) {
    console.log(`[dry-run] would open PR: ${head} → ${base}: ${title}`);
    return `dry-run://pr/${head}`;
  }
  const { octokit, owner, repo } = repoConfig();
  const pr = await octokit.rest.pulls.create({ owner, repo, title, head, base, body });
  if (labels.length) {
    // The pulls API has no labels field; PRs are issues for labelling purposes.
    await octokit.rest.issues.addLabels({ owner, repo, issue_number: pr.data.number, labels });
  }
  return pr.data.html_url;
};
