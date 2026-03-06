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
  guardrails: string[];
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

const BASE_SYSTEM_PROMPT =
  'You are a UI agent. Pick exactly one next step that best reflects user intent and current GUI state.\n' +
  'Constraints:\n' +
  '- Use history and workflow together to infer intent, prioritizing unresolved recent user preferences.\n' +
  '- Use workflow.state to understand the raw selections already made across earlier stages.\n' +
  '- Treat workflow.currentStage and available tools as hard operational boundaries.\n' +
  '- Primary goal: help the user complete booking efficiently and safely.\n' +
  '- If intent is reasonably clear, prefer one concrete action over repetitive clarifications.\n' +
  '- If user intent or preference is uncertain, use a concise conversational clarification (respond/action.type="none") before applying potentially assumption-heavy GUI changes.\n' +
  '- Use non-committal GUI modification tools when they clearly narrow options without assuming unstated preferences.\n' +
  '- Highlight is non-committal and may be used for one or multiple candidate options only when it adds meaningful distinction among still-visible choices.\n' +
  '- Do not use highlight when the current UI already communicates the narrowed set clearly enough, or when highlight would simply restate the effect of an existing filter/sort.\n' +
  '- Do not chain highlight immediately after filter/sort by default. Use highlight after narrowing only when a smaller subset among the remaining visible items deserves extra emphasis.\n' +
  '- Do not use highlight when it would simply mark every currently visible item or repeat an already-applied highlight without adding new distinction.\n' +
  '- Use navigation/commitment actions (select/selectMultiple/next/prev/startOver) only when user intent is clear and sufficiently confirmed.\n' +
  '- Do not treat assistant-generated recommendations, options, or questions as user confirmation.\n' +
  '- Require user-originated explicit or unambiguous confirmation before commitment actions.\n' +
  '- Do not infer unstated optimization objectives (for example highest-rated, lowest price, earliest time, shortest duration, nearest location).\n' +
  '- Apply optimization-oriented actions only when the objective is explicit in the latest user request or current workflow guidance.\n' +
  '- If optimization objective is unspecified, prefer neutral narrowing or concise clarification instead of arbitrary ranking.\n' +
  '- If multiple viable options remain without explicit user commitment to one item, ask concise confirmation by default. Use highlight instead only when it materially helps distinguish a subset of the remaining options.\n' +
  '- Repeated filter tool calls accumulate additional conditions instead of replacing earlier filters.\n' +
  '- On seat stage, use select for a single-seat toggle and selectMultiple only when the user clearly specifies multiple seats to select as the full seat set.\n' +
  '- Choose exactly one action for this turn.';

const CP_MEMORY_PROMPT_RULES =
  '- Use workflow.memory.preferences as structured user intent.\n' +
  '- Use workflow.memory.activeConflicts as the current blockers for the active branch.\n' +
  '- Use workflow.memory.deadEnds as advisory history about branches that previously failed after backtracking.\n' +
  '- Prefer workflow.memory.activeConflicts over workflow.memory.deadEnds when they disagree.\n' +
  '- workflow.memory.summaries contains concise natural-language projections of the structured memory for quick scanning.';

const JSON_ACTION_FORMAT_RULES =
  'JSON action format rules:\n' +
  '- assistantMessage is the user-facing conversational response.\n' +
  '- assistantMessage must be plain text only (no Markdown, no code fences, no bullet lists, no links).\n' +
  '- Keep assistantMessage short and natural.\n' +
  '- Choose action.type="none" when clarification/confirmation is needed, or when the next step would commit to a choice without clear user confirmation.\n' +
  '- If action.type="tool.call", toolName must be one of available tools.\n' +
  '- Keep assistantMessage consistent with action: if action.type="tool.call", describe the action being taken and do not ask for permission.\n' +
  '- If assistantMessage asks for confirmation or permission, action.type must be "none".\n' +
  '- select requires params.itemId from visible item ids.\n' +
  '- selectMultiple requires params.itemIds as a non-empty array of visible enabled seat ids and is valid only on seat stage. It replaces the full selected seat set.';

const NATIVE_TOOL_CALLING_RULES =
  'Native tool-calling rules:\n' +
  '- Call exactly one available function every turn.\n' +
  '- If no GUI action should be taken now, call "respond".\n' +
  '- Put a concise user-facing message in "assistantMessage" argument.\n' +
  '- Put a concise rationale in "reason" argument.\n' +
  '- For tool calls, assistantMessage must describe the action and must not ask for permission.\n' +
  '- On seat stage, prefer selectMultiple over repeated select calls when the user clearly specifies multiple seats.\n' +
  '- Do not output plain text without a function call.\n' +
  '- Never include internal item ids (for example m1, t2) in assistantMessage; refer to human-readable item values only.';

export function getPlannerSystemPrompt(): string {
  return BASE_SYSTEM_PROMPT;
}

function hasCpMemoryContext(workflow: PlannerWorkflow): boolean {
  if (workflow.cpMemoryEnabled === true) return true;
  if (workflow.cpMemoryEnabled === false) return false;
  return Boolean(workflow.memory);
}

function buildSystemPrompt(workflow: PlannerWorkflow): string {
  if (!hasCpMemoryContext(workflow)) {
    return BASE_SYSTEM_PROMPT;
  }
  return `${BASE_SYSTEM_PROMPT}\n${CP_MEMORY_PROMPT_RULES}`;
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
      'Respond to the user without executing any GUI tool. Use this for clarification, confirmation, or when waiting for user input.',
    parameters: {
      type: 'object',
      properties: {
        [TOOL_META_ASSISTANT_MESSAGE_KEY]: {
          type: 'string',
          description: 'A concise user-facing response.',
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
    NATIVE_TOOL_CALLING_RULES;

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
    model: OPENAI_MODEL,
    input: nativePlannerInput,
    tools: openAiTools.map((tool) => tool.name),
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
          '[tuning-agent][llm] planner temperature rejected; retrying without temperature'
        );
      }
      emitLlmTrace('request', {
        model: OPENAI_MODEL,
        input: nativePlannerInput,
        tools: openAiTools.map((tool) => tool.name),
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
    buildSystemPrompt(input.workflow) +
    '\n' +
    JSON_ACTION_FORMAT_RULES +
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
    console.log('[tuning-agent][llm:gemini] planner request input:', JSON.stringify(input));
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
      console.error('[tuning-agent][llm:gemini] planner error response:', errorText);
    }
    emitLlmTrace('error', { status: response.status, errorText });
    throw new Error(`Gemini planner failed (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as unknown;
  const outputText = extractGeminiText(payload);
  if (DEBUG_LLM) {
    console.log('[tuning-agent][llm:gemini] planner raw output:', outputText);
  }
  emitLlmTrace('response.raw', { outputText });
  if (!outputText) return null;

  const parsed = parseJsonObject(outputText);
  if (DEBUG_LLM) {
    console.log('[tuning-agent][llm:gemini] planner parsed output:', JSON.stringify(parsed));
  }
  emitLlmTrace('response.parsed', { parsed });
  if (!parsed) return null;

  return toPlannerOutput(parsed);
}
