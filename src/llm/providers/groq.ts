import { ChatGroq } from "@langchain/groq";
import { MAX_RETRIES, rateLimitRetryHandler } from "../retry.js";
import type { LLMProvider } from "../types.js";

export const groqProvider: LLMProvider = {
  name: "groq",
  apiKeyEnv: "GROQ_API_KEY",
  defaultModel: "openai/gpt-oss-120b", // available on this key; supports tool calling (needed by the coder)
  defaultDelayMs: 3000,
  rateLimitWaitMs: 20000,
  create: ({ model, apiKey, temperature }) =>
    new ChatGroq({
      model,
      apiKey,
      temperature,
      maxRetries: MAX_RETRIES,
      onFailedAttempt: rateLimitRetryHandler(20000),
    }),
};
