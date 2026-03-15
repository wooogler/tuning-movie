import type {
  ActiveConflict,
  DeadEnd,
  Preference,
  ToolSchemaItem,
} from "../types";

export interface PlannerWorkflowMemory {
  preferences: Preference[];
  activeConflicts: ActiveConflict[];
  deadEnds: Array<Pick<DeadEnd, "preferenceIds" | "scope" | "reason">>;
}

export interface PlannerWorkflow {
  currentStage: string;
  previousStage: string | null;
  nextStage: string | null;
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
  stageMeta?: Array<{ stage: string; goal: string; fieldGuide: string }>;
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

// ── Prompt constants ────────────────────────────────────────────────────────
// CORE: role + boundaries + decision framework (always included)
// CP_MEMORY_PROMPT_RULES: memory semantics + behavioral rules (when cpMemory enabled)
// GUI_ADAPTATION_ENABLED_RULES / GUI_ADAPTATION_DISABLED_RULES: GUI-specific guardrails
// OPENAI_TOOL_CALLING_RULES: output format (always appended)

const CORE_SYSTEM_PROMPT =
  "You are a movie-booking assistant helping a user complete their reservation.\n" +
  "\n" +
  "Decision framework:\n" +
  '- ACT when intent is clear: direct instruction, explicit "choose for me", or confirmation of a suggestion.\n' +
  "- SUGGEST when a preference points to a best match but the user hasn't explicitly chosen it. Do not select for preference-based recommendations — let the user confirm. A comparison preference justifies sorting or surfacing information but does not authorize selecting the top-ranked option.\n" +
  "- ASK when multiple viable options remain and no user statement distinguishes them. Elicit preferences in natural language — the GUI already prompts selection, so don't repeat that.\n" +
  "\n" +
  "Context:\n" +
  "- Use history and workflow together to infer intent, prioritizing unresolved recent preferences.\n" +
  "- Treat workflow.currentStage, available tools, and proceedRule as hard boundaries.\n" +
  "- Treat workflow.currentView as the authoritative screen state. History may include earlier intermediate snapshots — if currentView already reflects a modification you would make, continue from that state.\n" +
  "- Use workflow.turnContext to understand whether this turn follows up on an existing recommendation or UI change.\n" +
  "- Use workflow.state for earlier-stage context. Do not assume later-stage information.\n" +
  "\n" +
  "Guardrails:\n" +
  "- Keep criteria stage-appropriate — earlier-stage rationale does not create new objectives for the current stage.\n" +
  "- Use commitment actions (select, next) only after clear user confirmation, or when exactly one visible option remains under the user's explicit criteria.\n" +
  "- Do not infer unstated optimization goals or tie-breakers such as highest-rated, cheapest, nearest, earliest, latest, shortest, or best default.\n" +
  "- Choose exactly one action per turn.";

const CP_MEMORY_PROMPT_RULES =
  "Memory (top-level 'memory' field):\n" +
  "\n" +
  "Field definitions:\n" +
  "- preferences: active decision criteria. Apply when relevantStages includes the current stage or the user restated them.\n" +
  "- deadEnds: branches tried and failed. Treat dead-ended scopes as unavailable.\n" +
  "- activeConflicts: current blockers. severity:blocking means NO option satisfies all hard preferences jointly.\n" +
  "- workflow.currentView.deadEndItemIds: item IDs dead-ended downstream. NEVER select or recommend these.\n" +
  "- workflow.priorStageSummaries: prior stages with untried alternatives, for suggesting where to backtrack.\n" +
  "\n" +
  "Dead-end handling:\n" +
  "- Always exclude deadEndItemIds — they are NOT viable.\n" +
  "- After exclusion, apply preferences. If exactly one viable option remains, select it immediately. If multiple remain, ask the user to choose.\n" +
  "\n" +
  "Backtracking:\n" +
  "- If history shows intent to navigate to an earlier stage and the current stage is not yet that target, call prev immediately. Do not pause at intermediate stages.\n" +
  "- After arriving via backtracking, do not re-ask the same options. Exclude dead-ended items, apply preferences, then act or ask among remaining viable options.\n" +
  "\n" +
  "Blocking conflicts (check IN ORDER, use FIRST match):\n" +
  "1. History shows the user is heading to an earlier stage → call prev immediately.\n" +
  "2. User agrees or requests backtracking → call prev immediately.\n" +
  "3. First encounter → inform the user briefly why no option works, suggest backtracking to the nearest stage from priorStageSummaries. Do NOT call prev yet — let the user decide.\n" +
  "- Resolution priority: (1) backtrack to try a different branch, (2) relax a preference only if user declines.\n" +
  "- If no stage in priorStageSummaries, suggest relaxing a preference instead.";

const GUI_ADAPTATION_ENABLED_RULES =
  "GUI adaptation rules:\n" +
  "\n" +
  "assistantMessage style:\n" +
  "- Treat assistantMessage as a brief spoken cue. Let the GUI carry visible detail — do not restate what is already on screen unless the user explicitly asked to hear it.\n" +
  "- Do not mention item metadata in assistantMessage if it is not already visible in the UI; surface it through a GUI tool first.\n" +
  "\n" +
  "Tool selection:\n" +
  "- augment: surface a hidden field tied to a user criterion or stage-relevant preference. Keep the original label recognizable. Surface only the minimum for one criterion — do not bundle multiple hidden attributes unless the user asked for a combined comparison.\n" +
  "- filter: narrow by a raw item field (not augmented display text). Do not filter if it would leave zero visible options.\n" +
  "- sort: reorder by a soft preference that implies ordering. Do not highlight after sorting — top position already signals the recommendation.\n" +
  "- highlight: mark viable option(s) for a hard preference or explicit request. Do not highlight when it adds no distinction.\n" +
  "\n" +
  "Visibility rule:\n" +
  "- If a user criterion references a field not yet visible in visibleItems[].value, augment to surface it. This applies both before and after sort/filter — if a sort or filter is already active on a field not shown in visible labels, augment so the user can see the basis of the ordering or filtering.\n" +
  "\n" +
  "Guardrails:\n" +
  "- Do not sort, filter, or augment without a user criterion or stage-relevant preference. Without one, prefer respond.\n" +
  "- Use only criteria grounded in what the user asked for. Do not introduce unsolicited comparison dimensions or hidden optimization goals.\n" +
  "- Repeated filter calls accumulate; sort does not imply a default selection.";

const GUI_ADAPTATION_DISABLED_RULES =
  "Response rules:\n" +
  "- assistantMessage is a brief spoken cue. Assume the user can see the current GUI — mention only the minimum labels needed.\n" +
  "- When the user asks for matching options, name them and briefly state why they match.\n" +
  "- Do not mention non-visible metadata, introduce unsolicited comparison dimensions, or turn a tie into an unrequested recommendation.";

const OPENAI_TOOL_CALLING_RULES =
  "Tool-calling rules:\n" +
  "- Use exactly one provided function on every turn.\n" +
  '- If no GUI tool should be used now, call "respond".\n' +
  '- Fill "reason" FIRST: assess user intent and current state, then justify the chosen action. Then write "assistantMessage" consistent with that reasoning.\n' +
  "- For GUI tool calls, assistantMessage should briefly describe the action and should not ask for permission.\n" +
  "- Base assistantMessage only on visible information and known context. Do not invent facts or claim later-stage knowledge.\n" +
  "- Do not use select or next to resolve a tie among multiple viable options unless the user has clearly committed to one specific choice.\n" +
  "- Never include internal item IDs in assistantMessage; use human-readable labels.\n" +
  "- Do not output plain text without a function call.";

export function getPlannerSystemPrompt(): string {
  return [CORE_SYSTEM_PROMPT, OPENAI_TOOL_CALLING_RULES].join("\n");
}

function hasCpMemoryContext(workflow: PlannerWorkflow): boolean {
  return workflow.cpMemoryEnabled === true;
}

function buildStageMetaSection(
  stageMeta:
    | Array<{ stage: string; goal: string; fieldGuide: string }>
    | undefined,
): string | null {
  if (!stageMeta || stageMeta.length === 0) return null;
  const order = stageMeta.map((s) => s.stage).join(" → ");
  const goals = stageMeta.map((s) => `  ${s.stage}: ${s.goal}`).join("\n");
  return `Stage workflow (fixed order):\n  ${order}\nStage goals:\n${goals}`;
}

// ── System prompt cache ─────────────────────────────────────────────────────
// cpMemoryEnabled + guiAdaptationEnabled + stageMeta are fixed for a session,
// so we memoize by the combination key to avoid rebuilding on every turn.

let cachedSystemPromptKey = "";
let cachedSystemPrompt = "";

function buildSystemPrompt(
  workflow: PlannerWorkflow,
  stageMeta?: Array<{ stage: string; goal: string; fieldGuide: string }>,
): string {
  const cpMemory = hasCpMemoryContext(workflow);
  const guiAdaptation = workflow.guiAdaptationEnabled !== false;
  const key = `cp:${cpMemory}|gui:${guiAdaptation}|meta:${stageMeta ? stageMeta.length : 0}`;

  if (key === cachedSystemPromptKey && cachedSystemPrompt) {
    return cachedSystemPrompt;
  }

  const sections = [CORE_SYSTEM_PROMPT];
  const stageSection = buildStageMetaSection(stageMeta);
  if (stageSection) {
    sections.push(stageSection);
  }
  if (cpMemory) {
    sections.push(CP_MEMORY_PROMPT_RULES);
  }
  if (guiAdaptation) {
    sections.push(GUI_ADAPTATION_ENABLED_RULES);
  } else {
    sections.push(GUI_ADAPTATION_DISABLED_RULES);
  }

  cachedSystemPrompt = sections.join("\n");
  cachedSystemPromptKey = key;
  return cachedSystemPrompt;
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
    return "One very short user-facing message describing the step. Assume it may be spoken aloud. Do not restate details that are already visible in the GUI after the action.";
  }
  return "User-facing message describing the step. Assume it may be spoken aloud. When GUI adaptation is unavailable, include enough visible detail to name relevant options or explain the criterion because the GUI will not carry that extra explanation for you.";
}

function getRespondToolDescription(guiAdaptationEnabled: boolean): string {
  if (guiAdaptationEnabled) {
    return "Respond to the user without executing any GUI tool. Use this for the smallest helpful clarification, confirmation, or direct answer based only on currently visible information, without re-narrating GUI details that are already on screen.";
  }
  return "Respond to the user without executing any GUI tool. Base the reply on currently visible information. When GUI adaptation is unavailable, use enough detail to name matching visible options or briefly explain why they fit.";
}

function getRespondAssistantMessageDescription(
  guiAdaptationEnabled: boolean,
): string {
  if (guiAdaptationEnabled) {
    return "A very concise user-facing response. Keep it to the smallest helpful clarification or direct answer based only on currently visible information. Do not mention non-visible item metadata, introduce a new comparison dimension, or read back GUI details that are already visible.";
  }
  return "User-facing response based on currently visible information. When GUI adaptation is unavailable, it may be one to three short sentences naming visible matching options or briefly explaining why they fit. Do not mention non-visible item metadata or invent a new comparison dimension.";
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
        "Decide first: assess user intent and current state, identify viable options, then justify why this tool and params are the correct next step.",
    };
    properties[TOOL_META_ASSISTANT_MESSAGE_KEY] = {
      type: "string",
      description: getToolAssistantMessageDescription(guiAdaptationEnabled),
    };
    required.push(TOOL_META_REASON_KEY);
    required.push(TOOL_META_ASSISTANT_MESSAGE_KEY);

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
            "Decide first: assess user intent and current state, then explain why no GUI action is needed.",
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
    buildSystemPrompt(input.workflow, input.stageMeta) +
    "\n" +
    OPENAI_TOOL_CALLING_RULES;
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
