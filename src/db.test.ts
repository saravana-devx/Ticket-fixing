import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DB_PATH = path.join(await mkdtemp(path.join(tmpdir(), "db-")), "t.db");
const { createRun, updateRun, completeRun, getDb } = await import("./db.js");
const { triageNode } = await import("./nodes/triage.js");

const ticket = { id: "42", title: "Bug", description: "d", severity: "HIGH" as const, labels: [] };
const runId = createRun("42", ticket);
await triageNode({ ticket, runId } as any);
let row: any = getDb().prepare("SELECT * FROM agent_runs WHERE id = ?").get(runId);
const checks: [string, boolean][] = [["triage recorded skipped_high", row.status === "skipped_high"]];

updateRun(runId, { fix_plan: "plan", estimated_lines: 7, modified_files: JSON.stringify([{ path: "a" }]), review_approved: 1 });
completeRun(runId, "done", Date.now() - 50);
row = getDb().prepare("SELECT * FROM agent_runs WHERE id = ?").get(runId);
checks.push(
  ["fields updated", row.fix_plan === "plan" && row.estimated_lines === 7 && row.review_approved === 1],
  ["modified_files JSON round-trips", JSON.parse(row.modified_files)[0].path === "a"],
  ["completeRun sets status/duration", row.status === "done" && row.duration_ms >= 50 && !!row.completed_at],
  ["undefined runId is a no-op", (updateRun(undefined, { status: "x" }), true)],
);
let threw = false;
try { updateRun(runId, { ["id; DROP TABLE agent_runs"]: "x" } as any); } catch { threw = true; }
checks.push(["unknown column rejected", threw]);

for (const [n, ok] of checks) console.log(ok ? "PASS" : "FAIL", n);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
