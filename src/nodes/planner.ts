import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { updateRun } from "../db.js";
import { agentDir, repoRoot } from "../config.js";
import { FORMAT_NUDGE, invokeRecovering } from "../llm/recovery.js";
import { rateLimitDelay } from "../utils/delay.js";
import { createLLM } from "../llm/index.js";
import type { State } from "../state.js";

const SYSTEM_PROMPT = `You are a senior software engineer performing a code review and fix planning session.

Given a bug ticket and relevant source code, produce a detailed fix plan in this EXACT markdown format:

## Root Cause
[explain what is causing the bug]

## Files to Modify
- path/to/file1.ts
- path/to/file2.ts

## Estimated Lines Changed
[integer number only, e.g.: 23]

## Fix Steps
1. [step one]
2. [step two]
...

Be precise. The Estimated Lines Changed must be a plain integer on its own line.`;

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "tickets"]);
const MAX_FILES = 3;
const MAX_FILE_CHARS = 12_000;

function keywords(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z0-9]{3,}/g) ?? [];
  return [...new Set(words)];
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!IGNORED_DIRS.has(e.name)) files.push(...(await walk(path.join(dir, e.name))));
    } else if (/\.(ts|tsx|js|jsx|mjs|json|py)$/.test(e.name)) {
      files.push(path.join(dir, e.name));
    }
  }
  return files;
}

/** Simple keyword search: rank files by how many ticket keywords appear in their path. */
export async function findRelevantFiles(
  text: string,
  root = repoRoot(),
): Promise<string[]> {
  const kws = keywords(text);
  const scored = (await walk(root))
    .map((file) => {
      const rel = path.relative(root, file).toLowerCase();
      return { rel: path.relative(root, file), score: kws.filter((k) => rel.includes(k)).length };
    })
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_FILES).map((f) => f.rel);
}

export function parseEstimatedLines(plan: string): number | null {
  const m = plan.match(/## Estimated Lines Changed\s*\n(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** `root` is the repo being fixed; the plan file goes to `planDir` so the target repo stays clean. */
export function createPlannerNode(llm: BaseChatModel, root = repoRoot(), planDir = root) {
  return async function plannerNode(state: State): Promise<Partial<State>> {
    const { ticket } = state;
    const found = await findRelevantFiles(`${ticket.title} ${ticket.description}`, root);
    // A file_hint on the ticket goes first (if it exists in the target repo).
    const hint = ticket.file_hint && existsSync(path.join(root, ticket.file_hint)) ? [ticket.file_hint] : [];
    const relevant = [...new Set([...hint, ...found])].slice(0, MAX_FILES);

    const fileSections: string[] = [];
    for (const rel of relevant) {
      const content = await readFile(path.join(root, rel), "utf8");
      fileSections.push(`### ${rel}\n\`\`\`\n${content.slice(0, MAX_FILE_CHARS)}\n\`\`\``);
    }

    const userPrompt = `## Ticket #${ticket.id}: ${ticket.title}
Severity: ${ticket.severity}
Labels: ${ticket.labels.join(", ")}

${ticket.description}

## Relevant Files
${fileSections.length ? fileSections.join("\n\n") : "(no files matched by keyword search)"}`;

    const res = await invokeRecovering(
      (m) => llm.invoke(m),
      [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(userPrompt)],
      FORMAT_NUDGE,
    );
    const fixPlan =
      typeof res.content === "string"
        ? res.content
        : res.content.map((c) => ("text" in c ? c.text : "")).join("");

    const estimatedLines = parseEstimatedLines(fixPlan);
    if (estimatedLines === null) {
      throw new Error("Planner response missing a parseable '## Estimated Lines Changed' integer");
    }

    await writeFile(path.join(planDir, "fix-plan.md"), fixPlan, "utf8");
    updateRun(state.runId, { status: "coding", fix_plan: fixPlan, estimated_lines: estimatedLines });
    return { fixPlan, estimatedLines };
  };
}

export const plannerNode = async (state: State) => {
  const llm = createLLM("planner"); // fail fast on a missing key, before waiting
  await rateLimitDelay();
  return createPlannerNode(llm, repoRoot(), agentDir())(state);
};
