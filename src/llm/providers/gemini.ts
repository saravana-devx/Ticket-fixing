import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { MAX_RETRIES, rateLimitRetryHandler } from "../retry.js";
import type { LLMProvider } from "../types.js";

export const geminiProvider: LLMProvider = {
  name: "gemini",
  apiKeyEnv: "GOOGLE_API_KEY",
  defaultModel: "gemini-3.6-flash",
  defaultDelayMs: 15000, // free tier: 5 RPM
  rateLimitWaitMs: 60000,
  create: ({ model, apiKey, temperature }) =>
    new ChatGoogleGenerativeAI({
      model,
      apiKey,
      temperature,
      maxRetries: MAX_RETRIES,
      onFailedAttempt: rateLimitRetryHandler(60000),
    }),
};
