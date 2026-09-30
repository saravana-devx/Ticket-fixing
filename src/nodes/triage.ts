import { updateRun } from "../db.js";
import type { State } from "../state.js";

export async function triageNode(state: State): Promise<Partial<State>> {
  if (state.ticket.severity === "HIGH") {
    console.log("Skipping HIGH severity ticket — requires human review");
    updateRun(state.runId, { status: "skipped_high" });
    return { status: "skipped_high" };
  }
  updateRun(state.runId, { status: "triaged" });
  return { status: "triaged" };
}
