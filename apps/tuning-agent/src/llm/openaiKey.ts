/**
 * Resolves the OpenAI API key for this agent process.
 *
 * The backend spawns one agent process per session and injects a
 * session-supplied key as AGENT_OPENAI_API_KEY, which takes precedence over the
 * operator key configured in the environment. The returned value is a secret:
 * never log it, trace it, or include it in any relay payload.
 */
export function resolveOpenAiApiKey(): string {
  return (
    process.env.AGENT_OPENAI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    ""
  );
}
