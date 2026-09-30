import type { ModifiedFile } from "./state.js";

const CONTEXT = 3;

/** Line-by-line unified diff (LCS based) for a single file. Empty string if unchanged. */
export function unifiedDiff(filePath: string, before: string, after: string): string {
  if (before === after) return "";
  const a = before.split("\n");
  const b = after.split("\n");

  // LCS table
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  // Walk into an edit script of ' ', '-', '+' lines
  const ops: { t: " " | "-" | "+"; s: string }[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { ops.push({ t: " ", s: a[i] }); i++; j++; }
    else if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) { ops.push({ t: "+", s: b[j++] }); }
    else { ops.push({ t: "-", s: a[i++] }); }
  }

  // Group changes into hunks with context
  const out = [`--- a/${filePath}`, `+++ b/${filePath}`];
  const changed = ops.map((o, k) => (o.t === " " ? -1 : k)).filter((k) => k >= 0);
  let h = 0;
  while (h < changed.length) {
    let start = Math.max(0, changed[h] - CONTEXT);
    let end = Math.min(ops.length, changed[h] + CONTEXT + 1);
    while (h + 1 < changed.length && changed[h + 1] - CONTEXT <= end) {
      end = Math.min(ops.length, changed[++h] + CONTEXT + 1);
    }
    h++;
    const slice = ops.slice(start, end);
    const aStart = ops.slice(0, start).filter((o) => o.t !== "+").length + 1;
    const bStart = ops.slice(0, start).filter((o) => o.t !== "-").length + 1;
    const aLen = slice.filter((o) => o.t !== "+").length;
    const bLen = slice.filter((o) => o.t !== "-").length;
    out.push(`@@ -${aStart},${aLen} +${bStart},${bLen} @@`);
    out.push(...slice.map((o) => o.t + o.s));
  }
  return out.join("\n");
}

export function diffAll(files: ModifiedFile[]): string {
  return files.map((f) => unifiedDiff(f.path, f.originalContent, f.newContent)).filter(Boolean).join("\n\n");
}
