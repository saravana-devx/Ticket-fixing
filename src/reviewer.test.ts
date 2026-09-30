import { FakeListChatModel } from "@langchain/core/utils/testing";
import { unifiedDiff } from "./diff.js";
import { createReviewerNode, parseReview } from "./nodes/reviewer.js";
import type { State } from "./state.js";

const mk = (retryCount: number) =>
  ({
    ticket: { id: "42", title: "Crash", description: "d", severity: "LOW", labels: [] },
    fixPlan: "plan",
    retryCount,
    modifiedFiles: [{ path: "a.ts", originalContent: "x\ny\nz", newContent: "x\nY\nz" }],
  }) as unknown as State;

const llm = (r: string) => new FakeListChatModel({ responses: [r] });
let issues: any[] = [];
const issueFn = async (a: any) => (issues.push(a), "https://github.com/o/r/issues/9");

const approve = await createReviewerNode(llm('{"approved":true,"feedback":"","concerns":[]}'), issueFn)(mk(1));
const rej1 = await createReviewerNode(llm('```json\n{"approved":false,"feedback":"bad","concerns":["c1"]}\n```'), issueFn)(mk(1));
const rej3 = await createReviewerNode(llm('{"approved":false,"feedback":"still bad","concerns":[]}'), issueFn)(mk(3));
const garbage = await createReviewerNode(llm("looks good to me!"), issueFn)(mk(1));
const empty = await createReviewerNode(llm("unused"), issueFn)({ ...mk(1), modifiedFiles: [] } as State);
const d = unifiedDiff("a.ts", "x\ny\nz", "x\nY\nz");

const checks: [string, boolean][] = [
  ["approve -> approved", approve.reviewApproved === true && approve.status === "approved"],
  ["reject (fenced JSON, retry 1) -> retry", rej1.reviewApproved === false && rej1.status === "coding" && rej1.reviewFeedback!.includes("c1")],
  ["reject at 3 -> failed + issue created", rej3.status === "failed" && issues.length === 1 && rej3.childTicketUrl!.endsWith("/9") && issues[0].title.startsWith("[Auto-Fix Failed]")],
  ["retry 1 rejection created no issue", issues.length === 1],
  ["non-JSON reply fails closed", garbage.reviewApproved === false],
  ["empty diff rejected without LLM", empty.reviewApproved === false && empty.reviewFeedback!.includes("no changes")],
  ["diff format", d.includes("--- a/a.ts") && d.includes("-y") && d.includes("+Y") && d.includes("@@ -1,3 +1,3 @@")],
  ["parseReview bad shape rejects", parseReview('{"approved":"yes"}').approved === false],
];
for (const [n, ok] of checks) console.log(ok ? "PASS" : "FAIL", n);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
