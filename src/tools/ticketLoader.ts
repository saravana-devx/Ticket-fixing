import "dotenv/config";
import { readFile } from "node:fs/promises";
import { Octokit } from "@octokit/rest";
import { z } from "zod";
import type { Ticket } from "../state.js";

const TicketSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  labels: z.array(z.string()),
  file_hint: z.string().optional(),
});

/**
 * Severity from issue labels ("severity: high", "high", ...). A ticket with no
 * recognisable severity is treated as HIGH so the agent never touches it by accident.
 */
export function parseSeverity(labels: string[]): Ticket["severity"] {
  for (const l of labels) {
    const m = l.trim().toLowerCase().match(/^(?:severity\s*[:/-]?\s*)?(low|medium|high)$/);
    if (m) return m[1].toUpperCase() as Ticket["severity"];
  }
  return "HIGH";
}

export async function loadTicket(issueNumber?: string): Promise<Ticket> {
  if (process.env.USE_LOCAL_TICKET === "true") {
    const file = process.env.LOCAL_TICKET_PATH ?? "./tickets/sample-ticket.json";
    return TicketSchema.parse(JSON.parse(await readFile(file, "utf8")));
  }

  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    throw new Error("GITHUB_TOKEN, GITHUB_OWNER and GITHUB_REPO must be set");
  }
  if (!issueNumber) throw new Error("Pass a GitHub issue number: npm start -- <issue-number>");
  const { data } = await new Octokit({ auth: GITHUB_TOKEN }).rest.issues.get({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    issue_number: Number(issueNumber),
  });
  const labels = data.labels.map((l) => (typeof l === "string" ? l : (l.name ?? "")));
  return TicketSchema.parse({
    id: String(data.number),
    title: data.title,
    description: data.body ?? "",
    severity: parseSeverity(labels),
    labels,
  });
}
