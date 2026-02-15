import type { ToolSchemaItem } from '../types';

interface PlannerInput {
  userRequest: string;
  stage: string | null;
  executionAllowed: boolean;
  pendingExecutionAction: {
    type: string;
    reason: string;
    payload: Record<string, unknown>;
  } | null;
  uiSummary: Record<string, unknown>;
  availableTools: ToolSchemaItem[];
  messageHistoryTail: unknown[];
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

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = process.env.AGENT_OPENAI_MODEL || 'gpt-5.2';

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
          '- You may choose action.type="none" if clarification is needed.\n' +
          '- If action.type="tool.call", toolName must be one of available tools.\n' +
          '- Priority: use GUI adaptation first (filter/sort/highlight/augment/postMessage) to reconfirm intent.\n' +
          '- Never execute select/next/prev/setQuantity without explicit user confirmation.\n' +
          '- If executionAllowed is false, do not choose select/next/prev/setQuantity.\n' +
          '- select requires params.itemId from visible item ids.\n' +
          '- setQuantity requires integer quantity >= 0.\n' +
          '- postMessage should be used for concise, user-friendly explanation when helpful.\n' +
          '- assistantMessage must always be English.\n' +
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
        strict: true,
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
    throw new Error(`OpenAI planner failed (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as unknown;
  const outputText = parseOutputText(payload);
  if (!outputText) return null;
  const parsed = parseJsonObject(outputText);
  if (!parsed) return null;

  return toPlannerOutput(parsed);
}
