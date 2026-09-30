import { Annotation } from "@langchain/langgraph";

export type Ticket = {
  id: string;
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  labels: string[];
  file_hint?: string; // optional: file most likely to contain the bug
};

export type ModifiedFile = {
  path: string;
  originalContent: string;
  newContent: string;
};

export type Status =
  | "pending"
  | "triaged"
  | "skipped_high" // HIGH severity — do not touch
  | "escalated" // LOW + too complex — child ticket created
  | "coding"
  | "reviewing"
  | "approved"
  | "failed"
  | "done";

export const StateAnnotation = Annotation.Root({
  // Input
  ticket: Annotation<Ticket>,

  // Planner output
  fixPlan: Annotation<string>, // markdown string (fix-plan.md content)
  estimatedLines: Annotation<number>, // parsed from fix plan

  // Coder output
  modifiedFiles: Annotation<ModifiedFile[]>,

  // Reviewer output
  reviewApproved: Annotation<boolean>,
  reviewFeedback: Annotation<string>,
  retryCount: Annotation<number>,

  // Pipeline control
  status: Annotation<Status>,

  // Output
  childTicketUrl: Annotation<string>, // set if escalated
  prUrl: Annotation<string>, // set when PR is opened
  branchName: Annotation<string>,

  // Audit trail
  runId: Annotation<string>, // SQLite row ID for this run
  startedAt: Annotation<number>, // Date.now() at start — for duration calc
});

export type State = typeof StateAnnotation.State;
