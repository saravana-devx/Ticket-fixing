import { updateRun } from "../db.js";
import { createIssue, type CreateIssueFn } from "../tools/githubTools.js";
import type { State } from "../state.js";

const LOW_SEVERITY_LINE_LIMIT = 50;

export function createComplexityCheckNode(createIssueFn: CreateIssueFn = createIssue) {
  return async function complexityCheckNode(state: State): Promise<Partial<State>> {
    const { ticket, estimatedLines, fixPlan } = state;

    if (ticket.severity !== "LOW" || estimatedLines <= LOW_SEVERITY_LINE_LIMIT) {
      return {};
    }

    const url = await createIssueFn({
      title: `[Auto-Escalated] ${ticket.title}`,
      body: `This ticket was automatically escalated by the bug-fix agent.

**Original Ticket:** #${ticket.id} — ${ticket.title}
**Reason:** LOW severity but estimated ${estimatedLines} lines of change (limit: ${LOW_SEVERITY_LINE_LIMIT})
**Fix Plan:**

${fixPlan}

A human should review the scope before this is automated.`,
      labels: ["auto-escalated", "needs-human-review"],
    });

    console.log(`Escalated ticket #${ticket.id} → ${url}`);
    updateRun(state.runId, { status: "escalated", child_ticket_url: url });
    return { status: "escalated", childTicketUrl: url };
  };
}

export const complexityCheckNode = (state: State) => createComplexityCheckNode()(state);
