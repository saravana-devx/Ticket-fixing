import { triageNode } from "./nodes/triage.js";
import type { State } from "./state.js";

const mk = (severity: "LOW" | "MEDIUM" | "HIGH") =>
  ({ ticket: { id: "1", title: "t", description: "d", severity, labels: [] } }) as unknown as State;

for (const [sev, want] of [["HIGH", "skipped_high"], ["LOW", "triaged"], ["MEDIUM", "triaged"]] as const) {
  const r = await triageNode(mk(sev));
  console.log(sev, r.status, r.status === want ? "PASS" : "FAIL");
  if (r.status !== want) process.exitCode = 1;
}
