import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { repoRoot } from "../config.js";

const IGNORED = new Set(["node_modules", ".git", "dist"]);

/** Resolves a path inside root, rejecting anything that escapes it. */
function resolveInside(root: string, p: string): string {
  const abs = path.resolve(root, p);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path escapes the project root: ${p}`);
  }
  return abs;
}

/** Builds readFile / writeFile / listFiles tools sandboxed to `root`. */
export function createFileTools(root = repoRoot()) {
  const readFileTool = tool(
    async ({ path: p }) => readFile(resolveInside(root, p), "utf8"),
    {
      name: "readFile",
      description: "Read a file from disk and return its contents.",
      schema: z.object({ path: z.string().describe("File path relative to the project root") }),
    },
  );

  const writeFileTool = tool(
    async ({ path: p, content }) => {
      const abs = resolveInside(root, p);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content, "utf8");
      return `Wrote ${p}`;
    },
    {
      name: "writeFile",
      description: "Write full file contents to disk, replacing the existing file.",
      schema: z.object({
        path: z.string().describe("File path relative to the project root"),
        content: z.string().describe("Complete new file contents"),
      }),
    },
  );

  const replaceInFileTool = tool(
    async ({ path: p, oldText, newText }) => {
      const abs = resolveInside(root, p);
      const content = await readFile(abs, "utf8");
      const count = content.split(oldText).length - 1;
      if (count === 0) throw new Error(`oldText not found in ${p}`);
      if (count > 1) throw new Error(`oldText matches ${count} places in ${p}; include more surrounding lines to make it unique`);
      await writeFile(abs, content.replace(oldText, () => newText), "utf8");
      return `Edited ${p}`;
    },
    {
      name: "replaceInFile",
      description:
        "Replace one exact occurrence of oldText with newText in a file. Preferred for small edits: " +
        "much cheaper than rewriting the whole file with writeFile. oldText must match exactly once.",
      schema: z.object({
        path: z.string().describe("File path relative to the project root"),
        oldText: z.string().describe("Exact existing text to replace (must occur exactly once)"),
        newText: z.string().describe("Replacement text"),
      }),
    },
  );

  const listFilesTool = tool(
    async ({ dir }) => {
      const entries = await readdir(resolveInside(root, dir), { withFileTypes: true });
      const names = entries
        .filter((e) => !IGNORED.has(e.name))
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
      return JSON.stringify(names);
    },
    {
      name: "listFiles",
      description: "List files and directories (directories end with /) in a directory.",
      schema: z.object({ dir: z.string().describe("Directory path relative to the project root, e.g. '.'") }),
    },
  );

  return [readFileTool, writeFileTool, replaceInFileTool, listFilesTool] as const;
}
