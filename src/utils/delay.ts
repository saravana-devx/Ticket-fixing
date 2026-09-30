import { getLLMSettings } from "../llm/index.js";

/** Waits between LLM calls. Default gap comes from the active provider (LLM_DELAY_MS overrides). */
export async function rateLimitDelay(ms: number = getLLMSettings().delayMs): Promise<void> {
  if (ms <= 0) return;
  console.log(`[Rate Limit] Waiting ${ms / 1000}s before next LLM call...`);
  await new Promise((resolve) => setTimeout(resolve, ms));
}
