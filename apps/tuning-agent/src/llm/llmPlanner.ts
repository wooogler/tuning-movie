import type { ActiveConflict, DeadEnd, Preference, ToolSchemaItem } from '../types';

export interface PlannerWorkflowMemory {
  preferences: Preference[];
  activeConflicts: ActiveConflict[];
  deadEnds: DeadEnd[];
  summaries: {
    preferences: string[];
    activeConflicts: string[];
    deadEnds: string[];
  };
}

export interface PlannerWorkflow {
  stageOrder: string[];
  currentStage: string;
  previousStage: string | null;
  nextStage: string | null;
  stageGoal: string;
  proceedRule: string;
  availableToolNames: string[];
  guiAdaptationEnabled?: boolean;
  state?: Record<string, unknown>;
  memory?: PlannerWorkflowMemory;
  cpMemoryEnabled?: boolean;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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

const CORE_SYSTEM_PROMPT =
  'You are a movie-booking decision-support assistant. Read the frontend state from the user\'s point of view and help the user make their own choice.\n' +
  'Core rules:\n' +
  '- Use history and workflow together to infer intent, prioritizing unresolved recent user preferences.\n' +
  '- Treat workflow.currentStage, available tools, proceed rules, and the built-in respond function as hard boundaries.\n' +
  '- Use workflow.state to understand selections already made across earlier stages.\n' +
  '- Primary goal: help the user complete booking safely while preserving the user\'s agency over the choice.\n' +
  '- Prefer concrete progress when intent is clear, but do not turn an unresolved comparison into an autonomous choice.\n' +
  '- An explicit comparison preference may justify sorting or surfacing information, but it does not by itself authorize selecting the current top-ranked option while multiple visible options remain.\n' +
  '- When multiple options remain or the next step would be assumption-heavy, prefer one non-committal GUI modification if it can make the user\'s stated criterion easier to see or apply without assuming a choice; otherwise use respond for a concise clarification.\n' +
  '- Use navigation or commitment actions only after clear user-originated confirmation, or when exactly one visible enabled option remains under the user\'s explicit criteria.\n' +
  '- Do not infer unstated optimization goals or tie-breakers such as highest-rated, cheapest, nearest, earliest, latest, shortest, or best default.\n' +
  '- Choose exactly one next step for this turn.';

const CP_MEMORY_PROMPT_RULES =
  '- Use workflow.memory.preferences as structured user intent, and treat preferences as active guidance only when their relevantStages include workflow.currentStage unless the user explicitly restated them for the current step.\n' +
  '- Use workflow.memory.activeConflicts as the current blockers for the active branch.\n' +
  '- Use workflow.memory.deadEnds as advisory history about branches that previously failed after backtracking.\n' +
  '- Prefer workflow.memory.activeConflicts over workflow.memory.deadEnds when they disagree.\n' +
  '- workflow.memory.summaries contains concise natural-language projections of the structured memory for quick scanning.';

const OPENAI_TOOL_CALLING_RULES =
  'Tool-calling rules:\n' +
  '- Use exactly one provided function on every turn.\n' +
  '- If no GUI tool should be used now, call "respond".\n' +
  '- Put a short user-facing explanation in "assistantMessage".\n' +
  '- Put a concise rationale in "reason".\n' +
  '- For GUI tool calls, assistantMessage should describe the action and should not ask for permission.\n' +
  '- For respond, keep assistantMessage to the smallest helpful clarification or direct answer. Unless the user explicitly asked for more detail, rely only on currently visible options and do not introduce hidden metadata or a new comparison dimension.\n' +
  '- Do not use select, selectMultiple, or next to resolve a tie among multiple viable options unless the user has clearly committed to one specific choice.\n' +
  '- Do not justify a commitment action with an inferred ranking or default ordering.\n' +
  '- Do not output plain text without a function call.\n' +
  '- Never include internal item ids in assistantMessage; use human-readable labels only.';

const GUI_ADAPTATION_ENABLED_RULES =
  'GUI adaptation rules when modification tools are enabled:\n' +
  '- Match the tool to the need: use augment to surface a short fact tied to the user\'s stated criterion, filter to narrow by an explicit criterion, sort to order by an explicit comparison goal, and highlight to mark a small relevant subset.\n' +
  '- For filter or sort, prefer the structured item field that directly represents the user\'s criterion or comparison goal. Use "value" only when operating on the visible label text itself.\n' +
  '- If the user has not stated a criterion or comparison goal for the current stage, do not proactively sort, filter, or augment just because a field seems helpful or available.\n' +
  '- If the user\'s stated criterion is not yet visible in the UI, prefer surfacing or applying that criterion through one non-committal GUI modification before asking for a tie-break.\n' +
  '- Use only criteria grounded in what the user asked for. Do not introduce a new comparison dimension or hidden optimization goal.\n' +
  '- Do not mention hidden item metadata directly in assistantMessage; if a criterion-specific fact is not already visible, surface it through the UI first.\n' +
  '- Do not use sort to create a best default, do not use highlight when it adds no distinction, and let repeated filter calls accumulate additional conditions instead of replacing earlier filters.';

export function getPlannerSystemPrompt(): string {
  return [CORE_SYSTEM_PROMPT, OPENAI_TOOL_CALLING_RULES].join('\n');
}

function hasCpMemoryContext(workflow: PlannerWorkflow): boolean {
  if (workflow.cpMemoryEnabled === true) return true;
  if (workflow.cpMemoryEnabled === false) return false;
  return Boolean(workflow.memory);
}

function buildSystemPrompt(workflow: PlannerWorkflow): string {
  const sections = [CORE_SYSTEM_PROMPT];
  if (hasCpMemoryContext(workflow)) {
    sections.push(CP_MEMORY_PROMPT_RULES);
  }
  if (workflow.guiAdaptationEnabled !== false) {
    sections.push(GUI_ADAPTATION_ENABLED_RULES);
  }
  return sections.join('\n');
}

type OpenAiJsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';

interface OpenAiFunctionTool {
  type: 'function';
  name: string;
  description?: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: boolean;
  };
}

interface NativeToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
}

const TOOL_META_ASSISTANT_MESSAGE_KEY = 'assistantMessage';
const TOOL_META_REASON_KEY = 'reason';
const NATIVE_NONE_TOOL_NAME = 'respond';

function normalizeJsonSchemaType(raw: string | null): OpenAiJsonSchemaType | null {
  if (!raw) return null;
  switch (raw.toLowerCase()) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'integer':
      return 'integer';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    case 'array':
      return 'array';
    default:
      return null;
  }
}

function toOpenAiParamSchema(paramValue: unknown): Record<string, unknown> {
  const paramRecord = isRecord(paramValue) ? paramValue : {};
  const schema: Record<string, unknown> = {};

  const description = readTrimmedString(paramRecord.description);
  if (description) schema.description = description;

  const normalizedType = normalizeJsonSchemaType(readTrimmedString(paramRecord.type));
  if (normalizedType) {
    schema.type = normalizedType;
    if (normalizedType === 'array') {
      schema.items = {};
    }
    if (normalizedType === 'object') {
      schema.additionalProperties = true;
    }
  }

  if (Array.isArray(paramRecord.enum)) {
    const enumValues = paramRecord.enum.filter(
      (item): item is string => typeof item === 'string' && Boolean(item.trim())
    );
    if (enumValues.length > 0) {
      schema.enum = enumValues;
      if (!normalizedType) {
        schema.type = 'string';
      }
    }
  }

  return schema;
}

function getToolParametersRecord(tool: ToolSchemaItem): Record<string, unknown> {
  if (isRecord(tool.parameters)) return tool.parameters;
  if (isRecord(tool.params)) return tool.params;
  return {};
}

function toOpenAiTools(availableTools: ToolSchemaItem[]): OpenAiFunctionTool[] {
  const tools: OpenAiFunctionTool[] = [];

  for (const tool of availableTools) {
    const name = readTrimmedString(tool.name);
    if (!name) continue;
    const description = readTrimmedString(tool.description);
    const parameterDefs = getToolParametersRecord(tool);
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [paramName, paramValue] of Object.entries(parameterDefs)) {
      properties[paramName] = toOpenAiParamSchema(paramValue);
      const optional = isRecord(paramValue) && paramValue.optional === true;
      if (!optional) {
        required.push(paramName);
      }
    }

    properties[TOOL_META_ASSISTANT_MESSAGE_KEY] = {
      type: 'string',
      description: 'One short user-facing message describing the step.',
    };
    properties[TOOL_META_REASON_KEY] = {
      type: 'string',
      description: 'Brief internal reason for why this tool is the best next action now.',
    };

    tools.push({
      type: 'function',
      name,
      ...(description ? { description } : {}),
      parameters: {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
      },
    });
  }

  tools.push({
    type: 'function',
    name: NATIVE_NONE_TOOL_NAME,
    description:
      'Respond to the user without executing any GUI tool. Use this for the smallest helpful clarification, confirmation, or when waiting for user input. If the user explicitly asks for information, answer directly and concisely.',
    parameters: {
      type: 'object',
      properties: {
        [TOOL_META_ASSISTANT_MESSAGE_KEY]: {
          type: 'string',
          description:
            'A concise user-facing response. Keep it to the smallest helpful clarification or direct answer. Unless the user explicitly asked for more detail, rely only on currently visible options and do not introduce hidden metadata or a new comparison dimension.',
        },
        [TOOL_META_REASON_KEY]: {
          type: 'string',
          description: 'Brief reason for not taking a tool action now.',
        },
      },
      required: [TOOL_META_ASSISTANT_MESSAGE_KEY],
      additionalProperties: false,
    },
  });

  return tools;
}

function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = parseJsonObject(raw);
    return parsed ?? {};
  }
  return {};
}

function extractNativeToolCall(body: unknown): NativeToolCall | null {
  if (!isRecord(body)) return null;
  const output = Array.isArray(body.output) ? body.output : [];

  for (const item of output) {
    if (!isRecord(item)) continue;
    if (item.type !== 'function_call') continue;
    const toolName = readTrimmedString(item.name);
    if (!toolName) continue;
    return {
      toolName,
      arguments: parseToolArguments(item.arguments),
    };
  }

  return null;
}

function plannerOutputFromNativeToolCall(
  toolCall: NativeToolCall,
  outputText: string | null
): PlannerOutput {
  const params = { ...toolCall.arguments };
  const assistantMessageFromToolArg = readTrimmedString(params[TOOL_META_ASSISTANT_MESSAGE_KEY]);
  const reasonFromToolArg = readTrimmedString(params[TOOL_META_REASON_KEY]);
  delete params[TOOL_META_ASSISTANT_MESSAGE_KEY];
  delete params[TOOL_META_REASON_KEY];

  const assistantMessage = assistantMessageFromToolArg ?? readTrimmedString(outputText) ?? '';
  const reason =
    reasonFromToolArg ??
    assistantMessageFromToolArg ??
    readTrimmedString(outputText) ??
    `Use ${toolCall.toolName} as the best next action based on user intent and current workflow state.`;

  if (toolCall.toolName === NATIVE_NONE_TOOL_NAME) {
    return {
      assistantMessage,
      action: {
        type: 'none',
        toolName: '',
        params: {},
        reason,
      },
    };
  }

  return {
    assistantMessage,
    action: {
      type: 'tool.call',
      toolName: toolCall.toolName,
      params,
      reason,
    },
  };
}

function plannerOutputFromNoToolCall(outputText: string | null): PlannerOutput | null {
  const assistantMessage = readTrimmedString(outputText) ?? '';
  if (!assistantMessage) return null;
  return {
    assistantMessage,
    action: {
      type: 'none',
      toolName: '',
      params: {},
      reason: assistantMessage,
    },
  };
}

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
  const openAiTools = toOpenAiTools(input.availableTools);
  const nativePlannerInput = {
    history: input.history,
    workflow: input.workflow,
  };
  const openAiSystemPrompt =
    buildSystemPrompt(input.workflow) +
    '\n' +
    OPENAI_TOOL_CALLING_RULES;

  const baseBody = {
    model: OPENAI_MODEL,
    input: [
      {
        role: 'system',
        content: openAiSystemPrompt,
      },
      {
        role: 'user',
        content: JSON.stringify(nativePlannerInput),
      },
    ],
    ...(openAiTools.length > 0 ? { tools: openAiTools, parallel_tool_calls: false } : {}),
  };
  const body =
    typeof temperature === 'number'
      ? { ...baseBody, temperature }
      : baseBody;

  if (DEBUG_LLM) {
    console.log('[tuning-agent][llm] planner request input:', JSON.stringify(input));
  }
  emitLlmTrace('request', {
    method: 'POST',
    url: OPENAI_API_URL,
    headers: {
      'Content-Type': 'application/json',
    },
    body,
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
          '[tuning-agent][llm] planner temperature rejected; retrying without temperature'
        );
      }
      emitLlmTrace('request', {
        method: 'POST',
        url: OPENAI_API_URL,
        headers: {
          'Content-Type': 'application/json',
        },
        body: baseBody,
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
        console.error('[tuning-agent][llm] planner error response:', errorText);
      }
      emitLlmTrace('error', { status: response.status, errorText });
      throw new Error(`OpenAI planner failed (${response.status}): ${errorText}`);
    }
  }

  const payload = (await response.json()) as unknown;
  const outputText = parseOpenAIOutputText(payload);
  const nativeToolCall = extractNativeToolCall(payload);
  if (DEBUG_LLM) {
    console.log('[tuning-agent][llm] planner raw output_text:', outputText);
    console.log('[tuning-agent][llm] planner native tool call:', JSON.stringify(nativeToolCall));
  }
  emitLlmTrace('response.raw', { outputText, nativeToolCall });

  if (nativeToolCall) {
    const parsedNative = plannerOutputFromNativeToolCall(nativeToolCall, outputText);
    emitLlmTrace('response.parsed', { parsed: parsedNative });
    return parsedNative;
  }

  if (!outputText) return null;
  const parsed = parseJsonObject(outputText);
  if (DEBUG_LLM) {
    console.log('[tuning-agent][llm] planner parsed output:', JSON.stringify(parsed));
  }
  if (parsed) {
    const structured = toPlannerOutput(parsed);
    emitLlmTrace('response.parsed', { parsed: structured ?? parsed, parser: 'json-schema-fallback' });
    if (structured) {
      return structured;
    }
  }

  const noToolOutput = plannerOutputFromNoToolCall(outputText);
  emitLlmTrace('response.parsed', { parsed: noToolOutput, parser: 'text-no-tool' });
  return noToolOutput;
}
