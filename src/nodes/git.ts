import { simpleGit, type SimpleGit } from "simple-git";
import { repoRoot } from "../config.js";
import { updateRun } from "../db.js";
import type { State } from "../state.js";
import { createPR, type CreatePRFn } from "../tools/githubTools.js";

/**
 * simple-git does not forward GIT_AUTHOR_* / GIT_COMMITTER_* to git, so in a container with no
 * git config the commit fails with "Author identity unknown". Pass the identity as -c options.
 */
export function identityConfig(env: NodeJS.ProcessEnv = process.env): string[] {
  const name = env.GIT_COMMITTER_NAME || env.GIT_AUTHOR_NAME;
  const email = env.GIT_COMMITTER_EMAIL || env.GIT_AUTHOR_EMAIL;
  return [...(name ? [`user.name=${name}`] : []), ...(email ? [`user.email=${email}`] : [])];
}

export function createGitNode(
  createPRFn: CreatePRFn = createPR,
  root = repoRoot(),
  git: SimpleGit = simpleGit(root, { config: identityConfig() }),
) {
  return async function gitNode(state: State): Promise<Partial<State>> {
    const { ticket, fixPlan, modifiedFiles } = state;
    const base = process.env.GITHUB_BASE_BRANCH ?? "main";
    const startBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

    // 1. Never commit to main: always a fresh branch.
    const branchName = `auto-fix/ticket-${ticket.id}-${Date.now()}`;
    await git.checkoutLocalBranch(branchName);

    // 2. Stage only the files the fix touched (not `git add .`, which could sweep in
    //    unrelated or sensitive files such as .env or the SQLite db).
    await git.add(modifiedFiles.map((f) => f.path));

    // 3. Commit
    await git.commit(`fix: ${ticket.title} [auto-agent] (#${ticket.id})`);

    // 4. Push
    await git.push("origin", branchName);

    // 5. Leave the working copy on the branch it started on.
    await git.checkout(startBranch);

    const prUrl = await createPRFn({
      title: `[Auto Fix] ${ticket.title}`,
      head: branchName,
      base,
      body: `
## Auto-generated fix for #${ticket.id}

**Ticket:** ${ticket.title}
**Severity:** ${ticket.severity}

### Fix Plan
${fixPlan}

### Files Changed
${modifiedFiles.map((f) => `- \`${f.path}\``).join("\n")}

---
*This PR was generated automatically by the bug-fix agent. Review before merging.*
      `.trim(),
      labels: ["auto-fix"],
    });

    console.log(`PR opened → ${prUrl}`);
    updateRun(state.runId, { status: "done", pr_url: prUrl, branch_name: branchName });
    return { prUrl, branchName, status: "done" };
  };
}

export const gitNode = (state: State) => createGitNode()(state);
