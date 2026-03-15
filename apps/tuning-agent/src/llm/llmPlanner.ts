import type {
  ActiveConflict,
  DeadEnd,
  Preference,
  ToolSchemaItem,
} from "../types";

export interface PlannerWorkflowMemory {
  preferences: Preference[];
  activeConflicts: ActiveConflict[];
  deadEnds: Array<Pick<DeadEnd, 'preferenceIds' | 'scope' | 'reason'>>;
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
  currentView?: Record<string, unknown>;
  turnContext?: Record<string, unknown>;
  priorStageSummaries?: Array<{ stage: string; alternatives: number }>;
  cpMemoryEnabled?: boolean;
}

interface PlannerInput {
  memory?: PlannerWorkflowMemory;
  history: unknown[];
  availableTools: ToolSchemaItem[];
  workflow: PlannerWorkflow;
}

interface PlannerAction {
  type: "tool.call" | "none";
  toolName: string;
  params: Record<string, unknown>;
  reason: string;
}

export interface PlannerOutput {
  action: PlannerAction;
  assistantMessage: string;
}

interface LlmTraceEvent {
  component: "planner";
  type: "request" | "response.raw" | "response.parsed" | "error";
  payload: unknown;
}

type LlmTraceListener = (event: LlmTraceEvent) => void;

const DEBUG_LLM = process.env.AGENT_LLM_DEBUG === "true";

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

const monitorEnabled =
  parseBooleanEnv(process.env.AGENT_MONITOR_ENABLED) ??
  process.env.NODE_ENV !== "production";
const monitorLlmTraceOverride = parseBooleanEnv(
  process.env.AGENT_MONITOR_LLM_TRACE,
);
const MONITOR_LLM_TRACE_ENABLED =
  monitorEnabled && (monitorLlmTraceOverride ?? true);
const llmTraceListeners = new Set<LlmTraceListener>();
let llmTraceRequestSequence = 0;

function emitLlmTrace(type: LlmTraceEvent["type"], payload: unknown): void {
  if (!MONITOR_LLM_TRACE_ENABLED) return;
  const event: LlmTraceEvent = { component: "planner", type, payload };
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
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function createLlmTraceRequestId(): string {
  llmTraceRequestSequence += 1;
  return `planner-${llmTraceRequestSequence}`;
}

function createPlannerOutput(
  action: PlannerAction,
  assistantMessage: string,
): PlannerOutput {
  return {
    action,
    assistantMessage,
  };
}

function toPlannerOutput(value: Record<string, unknown>): PlannerOutput | null {
  const actionRaw =
    value.action &&
    typeof value.action === "object" &&
    !Array.isArray(value.action)
      ? (value.action as Record<string, unknown>)
      : null;
  if (!actionRaw) return null;

  const type =
    actionRaw.type === "tool.call" || actionRaw.type === "none"
      ? actionRaw.type
      : null;
  if (!type) return null;

  const toolName =
    typeof actionRaw.toolName === "string" ? actionRaw.toolName.trim() : "";
  const reason =
    typeof actionRaw.reason === "string" ? actionRaw.reason.trim() : "";
  const params =
    actionRaw.params &&
    typeof actionRaw.params === "object" &&
    !Array.isArray(actionRaw.params)
      ? (actionRaw.params as Record<string, unknown>)
      : {};
  const assistantMessage =
    typeof value.assistantMessage === "string"
      ? value.assistantMessage.trim()
      : "";

  if (!reason) return null;

  return createPlannerOutput(
    {
      type,
      toolName,
      params,
      reason,
    },
    assistantMessage,
  );
}

const CORE_SYSTEM_PROMPT =
  "You are a movie-booking assistant helping a user complete their reservation.\n" +
  "\n" +
  "Decision framework — when to ACT vs ASK:\n" +
  '- ACT when the user\'s intent is clear: a direct instruction to select a specific item, or an explicit "choose for me" / confirmation of a highlighted suggestion.\n' +
  "- SUGGEST when a user preference points to a best match but the user has not explicitly chosen it. Choose the right tool by preference strength:\n" +
  "  • hard preference → filter or highlight to narrow to viable options only.\n" +
  "  • soft preference that implies ordering (e.g., closest, cheapest) → sort to reorder, then let the user pick. Do NOT highlight for soft preferences.\n" +
  "  After highlighting or sorting, WAIT for the user to respond — do not follow up with select on the next turn. Do not use select for preference-based recommendations — let the user confirm first.\n" +
  "- ASK only when multiple viable options genuinely remain and no recent user statement distinguishes them.\n" +
  '- When asking, elicit the user\'s preferences or criteria in natural language. The GUI already prompts the user to select an item, so never repeat that selection prompt.\n' +
  "- Use history to infer intent.\n" +
  "\n" +
  "Boundaries:\n" +
  "- Stay within workflow.currentStage, available tools, and proceedRule.\n" +
  "- Treat workflow.currentView as the authoritative current screen state. History may include earlier intermediate snapshots from the same stage.\n" +
  "- If workflow.currentView already reflects a recommendation or modification you would otherwise make, continue from that state instead of repeating the same tool call.\n" +
  "- Use workflow.turnContext to understand whether this turn is following up on an existing recommendation or UI change.\n" +
  "- Use workflow.state for earlier-stage context. Do not assume information only available in later stages or unvisited branches.\n" +
  "- Keep criteria stage-appropriate — earlier-stage rationale alone does not create new objectives for the current stage.\n" +
  "- Choose exactly one action per turn.";

const CP_MEMORY_PROMPT_RULES =
  "Memory (top-level 'memory' field):\n" +
  "The input contains a 'memory' object with preferences, deadEnds, and activeConflicts. Use history and memory together to infer intent.\n" +
  "\n" +
  "- preferences: active decision criteria. Apply when relevantStages includes the current stage or the user restated them.\n" +
  "- deadEnds: branches tried and failed. Treat dead-ended scopes as unavailable — they narrow viable options and may cause activeConflicts. When preferences + dead-ends leave exactly one viable option, select it immediately.\n" +
  "- activeConflicts: current blockers derived from preferences + available options + dead-ends. A severity:blocking conflict means NO option at that stage satisfies all hard preferences jointly.\n" +
  "- workflow.currentView.deadEndItemIds: list of item IDs in the current view that are dead-ended (failed downstream). NEVER select or recommend these items. Exclude them when evaluating viable options.\n" +
  "\n" +
  "Memory-aware decision rules:\n" +
  "- Multi-step backtracking: if recent history shows the user or agent expressed intent to navigate to a specific earlier stage (e.g. 'try a different date' means go to the date stage), and the current stage is NOT yet that target stage, call prev immediately to continue backtracking. Do not pause or re-explain at intermediate stages.\n" +
  "- ACT when backtracking from a dead-end: if you arrived at this stage after backtracking (history shows the user tried a path that failed downstream), do NOT re-ask the user to choose among the same options. Exclude all items listed in currentView.deadEndItemIds — they are NOT viable. Among the remaining items, apply active preferences to find the best alternative. If exactly one viable option remains, select it immediately without asking. If multiple viable options remain, highlight them and ask.\n" +
  "- BLOCKING CONFLICTS override all other actions: if memory.activeConflicts contains a severity:blocking conflict for the current stage, do NOT recommend, highlight, or select any option that violates a hard preference — even if it partially matches.\n" +
  "- Blocking conflict — check these rules IN ORDER, use the FIRST that matches:\n" +
  "  1. Active backtracking: if a recent user message or agent response in history indicates the user is heading to an earlier stage, call prev immediately. Do not re-explain.\n" +
  "  2. User agrees or requests backtracking at the current stage: call prev immediately. Do not repeat the explanation.\n" +
  "  3. First encounter (none of the above matched): inform the user briefly that no viable option exists and why, then suggest backtracking. Do NOT call prev yet — let the user decide.\n" +
  "- Resolution priority for blocking conflicts: (1) backtrack to an earlier stage to try a different branch, (2) only if the user declines, offer relaxing a preference.\n" +
  "- workflow.priorStageSummaries lists prior stages that have untried alternatives. When suggesting backtracking, name the specific stage from this list (the nearest one — last in the list). If no stage is listed, suggest relaxing a preference instead.";

const OPENAI_TOOL_CALLING_RULES =
  "Tool-calling format:\n" +
  '- Call exactly one function per turn. If no GUI tool is needed, call "respond".\n' +
  "- Decide the single best action first: choose the function/tool and its params before drafting any user-facing wording.\n" +
  '- After deciding the action, write a short "reason", then write "assistantMessage" that matches that action.\n' +
  '- "assistantMessage": brief user-facing explanation of the action.\n' +
  '- "reason": concise internal rationale for the chosen action.\n' +
  "- For GUI tool calls, describe the action briefly; do not ask permission.\n" +
  "- Base assistantMessage only on visible information and known context. Do not invent facts or claim later-stage knowledge.\n" +
  "- Never include internal item IDs in assistantMessage; use human-readable labels.\n" +
  "- Do not output plain text without a function call.";

const GUI_ADAPTATION_ENABLED_RULES =
  "GUI response rules:\n" +
  "- assistantMessage is a brief spoken cue. Let the GUI carry visible detail — do not restate what is already on screen.\n" +
  "- When narrowing options or highlighting a recommendation, include a brief reason in assistantMessage — especially facts the user cannot see on screen (e.g., computed end times). Do not over-explain.\n" +
  '- After a GUI tool call, keep assistantMessage short but informative.\n' +
  "- Tool selection:\n" +
  "  • augment — surface a hidden fact tied to the user's criterion or a stage-relevant preference (from memory.preferences, if present) while keeping the original visible label intact and recognizable.\n" +
  "  • filter — narrow by a field that exists in items data. Filter operates on raw item fields, NOT on augmented display text. If a criterion depends on a computed or derived value not present in items, use highlight instead.\n" +
  "  • sort — reorder items by a soft preference that implies a natural ordering (e.g., distance, price, rating). Do not highlight after sorting — the top position already signals the recommendation.\n" +
  "  • highlight — mark viable option(s) for a hard preference or explicit user request. Do not highlight based on soft preferences; use sort instead.\n" +
  "- IMPORTANT: If a criterion references a field not yet visible in visibleItems, you MUST augment first to surface that field before any sort, filter, highlight, or select. The user cannot understand the recommendation without seeing the data.\n" +
  "- Do not proactively filter, sort, or augment without a user criterion or stage-relevant preference.\n" +
  "- Repeated filter calls accumulate; sort does not imply a default selection.";

const GUI_ADAPTATION_DISABLED_RULES =
  "Response rules:\n" +
  "- assistantMessage is a brief spoken cue. Assume the user can see the current GUI.\n" +
  "- Do not enumerate the full screen or narrate dense layouts unless asked.\n" +
  "- Mention only the minimum labels needed for the answer. Ground replies in current UI state.\n" +
  "- Without a user criterion for the current stage, name options plainly or ask what matters — do not introduce unsolicited comparison dimensions.";

export function getPlannerSystemPrompt(): string {
  return [CORE_SYSTEM_PROMPT, OPENAI_TOOL_CALLING_RULES].join("\n");
}

function hasCpMemoryContext(workflow: PlannerWorkflow): boolean {
  return workflow.cpMemoryEnabled === true;
}

function buildSystemPrompt(workflow: PlannerWorkflow): string {
  const sections = [CORE_SYSTEM_PROMPT];
  if (hasCpMemoryContext(workflow)) {
    sections.push(CP_MEMORY_PROMPT_RULES);
  }
  if (workflow.guiAdaptationEnabled !== false) {
    sections.push(GUI_ADAPTATION_ENABLED_RULES);
  } else {
    sections.push(GUI_ADAPTATION_DISABLED_RULES);
  }
  return sections.join("\n");
}

type OpenAiJsonSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array";

interface OpenAiFunctionTool {
  type: "function";
  name: string;
  description?: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: boolean;
  };
}

interface NativeToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
}

const TOOL_META_ASSISTANT_MESSAGE_KEY = "assistantMessage";
const TOOL_META_REASON_KEY = "reason";
const NATIVE_NONE_TOOL_NAME = "respond";

function normalizeJsonSchemaType(
  raw: string | null,
): OpenAiJsonSchemaType | null {
  if (!raw) return null;
  switch (raw.toLowerCase()) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "integer":
      return "integer";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    case "array":
      return "array";
    default:
      return null;
  }
}

function toOpenAiParamSchema(paramValue: unknown): Record<string, unknown> {
  const paramRecord = isRecord(paramValue) ? paramValue : {};
  const schema: Record<string, unknown> = {};

  const description = readTrimmedString(paramRecord.description);
  if (description) schema.description = description;

  const normalizedType = normalizeJsonSchemaType(
    readTrimmedString(paramRecord.type),
  );
  if (normalizedType) {
    schema.type = normalizedType;
    if (normalizedType === "array") {
      schema.items = {};
    }
    if (normalizedType === "object") {
      schema.additionalProperties = true;
    }
  }

  if (Array.isArray(paramRecord.enum)) {
    const enumValues = paramRecord.enum.filter(
      (item): item is string =>
        typeof item === "string" && Boolean(item.trim()),
    );
    if (enumValues.length > 0) {
      schema.enum = enumValues;
      if (!normalizedType) {
        schema.type = "string";
      }
    }
  }

  return schema;
}

function getToolParametersRecord(
  tool: ToolSchemaItem,
): Record<string, unknown> {
  if (isRecord(tool.parameters)) return tool.parameters;
  if (isRecord(tool.params)) return tool.params;
  return {};
}

function getToolAssistantMessageDescription(
  guiAdaptationEnabled: boolean,
): string {
  if (guiAdaptationEnabled) {
    return "Brief user-facing message written after the action is decided. Do not restate what the GUI already shows.";
  }
  return "Brief user-facing message written after the action is decided. Assume the user can see the current GUI.";
}

function getRespondToolDescription(guiAdaptationEnabled: boolean): string {
  if (guiAdaptationEnabled) {
    return "Respond without a GUI action. Use for clarifications, confirmations, or direct answers based on visible information.";
  }
  return "Respond without a GUI action. Use for clarifications, confirmations, or direct answers. Assume the user can see the current GUI.";
}

function getRespondAssistantMessageDescription(
  guiAdaptationEnabled: boolean,
): string {
  if (guiAdaptationEnabled) {
    return "Concise user-facing response written after deciding that no GUI action should be taken.";
  }
  return "Concise user-facing response written after deciding that no GUI action should be taken. Assume the user can see the current GUI.";
}

function toOpenAiTools(
  availableTools: ToolSchemaItem[],
  guiAdaptationEnabled: boolean,
): OpenAiFunctionTool[] {
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

    properties[TOOL_META_REASON_KEY] = {
      type: "string",
      description:
        "Brief internal reason for why this tool is the best next action now. Decide this before writing assistantMessage.",
    };
    properties[TOOL_META_ASSISTANT_MESSAGE_KEY] = {
      type: "string",
      description: getToolAssistantMessageDescription(guiAdaptationEnabled),
    };
    required.push(TOOL_META_REASON_KEY, TOOL_META_ASSISTANT_MESSAGE_KEY);

    tools.push({
      type: "function",
      name,
      ...(description ? { description } : {}),
      parameters: {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
      },
    });
  }

  tools.push({
    type: "function",
    name: NATIVE_NONE_TOOL_NAME,
    description: getRespondToolDescription(guiAdaptationEnabled),
    parameters: {
      type: "object",
      properties: {
        [TOOL_META_REASON_KEY]: {
          type: "string",
          description:
            "Brief reason for not taking a tool action now. Decide this before writing assistantMessage.",
        },
        [TOOL_META_ASSISTANT_MESSAGE_KEY]: {
          type: "string",
          description:
            getRespondAssistantMessageDescription(guiAdaptationEnabled),
        },
      },
      required: [TOOL_META_REASON_KEY, TOOL_META_ASSISTANT_MESSAGE_KEY],
      additionalProperties: false,
    },
  });

  return tools;
}

function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) return raw;
  if (typeof raw === "string") {
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
    if (item.type !== "function_call") continue;
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
  outputText: string | null,
): PlannerOutput {
  const params = { ...toolCall.arguments };
  const assistantMessageFromToolArg = readTrimmedString(
    params[TOOL_META_ASSISTANT_MESSAGE_KEY],
  );
  const reasonFromToolArg = readTrimmedString(params[TOOL_META_REASON_KEY]);
  delete params[TOOL_META_ASSISTANT_MESSAGE_KEY];
  delete params[TOOL_META_REASON_KEY];

  const assistantMessage =
    assistantMessageFromToolArg ?? readTrimmedString(outputText) ?? "";
  const reason =
    reasonFromToolArg ??
    assistantMessageFromToolArg ??
    readTrimmedString(outputText) ??
    `Use ${toolCall.toolName} as the best next action based on user intent and current workflow state.`;

  if (toolCall.toolName === NATIVE_NONE_TOOL_NAME) {
    return createPlannerOutput(
      {
        type: "none",
        toolName: "",
        params: {},
        reason,
      },
      assistantMessage,
    );
  }

  return createPlannerOutput(
    {
      type: "tool.call",
      toolName: toolCall.toolName,
      params,
      reason,
    },
    assistantMessage,
  );
}

function plannerOutputFromNoToolCall(
  outputText: string | null,
): PlannerOutput | null {
  const assistantMessage = readTrimmedString(outputText) ?? "";
  if (!assistantMessage) return null;
  return createPlannerOutput(
    {
      type: "none",
      toolName: "",
      params: {},
      reason: assistantMessage,
    },
    assistantMessage,
  );
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = process.env.AGENT_OPENAI_MODEL || "gpt-5.2";
const DEFAULT_OPENAI_TEMPERATURE = 0;

function resolveOpenAITemperature(): number | undefined {
  return DEFAULT_OPENAI_TEMPERATURE;
}

function isUnsupportedTemperatureError(
  status: number,
  errorText: string,
): boolean {
  if (status !== 400) return false;
  const lowered = errorText.toLowerCase();
  return (
    lowered.includes("temperature") &&
    (lowered.includes("not supported") ||
      lowered.includes("unsupported") ||
      lowered.includes("only support") ||
      lowered.includes("invalid"))
  );
}

function parseOpenAIOutputText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;

  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text.trim();
  }

  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const itemRecord = item as Record<string, unknown>;
    const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const partRecord = part as Record<string, unknown>;
      if (typeof partRecord.text === "string" && partRecord.text.trim()) {
        return partRecord.text.trim();
      }
    }
  }
  return null;
}

export async function planActionWithOpenAI(
  input: PlannerInput,
): Promise<PlannerOutput | null> {
  if (process.env.AGENT_ENABLE_OPENAI === "false") return null;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const temperature = resolveOpenAITemperature();
  const guiAdaptationEnabled = input.workflow.guiAdaptationEnabled !== false;
  const openAiTools = toOpenAiTools(input.availableTools, guiAdaptationEnabled);
  const nativePlannerInput = {
    ...(input.memory ? { memory: input.memory } : {}),
    history: input.history,
    workflow: input.workflow,
  };
  const openAiSystemPrompt =
    buildSystemPrompt(input.workflow) + "\n" + OPENAI_TOOL_CALLING_RULES;
  const traceRequestId = createLlmTraceRequestId();

  const baseBody = {
    model: OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: openAiSystemPrompt,
      },
      {
        role: "user",
        content: JSON.stringify(nativePlannerInput),
      },
    ],
    ...(openAiTools.length > 0
      ? { tools: openAiTools, parallel_tool_calls: false }
      : {}),
  };
  const body =
    typeof temperature === "number" ? { ...baseBody, temperature } : baseBody;

  if (DEBUG_LLM) {
    console.log(
      "[tuning-agent][llm] planner request input:",
      JSON.stringify(input),
    );
  }
  emitLlmTrace("request", {
    requestId: traceRequestId,
    method: "POST",
    url: OPENAI_API_URL,
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });

  let response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const firstErrorText = await response.text();
    const shouldRetryWithoutTemperature =
      typeof temperature === "number" &&
      isUnsupportedTemperatureError(response.status, firstErrorText);

    if (shouldRetryWithoutTemperature) {
      if (DEBUG_LLM) {
        console.warn(
          "[tuning-agent][llm] planner temperature rejected; retrying without temperature",
        );
      }
      emitLlmTrace("request", {
        requestId: traceRequestId,
        method: "POST",
        url: OPENAI_API_URL,
        headers: {
          "Content-Type": "application/json",
        },
        body: baseBody,
      });
      response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(baseBody),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      if (DEBUG_LLM) {
        console.error("[tuning-agent][llm] planner error response:", errorText);
      }
      emitLlmTrace("error", {
        requestId: traceRequestId,
        status: response.status,
        errorText,
      });
      throw new Error(
        `OpenAI planner failed (${response.status}): ${errorText}`,
      );
    }
  }

  const payload = (await response.json()) as unknown;
  const outputText = parseOpenAIOutputText(payload);
  const nativeToolCall = extractNativeToolCall(payload);
  if (DEBUG_LLM) {
    console.log("[tuning-agent][llm] planner raw output_text:", outputText);
    console.log(
      "[tuning-agent][llm] planner native tool call:",
      JSON.stringify(nativeToolCall),
    );
  }
  emitLlmTrace("response.raw", {
    requestId: traceRequestId,
    outputText,
    nativeToolCall,
  });

  if (nativeToolCall) {
    const parsedNative = plannerOutputFromNativeToolCall(
      nativeToolCall,
      outputText,
    );
    emitLlmTrace("response.parsed", {
      requestId: traceRequestId,
      parsed: parsedNative,
    });
    return parsedNative;
  }

  if (!outputText) return null;
  const parsed = parseJsonObject(outputText);
  if (DEBUG_LLM) {
    console.log(
      "[tuning-agent][llm] planner parsed output:",
      JSON.stringify(parsed),
    );
  }
  if (parsed) {
    const structured = toPlannerOutput(parsed);
    emitLlmTrace("response.parsed", {
      requestId: traceRequestId,
      parsed: structured ?? parsed,
      parser: "json-schema-fallback",
    });
    if (structured) {
      return structured;
    }
  }

  const noToolOutput = plannerOutputFromNoToolCall(outputText);
  emitLlmTrace("response.parsed", {
    requestId: traceRequestId,
    parsed: noToolOutput,
    parser: "text-no-tool",
  });
  return noToolOutput;
}
