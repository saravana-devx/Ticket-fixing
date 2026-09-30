import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createFileTools } from "./tools/fileTools.js";

const root = await mkdtemp(path.join(tmpdir(), "ft-"));
const [read, write, replace, list] = createFileTools(root);
const checks: [string, boolean][] = [];

await write.invoke({ path: "src/a.ts", content: "hello" });
checks.push(["writeFile creates nested file", (await readFile(path.join(root, "src/a.ts"), "utf8")) === "hello"]);
checks.push(["readFile reads it back", (await read.invoke({ path: "src/a.ts" })) === "hello"]);
checks.push(["listFiles lists dirs", JSON.parse(await list.invoke({ dir: "." })).includes("src/")]);
await write.invoke({ path: "src/b.ts", content: "a\nb\nb\n" });
await replace.invoke({ path: "src/a.ts", oldText: "hello", newText: "bye" });
checks.push(["replaceInFile edits one exact match", (await read.invoke({ path: "src/a.ts" })) === "bye"]);
let dup = false; try { await replace.invoke({ path: "src/b.ts", oldText: "b", newText: "c" }); } catch { dup = true; }
checks.push(["replaceInFile rejects ambiguous match", dup]);
let miss = false; try { await replace.invoke({ path: "src/a.ts", oldText: "zzz", newText: "c" }); } catch { miss = true; }
checks.push(["replaceInFile rejects missing text", miss]);
let threw = false;
try { await read.invoke({ path: "../../etc/passwd" }); } catch { threw = true; }
checks.push(["path traversal rejected", threw]);

for (const [n, ok] of checks) console.log(ok ? "PASS" : "FAIL", n);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
