import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createPlannerNode, parseEstimatedLines } from "./nodes/planner.js";
import type { State } from "./state.js";

const plan = `## Root Cause
profilePhoto is null.

## Files to Modify
- src/api/users.ts

## Estimated Lines Changed
12

## Fix Steps
1. Add null check.`;

const root = await mkdtemp(path.join(tmpdir(), "planner-"));
await mkdir(path.join(root, "src/api"), { recursive: true });
await writeFile(path.join(root, "src/api/users.ts"), "export const me = (u) => u.profilePhoto.url;");
await writeFile(path.join(root, "src/api/other.ts"), "export {};");

const state = {
  ticket: { id: "42", title: "Crash when user has no profile photo", description: "users endpoint", severity: "LOW", labels: ["bug"] },
} as unknown as State;

const out = await createPlannerNode(new FakeListChatModel({ responses: [plan] }), root)(state);
const saved = await readFile(path.join(root, "fix-plan.md"), "utf8");

const checks: [string, boolean][] = [
  ["estimatedLines parsed = 12", out.estimatedLines === 12],
  ["fixPlan set", out.fixPlan === plan],
  ["fix-plan.md written", saved === plan],
  ["bad plan -> null", parseEstimatedLines("## Root Cause\nx") === null],
];
for (const [name, ok] of checks) console.log(ok ? "PASS" : "FAIL", name);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
