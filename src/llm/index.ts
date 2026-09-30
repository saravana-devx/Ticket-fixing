import "dotenv/config";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { getProvider } from "./registry.js";
import type { LLMRole, LLMSettings } from "./types.js";

export { registerProvider } from "./registry.js";
export type { LLMProvider, LLMRole } from "./types.js";

const DEFAULT_PROVIDER = "groq";

/**
 * Settings for a role, from env (nothing is hard-coded in the nodes):
 *   LLM_PROVIDER          groq | gemini | ...   (default groq)
 *   LLM_MODEL             model for every role  (default: the provider's default)
 *   PLANNER_MODEL / CODER_MODEL / REVIEWER_MODEL   override the model for one role
 *   LLM_TEMPERATURE       default 0
 *   LLM_DELAY_MS          min ms between LLM calls (default: the provider's default)
 */
export function getLLMSettings(role?: LLMRole): LLMSettings {
  const provider = getProvider((process.env.LLM_PROVIDER ?? DEFAULT_PROVIDER).toLowerCase());
  const roleModel = role ? process.env[`${role.toUpperCase()}_MODEL`] : undefined;
  return {
    provider,
    model: roleModel || process.env.LLM_MODEL || provider.defaultModel,
    temperature: Number(process.env.LLM_TEMPERATURE ?? 0),
    delayMs: Number(process.env.LLM_DELAY_MS ?? provider.defaultDelayMs),
  };
}

/** The only place nodes get a model from. Swap provider/model via env, not code. */
export function createLLM(role?: LLMRole): BaseChatModel {
  const { provider, model, temperature } = getLLMSettings(role);
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) throw new Error(`${provider.apiKeyEnv} is not set (required by LLM_PROVIDER=${provider.name})`);
  return provider.create({ model, apiKey, temperature });
}

/** Gemini/Groq may return content as a string or an array of parts. */
export function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === "string" ? c : (c?.text ?? ""))).join("");
  }
  return "";
}
