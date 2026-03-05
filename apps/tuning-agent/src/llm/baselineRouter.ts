interface BaselineVisibleItem {
  id: string;
  value: string;
  isDisabled?: boolean;
}

export interface BaselineRouterInput {
  currentStage: 'movie' | 'theater' | 'date' | 'time' | 'seat' | 'confirm';
  availableToolNames: Array<'select' | 'selectMultiple' | 'next' | 'prev' | 'startOver'>;
  visibleItems: BaselineVisibleItem[];
  selectedId: string | null;
  selectedListCount: number;
  userMessage: string;
  stageGoal: string;
  proceedRule: string;
}

interface BaselineRouterAction {
  toolName: 'select' | 'selectMultiple' | 'next' | 'prev' | 'startOver' | 'none';
  params: Record<string, unknown>;
  reason: string;
}

export interface BaselineRouterOutput {
  action: BaselineRouterAction;
}

interface LlmTraceEvent {
  component: 'planner';
  type: 'request' | 'response.raw' | 'response.parsed' | 'error';
  payload: unknown;
}

type LlmTraceListener = (event: LlmTraceEvent) => void;

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const OPENAI_MODEL = process.env.AGENT_OPENAI_MODEL || 'gpt-5.2';
const DEFAULT_OPENAI_TEMPERATURE = 0;
const OPENAI_TEMPERATURE_OFF_SENTINELS = new Set(['default', 'none', 'omit', 'off']);
const DEBUG_LLM = process.env.AGENT_LLM_DEBUG === 'true';

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

const monitorEnabled =
  parseBooleanEnv(process.env.AGENT_MONITOR_ENABLED) ?? process.env.NODE_ENV !== 'production';
const monitorLlmTraceOverride = parseBooleanEnv(process.env.AGENT_MONITOR_LLM_TRACE);
const MONITOR_LLM_TRACE_ENABLED = monitorEnabled && (monitorLlmTraceOverride ?? true);
const llmTraceListeners = new Set<LlmTraceListener>();

const BASELINE_ROUTER_SYSTEM_PROMPT =
  'You are a strict GUI intent router for a booking UI.\n' +
  'Your job is to map one user utterance to exactly one GUI action.\n' +
  'Allowed action.toolName values: select, selectMultiple, next, prev, startOver, none.\n' +
  'Rules:\n' +
  '- Use only the current input and the current GUI state. Do not use memory or infer hidden context.\n' +
  '- Only choose select when the user clearly refers to exactly one currently visible enabled item.\n' +
  '- Only choose selectMultiple on seat stage when the user clearly refers to multiple currently visible enabled seats. selectMultiple replaces the full selected seat set.\n' +
  '- Never select a disabled item.\n' +
  '- Only choose next, prev, or startOver when the user clearly expresses that navigation intent.\n' +
  '- If multiple seats are requested but the exact seat ids cannot be mapped from visibleItems, choose none.\n' +
  '- If the input is ambiguous, unrelated, conversational, asks a question, or would require multiple GUI actions, choose none.\n' +
  '- If the user mentions something not visible in current visibleItems, choose none.\n' +
  '- Never invent item ids. Use an item id from visibleItems when selecting.\n' +
  '- Keep reason short and concrete.\n' +
  '- Return JSON only.';

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

export function getBaselineRouterSystemPrompt(): string {
  return BASELINE_ROUTER_SYSTEM_PROMPT;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

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

function normalizeToolName(raw: unknown): BaselineRouterAction['toolName'] | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim();
  if (!normalized) return null;

  switch (normalized.toLowerCase()) {
    case 'select':
      return 'select';
    case 'selectmultiple':
    case 'select_multiple':
    case 'select multiple':
      return 'selectMultiple';
    case 'next':
      return 'next';
    case 'prev':
    case 'previous':
      return 'prev';
    case 'startover':
    case 'start_over':
    case 'start over':
      return 'startOver';
    case 'none':
      return 'none';
    default:
      return null;
  }
}

function toBaselineRouterOutput(value: Record<string, unknown>): BaselineRouterOutput | null {
  const actionRecord = isRecord(value.action) ? value.action : null;
  if (!actionRecord) return null;

  const toolName = normalizeToolName(actionRecord.toolName);
  const reason = readTrimmedString(actionRecord.reason);
  const params = isRecord(actionRecord.params) ? actionRecord.params : {};

  if (!toolName || !reason) return null;
  return {
    action: {
      toolName,
      params,
      reason,
    },
  };
}

export async function routeBaselineActionWithOpenAI(
  input: BaselineRouterInput
): Promise<BaselineRouterOutput | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('BASELINE_OPENAI_API_KEY_MISSING');
  }

  const temperature = resolveOpenAITemperature();
  const schema = {
    type: 'object',
    properties: {
      action: {
        type: 'object',
        properties: {
          toolName: {
            type: 'string',
            enum: ['select', 'selectMultiple', 'next', 'prev', 'startOver', 'none'],
          },
          params: {
            type: 'object',
            properties: {
              itemId: { type: 'string' },
              itemIds: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            additionalProperties: false,
          },
          reason: { type: 'string' },
        },
        required: ['toolName', 'params', 'reason'],
        additionalProperties: false,
      },
    },
    required: ['action'],
    additionalProperties: false,
  };

  const baseBody = {
    model: OPENAI_MODEL,
    input: [
      {
        role: 'system',
        content: BASELINE_ROUTER_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: JSON.stringify(input),
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'baseline_router_action',
        strict: false,
        schema,
      },
    },
  };
  const body = typeof temperature === 'number' ? { ...baseBody, temperature } : baseBody;

  if (DEBUG_LLM) {
    console.log('[tuning-agent][baseline-router] request:', JSON.stringify(input));
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
        console.error('[tuning-agent][baseline-router] error:', errorText);
      }
      emitLlmTrace('error', { status: response.status, errorText });
      throw new Error(`BASELINE_OPENAI_FAILED (${response.status}): ${errorText}`);
    }
  }

  const payload = (await response.json()) as unknown;
  const outputText = parseOpenAIOutputText(payload);
  if (DEBUG_LLM) {
    console.log('[tuning-agent][baseline-router] raw output:', outputText);
  }
  emitLlmTrace('response.raw', { outputText });
  if (!outputText) return null;

  const parsed = parseJsonObject(outputText);
  if (DEBUG_LLM) {
    console.log('[tuning-agent][baseline-router] parsed output:', JSON.stringify(parsed));
  }
  emitLlmTrace('response.parsed', { parsed });
  if (!parsed) return null;

  return toBaselineRouterOutput(parsed);
}
