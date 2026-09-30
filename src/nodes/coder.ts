import { readFile } from "node:fs/promises";
import path from "node:path";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { updateRun } from "../db.js";
import { repoRoot } from "../config.js";
import { invokeRecovering, TOOL_NUDGE } from "../llm/recovery.js";
import { rateLimitDelay } from "../utils/delay.js";
import { contentToText, createLLM } from "../llm/index.js";
import type { ModifiedFile, State } from "../state.js";
import { createFileTools } from "../tools/fileTools.js";

const BASE_PROMPT = `You are an expert software engineer. Your job is to fix a bug based on a fix plan.

You have access to tools: readFile, writeFile, replaceInFile, listFiles.

Steps:
1. Read the fix plan (it is included in the user message below — it is NOT a file in the repo, so do not look for fix-plan.md)
2. Read each file listed in "Files to Modify"
3. Apply the fix carefully — do not change unrelated code
4. Apply the change with replaceInFile (small edits; oldText must match exactly once). Use writeFile only for new files or full rewrites
5. Return a JSON summary of what you changed:
{
  "modifiedFiles": [
    { "path": "src/foo.ts", "summary": "Fixed null check on line 42" }
  ]
}`;

const MAX_TOOL_ITERATIONS = 20;
const MAX_DB_FILE_CHARS = 50_000;

const SummarySchema = z.object({
  modifiedFiles: z.array(z.object({ path: z.string(), summary: z.string() })),
});

/** The slice of a chat model the coder needs: tool binding + invoke. */
export interface ToolCallingModel {
  bindTools(tools: any[]): { invoke(messages: BaseMessage[]): Promise<AIMessage> };
}

function truncateForDb(f: ModifiedFile): ModifiedFile {
  const cap = (s: string) =>
    s.length > MAX_DB_FILE_CHARS ? `[truncated: ${s.length} chars]` : s;
  return { ...f, originalContent: cap(f.originalContent), newContent: cap(f.newContent) };
}

/** `beforeNextCall` runs before every LLM call after the first in the tool loop (rate limiting). */
export function createCoderNode(
  llm: ToolCallingModel,
  root = repoRoot(),
  beforeNextCall: () => Promise<void> = async () => {},
) {
  return async function coderNode(state: State): Promise<Partial<State>> {
    const retryCount = (state.retryCount ?? 0) + 1;
    const tools = createFileTools(root);
    const toolsByName = new Map<string, (typeof tools)[number]>(tools.map((t) => [t.name, t]));
    const model = llm.bindTools([...tools]);

    const system =
      BASE_PROMPT +
      (state.reviewFeedback
        ? `\n\nThe reviewer rejected your previous attempt. Address this feedback precisely:\n${state.reviewFeedback}`
        : "");

    const messages: BaseMessage[] = [
      new SystemMessage(system),
      new HumanMessage(
        `Ticket #${state.ticket.id}: ${state.ticket.title}\n${state.ticket.description}\n\nFix plan:\n${state.fixPlan}`,
      ),
    ];

    // Original content of each file, captured just before its first write. On a retry the
    // disk already holds the previous attempt, so seed from the true originals in state.
    const originals = new Map<string, string>(
      (state.modifiedFiles ?? []).map((f) => [f.path, f.originalContent]),
    );
    let finalText = "";

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      if (i > 0) await beforeNextCall();
      const reply = await invokeRecovering((m) => model.invoke(m), messages, TOOL_NUDGE);
      messages.push(reply);
      const calls = reply.tool_calls ?? [];
      if (calls.length === 0) {
        finalText = contentToText(reply.content);
        break;
      }
      for (const call of calls) {
        let result: string;
        try {
          const t = toolsByName.get(call.name);
          if (!t) throw new Error(`Unknown tool: ${call.name}`);
          if (call.name === "writeFile" || call.name === "replaceInFile") {
            const p = String(call.args.path);
            if (!originals.has(p)) {
              originals.set(p, await readFile(path.resolve(root, p), "utf8").catch(() => ""));
            }
          }
          result = String(await (t as any).invoke(call.args));
        } catch (err) {
          result = `Error: ${(err as Error).message}`;
        }
        messages.push(new ToolMessage({ content: result, tool_call_id: call.id ?? call.name, name: call.name }));
      }
    }

    // Safely parse the model's JSON summary (informational only).
    try {
      const json = finalText.match(/\{[\s\S]*\}/)?.[0];
      if (json) {
        const summary = SummarySchema.parse(JSON.parse(json));
        for (const f of summary.modifiedFiles) console.log(`  ${f.path}: ${f.summary}`);
      }
    } catch {
      console.warn("Coder summary was not valid JSON; relying on files on disk");
    }

    // Source of truth: read written files back and keep the ones that really changed.
    const modifiedFiles: ModifiedFile[] = [];
    for (const [p, originalContent] of originals) {
      const newContent = await readFile(path.resolve(root, p), "utf8");
      if (newContent !== originalContent) modifiedFiles.push({ path: p, originalContent, newContent });
    }

    updateRun(state.runId, {
      status: "reviewing",
      modified_files: JSON.stringify(modifiedFiles.map(truncateForDb)),
      retry_count: retryCount,
    });
    return { modifiedFiles, retryCount, status: "reviewing" };
  };
}

export const coderNode = async (state: State) => {
  const llm = createLLM("coder") as unknown as ToolCallingModel;
  await rateLimitDelay();
  // Every further tool-loop iteration is another LLM request, so it is delayed too.
  return createCoderNode(
    llm,
    repoRoot(),
    () => rateLimitDelay(),
  )(state);
};
