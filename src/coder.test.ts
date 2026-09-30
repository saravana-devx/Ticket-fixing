import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { createCoderNode, type ToolCallingModel } from "./nodes/coder.js";
import type { State } from "./state.js";

const root = await mkdtemp(path.join(tmpdir(), "coder-"));
await mkdir(path.join(root, "src"), { recursive: true });
const ORIGINAL = "export const me = (u) => u.profilePhoto.url;\n";
const FIXED = "export const me = (u) => u.profilePhoto?.url ?? '/default.png';\n";
await writeFile(path.join(root, "src/users.ts"), ORIGINAL);

// Scripted model: read -> write -> final summary. Records the system prompt it was given.
let systemPrompt = "";
const script = [
  new AIMessage({ content: "", tool_calls: [{ id: "1", name: "readFile", args: { path: "src/users.ts" } }] }),
  new AIMessage({ content: "", tool_calls: [{ id: "2", name: "writeFile", args: { path: "src/users.ts", content: FIXED } }] }),
  new AIMessage('{"modifiedFiles":[{"path":"src/users.ts","summary":"null check"}]}'),
];
const scripted = (): ToolCallingModel => {
  let i = 0;
  return { bindTools: () => ({ invoke: async (m: BaseMessage[]) => { systemPrompt = String(m[0].content); return script[i++]; } }) };
};

const base = {
  ticket: { id: "42", title: "Crash", description: "d", severity: "LOW", labels: [] },
  fixPlan: "## Files to Modify\n- src/users.ts",
} as unknown as State;

let delays = 0;
const first = await createCoderNode(scripted(), root, async () => { delays++; })(base);
const onDisk = await readFile(path.join(root, "src/users.ts"), "utf8");

// Retry run with reviewer feedback; model makes no writes.
await writeFile(path.join(root, "src/users.ts"), ORIGINAL);
const retry = await createCoderNode(
  { bindTools: () => ({ invoke: async (m: BaseMessage[]) => { systemPrompt = String(m[0].content); return new AIMessage("done"); } }) },
  root,
)({ ...base, retryCount: 1, reviewFeedback: "Missing default avatar" } as State);

const checks: [string, boolean][] = [
  ["file written to disk", onDisk === FIXED],
  ["modifiedFiles has original+new", first.modifiedFiles?.length === 1 && first.modifiedFiles[0].originalContent === ORIGINAL && first.modifiedFiles[0].newContent === FIXED],
  ["delay before each LLM call after the first (3 calls -> 2 delays)", delays === 2],
  ["retryCount incremented to 1", first.retryCount === 1],
  ["status reviewing", first.status === "reviewing"],
  ["retry: count 2", retry.retryCount === 2],
  ["retry: feedback in prompt", systemPrompt.includes("Missing default avatar")],
  ["retry: no writes -> no modified files", retry.modifiedFiles?.length === 0],
];
for (const [n, ok] of checks) console.log(ok ? "PASS" : "FAIL", n);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
