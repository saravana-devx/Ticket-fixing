import { HumanMessage, type BaseMessage } from "@langchain/core/messages";

/**
 * Providers (Groq) reject a generation with HTTP 400 when the model emits malformed output or
 * calls a tool that doesn't exist. Re-sending the identical request tends to fail identically,
 * so these are not blind-retried; `invokeRecovering` tells the model what went wrong instead.
 */
export function isRecoverableModelError(error: unknown): boolean {
  const text = String((error as any)?.message ?? error);
  return /output_parse_failed|tool_use_failed|failed_generation/.test(text);
}

export const TOOL_NUDGE =
  "Your last response was rejected: it was malformed or called a tool that does not exist. " +
  "Use ONLY the tools you were given, via proper tool calls (or reply in plain text if you are finished).";
export const FORMAT_NUDGE =
  "Your last response was rejected because it could not be parsed. Reply again using exactly the required format.";

/** Calls `invoke`; on a recoverable model error appends a corrective message and tries again. */
export async function invokeRecovering<T>(
  invoke: (messages: BaseMessage[]) => Promise<T>,
  messages: BaseMessage[],
  nudge: string,
  maxRecoveries = 3,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await invoke(messages);
    } catch (error) {
      if (!isRecoverableModelError(error) || attempt >= maxRecoveries) throw error;
      console.log(`[Recovery] Model output rejected by provider — nudging and retrying (${attempt + 1}/${maxRecoveries})`);
      messages.push(new HumanMessage(nudge));
    }
  }
}
