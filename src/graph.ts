import { END, START, StateGraph } from "@langchain/langgraph";
import { complexityCheckNode } from "./nodes/complexity.js";
import { coderNode } from "./nodes/coder.js";
import { gitNode } from "./nodes/git.js";
import { plannerNode } from "./nodes/planner.js";
import { MAX_RETRIES, reviewerNode } from "./nodes/reviewer.js";
import { triageNode } from "./nodes/triage.js";
import { StateAnnotation, type State } from "./state.js";

type NodeFn = (state: State) => Promise<Partial<State>>;
export type Nodes = Record<"triage" | "planner" | "complexityCheck" | "coder" | "reviewer" | "git", NodeFn>;

const defaultNodes: Nodes = {
  triage: triageNode,
  planner: plannerNode,
  complexityCheck: complexityCheckNode,
  coder: coderNode,
  reviewer: reviewerNode,
  git: gitNode,
};

/** Nodes are overridable so the whole graph can be tested with fake LLMs. */
export function buildGraph(nodes: Nodes = defaultNodes) {
  return new StateGraph(StateAnnotation)
    .addNode("triage", nodes.triage)
    .addNode("planner", nodes.planner)
    .addNode("complexityCheck", nodes.complexityCheck)
    .addNode("coder", nodes.coder)
    .addNode("reviewer", nodes.reviewer)
    .addNode("git", nodes.git)

    .addEdge(START, "triage")

    .addConditionalEdges("triage", (state) => (state.status === "skipped_high" ? END : "planner"))

    .addEdge("planner", "complexityCheck")

    .addConditionalEdges("complexityCheck", (state) => (state.status === "escalated" ? END : "coder"))

    .addEdge("coder", "reviewer")

    .addConditionalEdges("reviewer", (state) => {
      if (state.reviewApproved) return "git";
      if (state.retryCount >= MAX_RETRIES) return END; // failed — stop
      return "coder"; // retry with feedback
    })

    .addEdge("git", END)
    .compile();
}
