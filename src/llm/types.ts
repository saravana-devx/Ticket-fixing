import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

/** Each pipeline step that calls an LLM. Lets you use a different model per step. */
export type LLMRole = "planner" | "coder" | "reviewer";

export interface CreateModelOptions {
  model: string;
  apiKey: string;
  temperature: number;
}

/**
 * Strategy interface: everything provider-specific lives behind this. To add a provider,
 * write one file in `providers/` implementing it and register it in `registry.ts`.
 */
export interface LLMProvider {
  /** Value of LLM_PROVIDER that selects this provider. */
  readonly name: string;
  /** Env var holding this provider's API key. */
  readonly apiKeyEnv: string;
  readonly defaultModel: string;
  /** Minimum gap between LLM calls (rate limit) unless LLM_DELAY_MS overrides it. */
  readonly defaultDelayMs: number;
  /** How long to wait before retrying after a 429. */
  readonly rateLimitWaitMs: number;
  create(options: CreateModelOptions): BaseChatModel;
}

/** Resolved settings for one LLM role. */
export interface LLMSettings {
  provider: LLMProvider;
  model: string;
  temperature: number;
  delayMs: number;
}
