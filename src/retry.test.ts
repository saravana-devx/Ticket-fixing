import { rateLimitRetryHandler } from "./llm/retry.js";

const h = rateLimitRetryHandler(0);
const rejects = async (msg: string) => { try { await h(new Error(msg)); return false; } catch { return true; } };
const checks: [string, boolean][] = [
  ["429 waits and retries", !(await rejects("429 Too Many Requests"))],
  ["400 output_parse_failed is not blind-retried (recovery handles it)", await rejects('400 {"error":{"code":"output_parse_failed"}}')],
  ["other 400 is not retried", await rejects("400 Bad Request: invalid json")],
  ["401 is not retried", await rejects("401 Unauthorized")],
  ["404 model_not_found is not retried", await rejects("404 model_not_found")],
  ["5xx is retried", !(await rejects("503 Service Unavailable"))],
];
for (const [n, ok] of checks) console.log(ok ? "PASS" : "FAIL", n);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;

import { retryAfterSeconds } from "./llm/retry.js";
const hdr = { headers: new Headers({ "retry-after": "28" }), message: "429" };
const msg = { message: "429 ... Please try again in 27.12s. Need more" };
const ms = { message: "429 Please try again in 250ms." };
const r2: [string, boolean][] = [
  ["retry-after header is honoured", retryAfterSeconds(hdr) === 28],
  ["'try again in 27.12s' is parsed", retryAfterSeconds(msg) === 27.12],
  ["'try again in 250ms' is parsed", retryAfterSeconds(ms) === 0.25],
  ["no hint -> undefined", retryAfterSeconds({ message: "429" }) === undefined],
];
for (const [n, ok] of r2) console.log(ok ? "PASS" : "FAIL", n);
if (r2.some(([, ok]) => !ok)) process.exitCode = 1;
