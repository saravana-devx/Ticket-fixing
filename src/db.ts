import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Ticket } from "./state.js";

let db: Database.Database | undefined;

/** Lazily opens the DB (path overridable via DB_PATH) and creates the table on first use. */
export function getDb(): Database.Database {
  if (db) return db;
  const file = process.env.DB_PATH ?? path.join(process.cwd(), "data", "agent_runs.db");
  mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id              TEXT PRIMARY KEY,          -- ticket id + timestamp e.g. "42-1727342400000"
      ticket_id       TEXT NOT NULL,
      ticket_title    TEXT,
      severity        TEXT,                      -- LOW | MEDIUM | HIGH

      status          TEXT,
      fix_plan        TEXT,
      estimated_lines INTEGER,

      modified_files  TEXT,                      -- JSON.stringify([{ path, originalContent, newContent }])
      review_approved INTEGER,                   -- 0 or 1
      review_feedback TEXT,
      retry_count     INTEGER DEFAULT 0,

      child_ticket_url TEXT,
      pr_url          TEXT,
      branch_name     TEXT,

      started_at      TEXT DEFAULT (datetime('now')),
      completed_at    TEXT,
      duration_ms     INTEGER
    );
  `);
  return db;
}

export function closeDb() {
  db?.close();
  db = undefined;
}

export type RunFields = Partial<{
  status: string;
  fix_plan: string;
  estimated_lines: number;
  modified_files: string; // JSON.stringify(modifiedFiles)
  review_approved: number; // 0 or 1
  review_feedback: string;
  retry_count: number;
  child_ticket_url: string;
  pr_url: string;
  branch_name: string;
  completed_at: string;
  duration_ms: number;
}>;

const ALLOWED_COLUMNS = new Set([
  "status", "fix_plan", "estimated_lines", "modified_files", "review_approved",
  "review_feedback", "retry_count", "child_ticket_url", "pr_url", "branch_name",
  "completed_at", "duration_ms",
]);

/** Call at the START of a run — inserts a new row and returns the runId. */
export function createRun(ticketId: string, ticket: Pick<Ticket, "id" | "title" | "severity">) {
  const id = `${ticketId}-${Date.now()}`;
  getDb()
    .prepare(
      `INSERT INTO agent_runs (id, ticket_id, ticket_title, severity, status)
       VALUES (?, ?, ?, ?, 'pending')`,
    )
    .run(id, ticket.id, ticket.title, ticket.severity);
  return id;
}

/** Call after each node. No-op when there is no runId (e.g. nodes run in isolation). */
export function updateRun(runId: string | undefined, fields: RunFields) {
  if (!runId) return;
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  for (const k of keys) {
    if (!ALLOWED_COLUMNS.has(k)) throw new Error(`Unknown agent_runs column: ${k}`);
  }
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  getDb()
    .prepare(`UPDATE agent_runs SET ${setClause} WHERE id = ?`)
    .run(...Object.values(fields), runId);
}

/** Call at the END of a run. */
export function completeRun(runId: string, status: string, startedAt: number) {
  updateRun(runId, {
    status,
    completed_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
  });
}
