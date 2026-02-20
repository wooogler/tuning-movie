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
  type: 'request' | 'response.raw' | 'response.parsed' | 'error';
  payload: unknown;
}

type LlmTraceListener = (event: LlmTraceEvent) => void;

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = process.env.AGENT_OPENAI_MODEL || 'gpt-5.2';
const DEBUG_LLM = process.env.AGENT_LLM_DEBUG === 'true';
const llmTraceListeners = new Set<LlmTraceListener>();

function emitLlmTrace(type: LlmTraceEvent['type'], payload: unknown): void {
  if (!DEBUG_LLM) return;
  const event: LlmTraceEvent = { type, payload };
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

function isEnabled(): boolean {
  if (process.env.AGENT_ENABLE_OPENAI === 'false') return false;
  return Boolean(process.env.OPENAI_API_KEY);
}

function parseOutputText(body: unknown): string | null {
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

export async function planActionWithOpenAI(input: PlannerInput): Promise<PlannerOutput | null> {
  if (!isEnabled()) return null;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const body = {
    model: DEFAULT_MODEL,
    input: [
      {
        role: 'system',
        content:
          'You are a UI agent for movie booking. Pick exactly one next step that best reflects user intent and current GUI state.\n' +
          'Constraints:\n' +
          '- Return JSON only via schema.\n' +
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
          '- Use execution tools (select/next/prev/setQuantity) only when the latest user-originated turn commits to a concrete next action (explicit instruction or unambiguous confirmation).\n' +
          '- Do not treat assistant-generated recommendations, options, or follow-up questions by themselves as confirmation; allow commitment actions only after a user-originated explicit or unambiguous affirmation.\n' +
          '- Choose exactly one action for this turn.\n' +
          '- select requires params.itemId from visible item ids.\n' +
          '- setQuantity requires integer quantity >= 0.\n' +
          '- assistantMessage must be plain text only (no Markdown, no code fences, no bullet lists, no links).\n' +
          '- Keep assistantMessage short and natural.',
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
        // Keep strict mode off because params are tool-dependent and may include dynamic keys.
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

  if (DEBUG_LLM) {
    console.log('[tuning-agent-typescript][llm] planner request input:', JSON.stringify(input));
  }
  emitLlmTrace('request', { model: DEFAULT_MODEL, input });

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (DEBUG_LLM) {
      console.error('[tuning-agent-typescript][llm] planner error response:', errorText);
    }
    emitLlmTrace('error', { status: response.status, errorText });
    throw new Error(`OpenAI planner failed (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as unknown;
  const outputText = parseOutputText(payload);
  if (DEBUG_LLM) {
    console.log('[tuning-agent-typescript][llm] planner raw output_text:', outputText);
  }
  emitLlmTrace('response.raw', { outputText });
  if (!outputText) return null;
  const parsed = parseJsonObject(outputText);
  if (DEBUG_LLM) {
    console.log('[tuning-agent-typescript][llm] planner parsed output:', JSON.stringify(parsed));
  }
  emitLlmTrace('response.parsed', { parsed });
  if (!parsed) return null;

  return toPlannerOutput(parsed);
}
