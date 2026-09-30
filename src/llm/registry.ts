import { geminiProvider } from "./providers/gemini.js";
import { groqProvider } from "./providers/groq.js";
import type { LLMProvider } from "./types.js";

const providers = new Map<string, LLMProvider>();

export function registerProvider(provider: LLMProvider) {
  providers.set(provider.name, provider);
}

export function getProvider(name: string): LLMProvider {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`Unknown LLM_PROVIDER "${name}". Available: ${[...providers.keys()].join(", ")}`);
  }
  return provider;
}

// Adding a provider = new file in providers/ + one line here.
registerProvider(groqProvider);
registerProvider(geminiProvider);
