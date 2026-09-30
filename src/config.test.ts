import path from "node:path";

const { repoRoot, agentDir } = await import("./config.js");
const { createIssue, createPR } = await import("./tools/githubTools.js");

delete process.env.TARGET_REPO_PATH;
const checks: [string, boolean][] = [["repoRoot defaults to cwd", repoRoot() === process.cwd()]];
process.env.TARGET_REPO_PATH = "../sample-app";
checks.push(
  ["repoRoot honours TARGET_REPO_PATH", repoRoot() === path.resolve("../sample-app")],
  ["agentDir stays the agent dir", agentDir() === process.cwd()],
);

process.env.GITHUB_DRY_RUN = "true";
const issue = await createIssue({ title: "T", body: "b", labels: ["x"] });
const pr = await createPR({ title: "T", head: "auto-fix/x", base: "main", body: "b", labels: [] });
checks.push(["dry-run issue makes no API call", issue.startsWith("dry-run://issue/")], ["dry-run PR makes no API call", pr === "dry-run://pr/auto-fix/x"]);

for (const [n, ok] of checks) console.log(ok ? "PASS" : "FAIL", n);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
