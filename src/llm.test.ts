import { FakeListChatModel } from "@langchain/core/utils/testing";

const { createLLM, getLLMSettings, registerProvider } = await import("./llm/index.js");
const { rateLimitDelay } = await import("./utils/delay.js");

const env = (vars: Record<string, string | undefined>) => {
  for (const k of ["LLM_PROVIDER", "LLM_MODEL", "PLANNER_MODEL", "CODER_MODEL", "REVIEWER_MODEL", "LLM_DELAY_MS", "GROQ_API_KEY", "GOOGLE_API_KEY", "FAKE_KEY"]) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
};
const throws = (f: () => unknown, re: RegExp) => { try { f(); return false; } catch (e) { return re.test((e as Error).message); } };
const checks: [string, boolean][] = [];

env({});
checks.push(["defaults to groq + its default model/delay", getLLMSettings().provider.name === "groq" && getLLMSettings().model === "openai/gpt-oss-120b" && getLLMSettings().delayMs === 3000]);

env({ LLM_PROVIDER: "gemini" });
checks.push(["LLM_PROVIDER=gemini switches provider and delay", getLLMSettings().provider.name === "gemini" && getLLMSettings().delayMs === 15000]);

env({ LLM_MODEL: "m-all", CODER_MODEL: "m-coder", LLM_DELAY_MS: "0" });
checks.push(["LLM_MODEL applies to all roles", getLLMSettings("planner").model === "m-all"]);
checks.push(["role override wins", getLLMSettings("coder").model === "m-coder"]);
checks.push(["LLM_DELAY_MS overrides provider default", getLLMSettings().delayMs === 0]);

env({ LLM_PROVIDER: "nope" });
checks.push(["unknown provider lists available ones", throws(() => createLLM(), /Unknown LLM_PROVIDER "nope".*groq.*gemini/)]);

env({});
checks.push(["missing key gives a clear error", throws(() => createLLM(), /GROQ_API_KEY is not set/)]);

env({ GROQ_API_KEY: "gsk_test" });
const groq = createLLM("planner") as any;
checks.push(["groq model is built with the configured model", groq.model === "openai/gpt-oss-120b" || groq.modelName === "openai/gpt-oss-120b"]);

// A new provider needs only registerProvider — no node changes.
registerProvider({
  name: "fake", apiKeyEnv: "FAKE_KEY", defaultModel: "fake-1", defaultDelayMs: 0, rateLimitWaitMs: 0,
  create: () => new FakeListChatModel({ responses: ["hi"] }),
});
env({ LLM_PROVIDER: "fake", FAKE_KEY: "k" });
checks.push(["custom provider registers and is used", (await createLLM("reviewer").invoke("x")).content === "hi"]);

const t = Date.now();
await rateLimitDelay(0);
checks.push(["zero delay does not wait", Date.now() - t < 50]);

for (const [n, ok] of checks) console.log(ok ? "PASS" : "FAIL", n);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
