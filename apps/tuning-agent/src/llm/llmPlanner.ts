import type { ToolSchemaItem } from '../types';

export interface PlannerWorkflow {
  stageOrder: string[];
  currentStage: string;
  previousStage: string | null;
  nextStage: string | null;
  stageGoal: string;
  proceedRule: string;
  availableToolNames: string[];
  guardrails: string[];
  constraints: string[];
  preferences: string[];
  conflicts: string[];
}

interface PlannerInput {
  history: unknown[];
  availableTools: ToolSchemaItem[];
  workflow: PlannerWorkflow;
}

interface PlannerAction {
  type: 'tool.call' | 'none';
  toolName: string;
  params: Record<string, unknown>;
  reason: string;
}

export interface PlannerOutput {
  assistantMessage: string;
  action: PlannerAction;
}

interface LlmTraceEvent {
  component: 'planner';
  type: 'request' | 'response.raw' | 'response.parsed' | 'error';
  payload: unknown;
}

type LlmTraceListener = (event: LlmTraceEvent) => void;

const DEBUG_LLM = process.env.AGENT_LLM_DEBUG === 'true';
const MONITOR_LLM_TRACE_ENABLED = process.env.AGENT_MONITOR_LLM_TRACE !== 'false';
const llmTraceListeners = new Set<LlmTraceListener>();

function emitLlmTrace(type: LlmTraceEvent['type'], payload: unknown): void {
  if (!MONITOR_LLM_TRACE_ENABLED) return;
  const event: LlmTraceEvent = { component: 'planner', type, payload };
  for (const listener of llmTraceListeners) {
    listener(event);
  }
}

export function subscribeLlmTrace(listener: LlmTraceListener): () => void {
  llmTraceListeners.add(listener);
  return () => {
    llmTraceListeners.delete(listener);
  };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function toPlannerOutput(value: Record<string, unknown>): PlannerOutput | null {
  const assistantMessage =
    typeof value.assistantMessage === 'string' ? value.assistantMessage.trim() : '';

  const actionRaw =
    value.action && typeof value.action === 'object' && !Array.isArray(value.action)
      ? (value.action as Record<string, unknown>)
      : null;
  if (!actionRaw) return null;

  const type = actionRaw.type === 'tool.call' || actionRaw.type === 'none' ? actionRaw.type : null;
  if (!type) return null;

  const toolName = typeof actionRaw.toolName === 'string' ? actionRaw.toolName.trim() : '';
  const reason = typeof actionRaw.reason === 'string' ? actionRaw.reason.trim() : '';
  const params =
    actionRaw.params && typeof actionRaw.params === 'object' && !Array.isArray(actionRaw.params)
      ? (actionRaw.params as Record<string, unknown>)
      : {};

  if (!reason) return null;

  return {
    assistantMessage,
    action: {
      type,
      toolName,
      params,
      reason,
    },
  };
}

const SYSTEM_PROMPT =
  'You are a UI agent. Pick exactly one next step that best reflects user intent and current GUI state.\n' +
  'Constraints:\n' +
  '- Use the provided history stream as context. Infer intent from the conversation, prioritizing unresolved recent user preferences.\n' +
  '- Use the provided workflow object as process guidance (stage order, current/next stage, proceedRule, guardrails).\n' +
  '- Treat workflow.currentStage and availableTools as operational boundaries.\n' +
  '- If intent is reasonably clear, prefer taking one concrete action over asking repetitive clarification questions.\n' +
  '- When intent remains broad, ambiguous, recommendation-seeking, or preference-seeking, prefer GUI adaptation tools (filter/sort/highlight/augment) and avoid commitment actions.\n' +
  '- assistantMessage is the user-facing conversational response.\n' +
  '- Choose action.type="none" when clarification/confirmation is needed, or when the next step would commit to a choice without clear user confirmation.\n' +
  '- If action.type="tool.call", toolName must be one of available tools.\n' +
  '- Keep assistantMessage consistent with action: if action.type="tool.call", describe the action being taken and do not ask for permission.\n' +
  '- If assistantMessage asks for confirmation or permission, action.type must be "none".\n' +
  '- Use execution tools (select/next/prev/startOver) only when the latest user-originated turn commits to a concrete next action (explicit instruction or unambiguous confirmation).\n' +
  '- Do not treat assistant-generated recommendations, options, or follow-up questions by themselves as confirmation; allow commitment actions only after a user-originated explicit or unambiguous affirmation.\n' +
  '- Choose exactly one action for this turn.\n' +
  '- select requires params.itemId from visible item ids.\n' +
  '- Never include internal item ids (for example m1, t2) in assistantMessage; refer to human-readable item values only.\n' +
  '- assistantMessage must be plain text only (no Markdown, no code fences, no bullet lists, no links).\n' +
  '- Keep assistantMessage short and natural.\n' +
  '- workflow.constraints = accumulated system availability facts from prior turns. Factor these into feasibility checks and action selection.\n' +
  '- workflow.preferences = accumulated user preferences from prior turns. Respect these when choosing items or making recommendations.\n' +
  '- workflow.conflicts = current contradictions between preferences and constraints. Address or resolve these conflicts before committing.\n' +
  '- If there are multiple viable options and no explicit user commitment to one item, prefer action.type="none" and ask for a concise confirmation.';

// ── OpenAI ──────────────────────────────────────────────────────────────────

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const OPENAI_MODEL = process.env.AGENT_OPENAI_MODEL || 'gpt-5.2';
const DEFAULT_OPENAI_TEMPERATURE = 0;
const OPENAI_TEMPERATURE_OFF_SENTINELS = new Set(['default', 'none', 'omit', 'off']);

function resolveOpenAITemperature(): number | undefined {
  const raw = process.env.AGENT_OPENAI_TEMPERATURE;
  if (typeof raw !== 'string' || !raw.trim()) return DEFAULT_OPENAI_TEMPERATURE;

  const normalized = raw.trim().toLowerCase();
  if (OPENAI_TEMPERATURE_OFF_SENTINELS.has(normalized)) {
    return undefined;
  }

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_OPENAI_TEMPERATURE;
  return Math.min(2, Math.max(0, parsed));
}

function isUnsupportedTemperatureError(status: number, errorText: string): boolean {
  if (status !== 400) return false;
  const lowered = errorText.toLowerCase();
  return (
    lowered.includes('temperature') &&
    (lowered.includes('not supported') ||
      lowered.includes('unsupported') ||
      lowered.includes('only support') ||
      lowered.includes('invalid'))
  );
}

function parseOpenAIOutputText(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;

  if (typeof record.output_text === 'string' && record.output_text.trim()) {
    return record.output_text.trim();
  }

  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const itemRecord = item as Record<string, unknown>;
    const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const partRecord = part as Record<string, unknown>;
      if (typeof partRecord.text === 'string' && partRecord.text.trim()) {
        return partRecord.text.trim();
      }
    }
  }
  return null;
}

export async function planActionWithOpenAI(input: PlannerInput): Promise<PlannerOutput | null> {
  if (process.env.AGENT_ENABLE_OPENAI === 'false') return null;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const temperature = resolveOpenAITemperature();

  const baseBody = {
    model: OPENAI_MODEL,
    input: [
      {
        role: 'system',
        content:
          SYSTEM_PROMPT +
          '\n- Return JSON only via schema.',
      },
      {
        role: 'user',
        content: JSON.stringify(input),
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'planner_decision',
        strict: false,
        schema: {
          type: 'object',
          properties: {
            assistantMessage: { type: 'string' },
            action: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['tool.call', 'none'] },
                toolName: { type: 'string' },
                params: { type: 'object', additionalProperties: true },
                reason: { type: 'string' },
              },
              required: ['type', 'toolName', 'params', 'reason'],
              additionalProperties: false,
            },
          },
          required: ['assistantMessage', 'action'],
          additionalProperties: false,
        },
      },
    },
  };
  const body =
    typeof temperature === 'number'
      ? { ...baseBody, temperature }
      : baseBody;

  if (DEBUG_LLM) {
    console.log('[tuning-agent-v2][llm] planner request input:', JSON.stringify(input));
  }
  emitLlmTrace('request', {
    model: OPENAI_MODEL,
    input,
    temperature: typeof temperature === 'number' ? temperature : null,
  });

  let response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const firstErrorText = await response.text();
    const shouldRetryWithoutTemperature =
      typeof temperature === 'number' &&
      isUnsupportedTemperatureError(response.status, firstErrorText);

    if (shouldRetryWithoutTemperature) {
      if (DEBUG_LLM) {
        console.warn(
          '[tuning-agent-v2][llm] planner temperature rejected; retrying without temperature'
        );
      }
      emitLlmTrace('request', {
        model: OPENAI_MODEL,
        input,
        temperature: null,
        retryWithoutTemperature: true,
      });
      response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(baseBody),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      if (DEBUG_LLM) {
        console.error('[tuning-agent-v2][llm] planner error response:', errorText);
      }
      emitLlmTrace('error', { status: response.status, errorText });
      throw new Error(`OpenAI planner failed (${response.status}): ${errorText}`);
    }
  }

  const payload = (await response.json()) as unknown;
  const outputText = parseOpenAIOutputText(payload);
  if (DEBUG_LLM) {
    console.log('[tuning-agent-v2][llm] planner raw output_text:', outputText);
  }
  emitLlmTrace('response.raw', { outputText });
  if (!outputText) return null;
  const parsed = parseJsonObject(outputText);
  if (DEBUG_LLM) {
    console.log('[tuning-agent-v2][llm] planner parsed output:', JSON.stringify(parsed));
  }
  emitLlmTrace('response.parsed', { parsed });
  if (!parsed) return null;

  return toPlannerOutput(parsed);
}

// ── Gemini ──────────────────────────────────────────────────────────────────

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = process.env.AGENT_GEMINI_MODEL || 'gemini-2.5-flash';

function extractGeminiText(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;

  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const candidateRecord = candidate as Record<string, unknown>;
    const content = candidateRecord.content;
    if (!content || typeof content !== 'object') continue;
    const contentRecord = content as Record<string, unknown>;
    const parts = Array.isArray(contentRecord.parts) ? contentRecord.parts : [];
    for (const part of parts) {
      if (!part || typeof part !== 'object') continue;
      const partRecord = part as Record<string, unknown>;
      if (typeof partRecord.text === 'string' && partRecord.text.trim()) {
        return partRecord.text.trim();
      }
    }
  }
  return null;
}

export async function planActionWithGemini(input: PlannerInput): Promise<PlannerOutput | null> {
  if (process.env.AGENT_ENABLE_GEMINI === 'false') return null;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const geminiSystemPrompt =
    SYSTEM_PROMPT +
    '\n- Return JSON only matching this schema: { "assistantMessage": string, "action": { "type": "tool.call" | "none", "toolName": string, "params": object, "reason": string } }';

  const body = {
    systemInstruction: {
      parts: [{ text: geminiSystemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: JSON.stringify(input) }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };

  if (DEBUG_LLM) {
    console.log('[tuning-agent-v2][llm:gemini] planner request input:', JSON.stringify(input));
  }
  emitLlmTrace('request', { model: GEMINI_MODEL, input });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (DEBUG_LLM) {
      console.error('[tuning-agent-v2][llm:gemini] planner error response:', errorText);
    }
    emitLlmTrace('error', { status: response.status, errorText });
    throw new Error(`Gemini planner failed (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as unknown;
  const outputText = extractGeminiText(payload);
  if (DEBUG_LLM) {
    console.log('[tuning-agent-v2][llm:gemini] planner raw output:', outputText);
  }
  emitLlmTrace('response.raw', { outputText });
  if (!outputText) return null;

  const parsed = parseJsonObject(outputText);
  if (DEBUG_LLM) {
    console.log('[tuning-agent-v2][llm:gemini] planner parsed output:', JSON.stringify(parsed));
  }
  emitLlmTrace('response.parsed', { parsed });
  if (!parsed) return null;

  return toPlannerOutput(parsed);
}
