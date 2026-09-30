import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { invokeRecovering, isRecoverableModelError } from "./llm/recovery.js";

const toolErr = () => new Error(`400 {"error":{"code":"tool_use_failed","failed_generation":"{\\"name\\":\\"search\\"}"}}`);
const parseErr = () => new Error('400 {"error":{"code":"output_parse_failed"}}');

// Fails twice with provider errors, then succeeds; records what the model saw.
let calls = 0, seen: number[] = [];
const flaky = async (m: BaseMessage[]) => { seen.push(m.length); if (calls++ < 2) throw calls === 1 ? toolErr() : parseErr(); return new AIMessage("ok"); };
const msgs: BaseMessage[] = [new HumanMessage("task")];
const r = await invokeRecovering(flaky, msgs, "NUDGE");

let n = 0;
const always = async () => { n++; throw toolErr(); };
let exhausted = false; try { await invokeRecovering(always, [new HumanMessage("x")], "N", 2); } catch { exhausted = true; }

let m = 0;
const fatal = async () => { m++; throw new Error("401 Unauthorized"); };
let fatalThrown = false; try { await invokeRecovering(fatal, [new HumanMessage("x")], "N"); } catch { fatalThrown = true; }

const checks: [string, boolean][] = [
  ["recovers after tool_use_failed + output_parse_failed", r.content === "ok" && calls === 3],
  ["a corrective message is added before each retry", seen.join() === "1,2,3" && String(msgs[1].content) === "NUDGE"],
  ["gives up after maxRecoveries (2 -> 3 attempts)", exhausted && n === 3],
  ["non-recoverable errors are thrown immediately", fatalThrown && m === 1],
  ["classifier matches Groq error codes only", isRecoverableModelError(toolErr()) && isRecoverableModelError(parseErr()) && !isRecoverableModelError(new Error("429"))],
];
for (const [name, ok] of checks) console.log(ok ? "PASS" : "FAIL", name);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
