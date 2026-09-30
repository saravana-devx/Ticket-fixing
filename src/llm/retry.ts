/**
 * Shared retry policy for every provider: wait `waitMs` on a 429, rethrow client errors
 * (bad key, unknown model, ...) immediately instead of retrying them.
 * Malformed-output errors are handled by `invokeRecovering` (recovery.ts), not here.
 */
/** Seconds the provider asked us to wait (retry-after header, or "try again in 27.12s"). */
export function retryAfterSeconds(error: any): number | undefined {
  const header = error?.headers?.get?.("retry-after") ?? error?.headers?.["retry-after"];
  const fromHeader = Number(header);
  if (header !== undefined && header !== null && Number.isFinite(fromHeader)) return fromHeader;
  const m = String(error?.message ?? "").match(/try again in\s+([\d.]+)\s*(ms|s)\b/i);
  if (!m) return undefined;
  return m[2].toLowerCase() === "ms" ? Number(m[1]) / 1000 : Number(m[1]);
}

const MAX_WAIT_MS = 120_000;

export function rateLimitRetryHandler(waitMs: number) {
  return async (error: any): Promise<void> => {
    const message = String(error?.message ?? "");
    if (message.includes("429")) {
      // Trust the provider's hint (plus a margin); fall back to the configured wait.
      const hint = retryAfterSeconds(error);
      const wait = hint !== undefined ? Math.min(MAX_WAIT_MS, Math.ceil(hint * 1000) + 2000) : waitMs;
      console.log(`[Rate Limit] 429 hit — waiting ${wait / 1000}s before retry...`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      return;
    }
    if (/\b(400|401|403|404)\b/.test(message)) throw error;
  };
}

export const MAX_RETRIES = 5;
