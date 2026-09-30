import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";

process.env.DB_PATH = path.join(await mkdtemp(path.join(tmpdir(), "e2e-db-")), "t.db");
const { buildGraph } = await import("./graph.js");
const { createRun, completeRun, getDb } = await import("./db.js");
const { triageNode } = await import("./nodes/triage.js");
const { createPlannerNode } = await import("./nodes/planner.js");
const { createComplexityCheckNode } = await import("./nodes/complexity.js");
const { createCoderNode } = await import("./nodes/coder.js");
const { createReviewerNode } = await import("./nodes/reviewer.js");
const { createGitNode } = await import("./nodes/git.js");
const { parseSeverity } = await import("./tools/ticketLoader.js");

const sh = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const plan = (lines: number) => `## Root Cause\nnull\n\n## Files to Modify\n- src/users.ts\n\n## Estimated Lines Changed\n${lines}\n\n## Fix Steps\n1. fix`;
const APPROVE = '{"approved":true,"feedback":"","concerns":[]}';
const REJECT = '{"approved":false,"feedback":"nope","concerns":["c"]}';

/** Fresh repo + remote, and a full graph wired to fake LLMs / fake GitHub. */
async function scenario(severity: string, lines: number, reviews: string[]) {
  const tmp = await mkdtemp(path.join(tmpdir(), "e2e-"));
  const remote = path.join(tmp, "remote.git"), root = path.join(tmp, "work");
  execFileSync("git", ["init", "--bare", "-b", "main", remote]);
  execFileSync("git", ["init", "-b", "main", root]);
  for (const [k, v] of [["user.email", "t@t.dev"], ["user.name", "t"]]) sh(root, "config", k, v);
  sh(root, "remote", "add", "origin", remote);
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/users.ts"), "old\n");
  sh(root, "add", "."); sh(root, "commit", "-m", "init"); sh(root, "push", "origin", "main");

  const issues: any[] = [], prs: any[] = [];
  let coderRuns = 0;
  const coderModel = { bindTools: () => {
    let step = 0;
    const run = ++coderRuns;
    return { invoke: async (_: BaseMessage[]) =>
      step++ === 0
        ? new AIMessage({ content: "", tool_calls: [{ id: "w", name: "writeFile", args: { path: "src/users.ts", content: `fix v${run}\n` } }] })
        : new AIMessage("{}") };
  } };
  const graph = buildGraph({
    triage: triageNode,
    planner: createPlannerNode(new FakeListChatModel({ responses: [plan(lines)] }), root),
    complexityCheck: createComplexityCheckNode(async (a) => (issues.push(a), `https://gh/issues/${issues.length}`)),
    coder: createCoderNode(coderModel, root),
    reviewer: createReviewerNode(new FakeListChatModel({ responses: reviews }), async (a) => (issues.push(a), `https://gh/issues/${issues.length}`)),
    git: createGitNode(async (a) => (prs.push(a), "https://gh/pull/1"), root),
  });
  const ticket = { id: "42", title: "Crash", description: "users", severity, labels: [] } as any;
  const startedAt = Date.now(), runId = createRun("42", ticket);
  const final = await graph.invoke({ ticket, runId, startedAt, retryCount: 0, status: "pending" });
  completeRun(runId, final.status, startedAt);
  const row: any = getDb().prepare("SELECT * FROM agent_runs WHERE id = ?").get(runId);
  return { final, issues, prs, coderRuns, root, remote, row, sh };
}

const results: [string, boolean][] = [];
const check = (n: string, ok: boolean) => results.push([n, ok]);

let s = await scenario("HIGH", 10, [APPROVE]);
check("HIGH: stops at triage, nothing touched", s.final.status === "skipped_high" && !s.final.fixPlan && s.coderRuns === 0 && s.row.status === "skipped_high");

s = await scenario("LOW", 10, [APPROVE]);
check("LOW/10: full pipeline, PR opened", s.final.status === "done" && s.final.prUrl === "https://gh/pull/1" && s.prs.length === 1);
check("LOW/10: branch on remote, main untouched, audit row complete",
  s.sh(s.remote, "branch", "--list", s.final.branchName!).includes("auto-fix/ticket-42-") &&
  s.sh(s.root, "log", "-1", "--format=%s", "main") === "init" &&
  s.row.status === "done" && s.row.pr_url === "https://gh/pull/1" && s.row.retry_count === 1 && s.row.duration_ms >= 0 && !!s.row.fix_plan);

s = await scenario("LOW", 60, [APPROVE]);
check("LOW/60: escalates, child ticket, no code", s.final.status === "escalated" && s.issues.length === 1 && s.coderRuns === 0 && s.row.child_ticket_url === "https://gh/issues/1");

s = await scenario("MEDIUM", 80, [APPROVE]);
check("MEDIUM/80: full pipeline, no line limit", s.final.status === "done" && s.prs.length === 1);

s = await scenario("LOW", 10, [REJECT, APPROVE]);
check("reject once: coder retried then PR", s.coderRuns === 2 && s.final.status === "done" && s.final.modifiedFiles?.[0].originalContent === "old\n" && s.final.modifiedFiles?.[0].newContent === "fix v2\n");

s = await scenario("LOW", 10, [REJECT]);
check("reject 3x: failure ticket, stops, no PR", s.coderRuns === 3 && s.final.status === "failed" && s.issues.length === 1 && s.issues[0].title.startsWith("[Auto-Fix Failed]") && s.prs.length === 0 && s.row.status === "failed");

check("severity: no label -> HIGH", parseSeverity(["bug"]) === "HIGH");
check("severity: 'severity: low' -> LOW", parseSeverity(["bug", "severity: low"]) === "LOW");

for (const [n, ok] of results) console.log(ok ? "PASS" : "FAIL", n);
if (results.some(([, ok]) => !ok)) process.exitCode = 1;
