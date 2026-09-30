import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { updateRun } from "../db.js";
import { FORMAT_NUDGE, invokeRecovering } from "../llm/recovery.js";
import { diffAll } from "../diff.js";
import { contentToText, createLLM } from "../llm/index.js";
import { rateLimitDelay } from "../utils/delay.js";
import type { State } from "../state.js";
import { createIssue, type CreateIssueFn } from "../tools/githubTools.js";

export const MAX_RETRIES = 3;

const SYSTEM_PROMPT = `You are a strict senior code reviewer. Review this automated bug fix.

You will receive:
- The original bug ticket
- The fix plan
- A unified diff of all changes

Respond ONLY with valid JSON in this format:
{
  "approved": true | false,
  "feedback": "string — detailed feedback if rejected, empty string if approved",
  "concerns": ["list", "of", "specific", "issues"] // empty array if approved
}

Reject if:
- The fix does not actually address the root cause
- The fix introduces new bugs or breaks unrelated code
- The fix modifies more than the plan specified
- The fix has syntax errors or obvious logic errors

Approve if the fix is correct, minimal, and safe.`;

const ReviewSchema = z.object({
  approved: z.boolean(),
  feedback: z.string().default(""),
  concerns: z.array(z.string()).default([]),
});
type Review = z.infer<typeof ReviewSchema>;

/** Parses the reviewer's reply. Fails closed: anything unparseable is a rejection. */
export function parseReview(text: string): Review {
  try {
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error("no JSON object found");
    return ReviewSchema.parse(JSON.parse(json));
  } catch (err) {
    return {
      approved: false,
      feedback: `Reviewer response was not valid JSON (${(err as Error).message}); treating as rejected.`,
      concerns: [],
    };
  }
}

export function createReviewerNode(llm: BaseChatModel, createIssueFn: CreateIssueFn = createIssue) {
  return async function reviewerNode(state: State): Promise<Partial<State>> {
    const { ticket, fixPlan, modifiedFiles = [], retryCount = 0 } = state;
    const diff = diffAll(modifiedFiles);

    let review: Review;
    if (!diff) {
      review = { approved: false, feedback: "The coder made no changes to any file.", concerns: ["Empty diff"] };
    } else {
      const res = await invokeRecovering(
        (m) => llm.invoke(m),
        [
          new SystemMessage(SYSTEM_PROMPT),
          new HumanMessage(
            `## Ticket #${ticket.id}: ${ticket.title}\n${ticket.description}\n\n## Fix Plan\n${fixPlan}\n\n## Diff\n\`\`\`diff\n${diff}\n\`\`\``,
          ),
        ],
        FORMAT_NUDGE,
      );
      review = parseReview(contentToText(res.content));
    }

    const feedback = [review.feedback, ...review.concerns.map((c) => `- ${c}`)].filter(Boolean).join("\n");

    if (review.approved) {
      updateRun(state.runId, { status: "approved", review_approved: 1, review_feedback: "" });
      return { reviewApproved: true, reviewFeedback: "", status: "approved" };
    }

    if (retryCount >= MAX_RETRIES) {
      let failureUrl = "";
      try {
        failureUrl = await createIssueFn({
          title: `[Auto-Fix Failed] ${ticket.title}`,
          body: `The bug-fix agent could not produce an approved fix for #${ticket.id} — ${ticket.title} after ${retryCount} attempts.

**Last reviewer feedback:**
${feedback}

**Fix Plan:**
${fixPlan}

A human needs to look at this ticket.`,
          labels: ["auto-fix-failed", "needs-human-review"],
        });
        console.log(`Failure issue created → ${failureUrl}`);
      } catch (err) {
        console.error(`Could not create failure issue: ${(err as Error).message}`);
      }
      updateRun(state.runId, {
        status: "failed",
        review_approved: 0,
        review_feedback: feedback,
        ...(failureUrl && { child_ticket_url: failureUrl }),
      });
      return { reviewApproved: false, reviewFeedback: feedback, status: "failed", childTicketUrl: failureUrl };
    }

    updateRun(state.runId, { status: "coding", review_approved: 0, review_feedback: feedback });
    return { reviewApproved: false, reviewFeedback: feedback, status: "coding" };
  };
}

export const reviewerNode = async (state: State) => {
  const llm = createLLM("reviewer");
  await rateLimitDelay();
  return createReviewerNode(llm)(state);
};
