import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGitNode } from "./nodes/git.js";
import type { State } from "./state.js";

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const tmp = await mkdtemp(path.join(tmpdir(), "git-"));
const remote = path.join(tmp, "remote.git");
const work = path.join(tmp, "work");
execFileSync("git", ["init", "--bare", "-b", "main", remote]);
execFileSync("git", ["init", "-b", "main", work]);
sh(work, "config", "user.email", "t@t.dev");
sh(work, "config", "user.name", "t");
sh(work, "remote", "add", "origin", remote);
await writeFile(path.join(work, "a.ts"), "old\n");
sh(work, "add", "."); sh(work, "commit", "-m", "init"); sh(work, "push", "origin", "main");
const mainBefore = sh(work, "rev-parse", "main");

// The fix modifies a.ts; an unrelated file (think .env) must NOT be committed.
await writeFile(path.join(work, "a.ts"), "new\n");
await writeFile(path.join(work, "secret.env"), "TOKEN=x\n");

let pr: any;
const state = {
  ticket: { id: "42", title: "Crash", description: "d", severity: "LOW", labels: [] },
  fixPlan: "## Root Cause\nnull",
  modifiedFiles: [{ path: "a.ts", originalContent: "old\n", newContent: "new\n" }],
} as unknown as State;
const out = await createGitNode(async (a) => ((pr = a), "https://github.com/o/r/pull/7"), work)(state);

const branch = out.branchName!;
const checks: [string, boolean][] = [
  ["branch name pattern", /^auto-fix\/ticket-42-\d+$/.test(branch)],
  ["branch pushed to remote", sh(remote, "branch", "--list", branch).includes(branch)],
  ["commit message", sh(work, "log", "-1", "--format=%s", branch) === "fix: Crash [auto-agent] (#42)"],
  ["commit has only a.ts", sh(work, "show", "--name-only", "--format=", branch) === "a.ts"],
  ["main untouched", sh(work, "rev-parse", "main") === mainBefore && sh(remote, "rev-parse", "main") === mainBefore],
  ["working copy back on main", sh(work, "rev-parse", "--abbrev-ref", "HEAD") === "main"],
  ["prUrl/status set", out.prUrl?.endsWith("/7") === true && out.status === "done"],
  ["PR head/base/labels", pr.head === branch && pr.base === "main" && pr.labels[0] === "auto-fix"],
  ["PR body has plan, files, ticket", pr.body.includes("## Root Cause") && pr.body.includes("`a.ts`") && pr.body.includes("#42")],
];
for (const [n, ok] of checks) console.log(ok ? "PASS" : "FAIL", n);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;

// --- Regression: no git identity configured anywhere (like a fresh container) ---
// Identity must come from GIT_AUTHOR_*/GIT_COMMITTER_* env, forwarded to git as -c options.
const tmp2 = await mkdtemp(path.join(tmpdir(), "git-noid-"));
const remote2 = path.join(tmp2, "remote.git");
const work2 = path.join(tmp2, "work");
execFileSync("git", ["init", "--bare", "-b", "main", remote2]);
execFileSync("git", ["init", "-b", "main", work2]);
sh(work2, "remote", "add", "origin", remote2);
await writeFile(path.join(work2, "a.ts"), "old\n");
// seed the first commit with an explicit one-off identity, leaving no config behind
execFileSync("git", ["-c", "user.name=seed", "-c", "user.email=s@s", "add", "."], { cwd: work2 });
execFileSync("git", ["-c", "user.name=seed", "-c", "user.email=s@s", "commit", "-m", "init"], { cwd: work2 });
await writeFile(path.join(work2, "a.ts"), "new\n");

const saved = { ...process.env };
Object.assign(process.env, {
  HOME: tmp2, XDG_CONFIG_HOME: tmp2, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_AUTHOR_NAME: "bug-fix-agent", GIT_AUTHOR_EMAIL: "bot@example.com",
  GIT_COMMITTER_NAME: "bug-fix-agent", GIT_COMMITTER_EMAIL: "bot@example.com",
});
const { identityConfig } = await import("./nodes/git.js");
let noIdOk = false, author = "";
try {
  const out2 = await createGitNode(async () => "dry-run://pr", work2)(state);
  author = execFileSync("git", ["log", "-1", "--format=%an <%ae>", out2.branchName!], { cwd: work2, encoding: "utf8" }).trim();
  noIdOk = true;
} catch (e) { console.log("commit without identity failed:", (e as Error).message.split("\n")[0]); }
process.env = saved;
const ok2 = noIdOk && author === "bug-fix-agent <bot@example.com>";
console.log(ok2 ? "PASS" : "FAIL", "commit works with identity only from env (no git config)");
const ok3 = identityConfig({ GIT_AUTHOR_NAME: "n", GIT_AUTHOR_EMAIL: "e" }).join(",") === "user.name=n,user.email=e" && identityConfig({}).length === 0;
console.log(ok3 ? "PASS" : "FAIL", "identityConfig builds -c options from env");
if (!ok2 || !ok3) process.exitCode = 1;
