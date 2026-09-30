import { createComplexityCheckNode } from "./nodes/complexity.js";
import type { State } from "./state.js";

const mk = (severity: string, estimatedLines: number) =>
  ({
    ticket: { id: "42", title: "Bug", description: "d", severity, labels: [] },
    estimatedLines,
    fixPlan: "## Root Cause\nx",
  }) as unknown as State;

let calls: any[] = [];
const node = createComplexityCheckNode(async (a) => {
  calls.push(a);
  return "https://github.com/o/r/issues/1";
});

const cases: [string, string, number, boolean][] = [
  ["LOW 60 -> escalate", "LOW", 60, true],
  ["LOW 51 -> escalate", "LOW", 51, true],
  ["LOW 50 -> continue", "LOW", 50, false],
  ["LOW 10 -> continue", "LOW", 10, false],
  ["MEDIUM 80 -> continue", "MEDIUM", 80, false],
];
let failed = false;
for (const [name, sev, lines, escalate] of cases) {
  calls = [];
  const r = await node(mk(sev, lines));
  const ok = escalate
    ? r.status === "escalated" && r.childTicketUrl?.endsWith("/1") && calls.length === 1 &&
      calls[0].title === "[Auto-Escalated] Bug" && calls[0].labels.includes("needs-human-review") &&
      calls[0].body.includes("## Root Cause")
    : r.status === undefined && calls.length === 0;
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) failed = true;
}
if (failed) process.exitCode = 1;
