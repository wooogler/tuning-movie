import {
  planActionWithOpenAI,
  planActionWithGemini,
  type PlannerWorkflow,
  type PlannerWorkflowMemory,
} from '../llm/llmPlanner';
import { refreshModelEnvVars } from './envRefresh';
import type { AgentMemory } from './memory';
import {
  summarizeActiveConflict,
  summarizeDeadEnd,
  summarizePreference,
} from './cpMemory';
import {
  getEnabledVisibleItems,
  getSelectedId,
  getSelectedListIds,
  toUISpecLike,
  type UISpecLike,
} from './uiModel';
import {
  buildWorkflowSelectionState,
  WORKFLOW_STAGE_ORDER,
  type WorkflowStage,
} from './workflowState';
import type {
  ActiveConflict,
  DeadEnd,
  PerceivedContext,
  PlanDecision,
  PlannedAction,
  Preference,
  ToolSchemaItem,
} from '../types';

type Stage = WorkflowStage;
const STAGE_ORDER = WORKFLOW_STAGE_ORDER;
const RAW_SCAN_WINDOW = 24;
const RECENT_WINDOW = 8;
const MAX_HISTORY_ENTRIES = 12;
const MAX_VISIBLE_ITEMS_PER_SYSTEM = 12;

type HistoryMessageType = 'system' | 'user' | 'agent';

interface CompactedHistoryEntry {
  index: number;
  type: HistoryMessageType;
  value: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function toHistoryType(value: unknown): HistoryMessageType | null {
  const type = readTrimmedString(value);
  if (type === 'system' || type === 'user' || type === 'agent') return type;
  return null;
}

function compactVisibleItems(
  value: unknown,
  maxItems: number
): Array<{ id: string; value: string; isDisabled?: true }> {
  if (!Array.isArray(value)) return [];
  const compacted: Array<{ id: string; value: string; isDisabled?: true }> = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    const id = readTrimmedString(record.id);
    const itemValue = readTrimmedString(record.value);
    if (!id || !itemValue) continue;
    if (record.isDisabled === true) {
      compacted.push({ id, value: itemValue, isDisabled: true });
    } else {
      compacted.push({ id, value: itemValue });
    }
    if (compacted.length >= maxItems) break;
  }
  return compacted;
}

function compactSystemSpec(
  value: unknown,
  includeItems: boolean
): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;

  const stage = readTrimmedString(record.stage);
  const state = asRecord(record.state);
  const selectedRaw = asRecord(state?.selected);
  const selectedId = selectedRaw ? readTrimmedString(selectedRaw.id) : null;
  const selectedValue = selectedRaw ? readTrimmedString(selectedRaw.value) : null;
  const selectedListCount =
    state && Array.isArray(state.selectedList) ? state.selectedList.length : 0;
  const modification = asRecord(record.modification);
  const summary: Record<string, unknown> = {};
  const rawVisibleItems = Array.isArray(record.visibleItems) ? record.visibleItems : [];
  const visibleItems = compactVisibleItems(rawVisibleItems, MAX_VISIBLE_ITEMS_PER_SYSTEM);

  if (stage) summary.stage = stage;
  if (visibleItems.length > 0) {
    summary.visibleItems = visibleItems;
  }
  if (rawVisibleItems.length > visibleItems.length) {
    summary.visibleItemCount = rawVisibleItems.length;
  }
  if (selectedId && selectedValue) {
    summary.selected = { id: selectedId, value: selectedValue };
  }
  if (selectedListCount > 0) {
    summary.selectedListCount = selectedListCount;
  }
  if (modification) {
    summary.modification = modification;
  }
  if (includeItems) {
    if (Array.isArray(record.items) && record.items.length > 0) {
      summary.items = record.items;
    }
  }

  return Object.keys(summary).length > 0 ? summary : null;
}

function compactHistoryEntry(
  entry: unknown,
  includeSystemItems: boolean
): { type: HistoryMessageType; value: Record<string, unknown> } | null {
  const record = asRecord(entry);
  if (!record) return null;

  const type = toHistoryType(record.type);
  if (!type) return null;

  const compacted: Record<string, unknown> = { type };
  const stage = readTrimmedString(record.stage);
  if (stage) compacted.stage = stage;

  if (type === 'user') {
    const action = readTrimmedString(record.action);
    const label = readTrimmedString(record.label);
    if (action) compacted.action = action;
    if (label) compacted.label = label;
    if (!action && !label) return null;
    return { type, value: compacted };
  }

  if (type === 'agent') {
    const text = readTrimmedString(record.text);
    if (!text) return null;
    compacted.text = text;
    return { type, value: compacted };
  }

  const compactedSpec = compactSystemSpec(record.spec, includeSystemItems);
  const annotation = asRecord(record.annotation);
  if (compactedSpec) compacted.spec = compactedSpec;
  if (annotation) compacted.annotation = annotation;
  if (!compactedSpec && !annotation && !stage) return null;
  return { type, value: compacted };
}

function getLatestCompactedByType(
  entries: CompactedHistoryEntry[],
  targetType: HistoryMessageType
): CompactedHistoryEntry | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].type === targetType) {
      return entries[i];
    }
  }
  return null;
}

function hasTool(toolSchema: ToolSchemaItem[], toolName: string): boolean {
  return toolSchema.some((tool) => tool.name === toolName);
}

function getPlannerToolSchema(toolSchema: ToolSchemaItem[]): ToolSchemaItem[] {
  // Treat conversational text as assistant response (agent.message), not as a UI tool.
  return toolSchema.filter((tool) => tool.name !== 'postMessage');
}

function toStage(raw: string | null): Stage | null {
  switch (raw) {
    case 'movie':
    case 'theater':
    case 'date':
    case 'time':
    case 'seat':
    case 'confirm':
      return raw;
    default:
      return null;
  }
}

function toolCall(toolName: string, params: Record<string, unknown>, reason: string): PlannedAction {
  return {
    type: 'tool.call',
    reason,
    payload: {
      toolName,
      params,
      reason,
    },
  };
}

function containsBookingConfirmed(messages: unknown[]): boolean {
  const tail = messages.slice(-10);
  return tail.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const record = entry as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : '';
    const label = typeof record.label === 'string' ? record.label : '';
    return type === 'user' && label.toLowerCase().includes('booking confirmed');
  });
}

function stageGoal(stage: Stage): string {
  switch (stage) {
    case 'movie':
      return 'Pick one movie title.';
    case 'theater':
      return 'Pick one theater for the selected movie.';
    case 'date':
      return 'Pick one date for the selected movie and theater.';
    case 'time':
      return 'Pick one showtime.';
    case 'seat':
      return 'Select one or more seats.';
    case 'confirm':
      return 'Submit confirmation to finalize booking.';
    default:
      return 'Make progress to the next stage.';
  }
}

function stageTransition(stage: Stage): { previousStage: Stage | null; nextStage: Stage | null } {
  const index = STAGE_ORDER.indexOf(stage);
  if (index < 0) return { previousStage: null, nextStage: null };
  return {
    previousStage: index > 0 ? STAGE_ORDER[index - 1] : null,
    nextStage: index < STAGE_ORDER.length - 1 ? STAGE_ORDER[index + 1] : null,
  };
}

function buildWorkflowContext(
  context: PerceivedContext,
  stage: Stage,
  spec: UISpecLike,
  plannerTools: ToolSchemaItem[],
  plannerMemory: PlannerWorkflowMemory | null,
  cpMemoryEnabled: boolean
): PlannerWorkflow {
  const selectedId = getSelectedId(spec);
  const selectedListCount = getSelectedListIds(spec).length;
  const canNext = hasTool(plannerTools, 'next');
  const { previousStage, nextStage } = stageTransition(stage);

  const guardrails: string[] = [
    'Choose exactly one action for this turn.',
    'Do not call tools outside availableToolNames.',
  ];
  let proceedRule = 'Only advance stage when required selections are complete.';

  if (stage === 'seat') {
    proceedRule =
      `Use select for a single-seat toggle, or selectMultiple to replace the full selected seat set. ` +
      `Call next only if selectedListCount > 0 (current: ${selectedListCount}).`;
  } else if (stage === 'confirm') {
    const bookingConfirmed = containsBookingConfirmed(context.messageHistoryTail);
    proceedRule = bookingConfirmed
      ? 'Booking confirmation detected; end session.'
      : `Submit confirmation when ready (next available: ${String(canNext)}).`;
  } else {
    proceedRule = `Call next only when selectedId exists (current: ${selectedId ?? 'null'}).`;
  }

  const workflowState = buildWorkflowSelectionState({
    currentStage: stage,
    messageHistory: context.messageHistoryTail,
    uiSpec: context.uiSpec,
  });
  const workflow: PlannerWorkflow = {
    stageOrder: STAGE_ORDER,
    currentStage: stage,
    previousStage,
    nextStage,
    stageGoal: stageGoal(stage),
    proceedRule,
    availableToolNames: plannerTools.map((tool) => tool.name),
    guardrails,
    ...(workflowState ? { state: workflowState } : {}),
    ...(plannerMemory ? { memory: plannerMemory } : {}),
    cpMemoryEnabled,
  };

  return workflow;
}

function buildPlannerHistory(
  context: PerceivedContext
): unknown[] {
  // Compact raw timeline entries and keep a recent+anchored subset for planner context.
  const rawHistory = context.messageHistoryTail.slice(-RAW_SCAN_WINDOW);
  let latestSystemRawIndex = -1;

  for (let i = rawHistory.length - 1; i >= 0; i -= 1) {
    const record = asRecord(rawHistory[i]);
    if (!record) continue;
    if (toHistoryType(record.type) === 'system') {
      latestSystemRawIndex = i;
      break;
    }
  }

  const compacted: CompactedHistoryEntry[] = [];
  for (let i = 0; i < rawHistory.length; i += 1) {
    const normalized = compactHistoryEntry(rawHistory[i], i === latestSystemRawIndex);
    if (!normalized) continue;
    compacted.push({
      index: i,
      type: normalized.type,
      value: normalized.value,
    });
  }

  if (compacted.length === 0) return [];

  const selectedByIndex = new Map<number, CompactedHistoryEntry>();
  for (const entry of compacted.slice(-RECENT_WINDOW)) {
    selectedByIndex.set(entry.index, entry);
  }

  for (const type of ['system', 'user', 'agent'] as const) {
    const latest = getLatestCompactedByType(compacted, type);
    if (latest) {
      selectedByIndex.set(latest.index, latest);
    }
  }

  const ordered = Array.from(selectedByIndex.values()).sort((a, b) => a.index - b.index);
  const bounded = ordered.slice(-MAX_HISTORY_ENTRIES);
  return bounded.map((entry) => entry.value);
}

function sliceRecent<T>(list: T[], maxItems: number): T[] {
  if (!Number.isFinite(maxItems) || maxItems <= 0) return [];
  const limit = Math.floor(maxItems);
  if (limit <= 0) return [];
  return list.slice(-limit);
}

function buildPlannerMemory(
  preferences: Preference[],
  activeConflicts: ActiveConflict[],
  deadEnds: DeadEnd[],
  plannerCpMemoryLimit: number
): PlannerWorkflowMemory | null {
  const limitedDeadEnds = plannerCpMemoryLimit > 0 ? sliceRecent(deadEnds, plannerCpMemoryLimit) : [];
  if (preferences.length === 0 && activeConflicts.length === 0 && limitedDeadEnds.length === 0) {
    return null;
  }

  return {
    preferences,
    activeConflicts,
    deadEnds: limitedDeadEnds,
    summaries: {
      preferences: preferences.map(summarizePreference),
      activeConflicts: activeConflicts.map(summarizeActiveConflict),
      deadEnds: limitedDeadEnds.map(summarizeDeadEnd),
    },
  };
}

function validateLlmAction(
  context: PerceivedContext,
  spec: UISpecLike,
  decision: {
    assistantMessage: string;
    action: {
      type: 'tool.call' | 'none';
      toolName: string;
      params: Record<string, unknown>;
      reason: string;
    };
  }
): PlanDecision | null {
  const explainText = decision.assistantMessage.trim() || undefined;
  if (decision.action.type === 'none') {
    return {
      action: null,
      explainText,
      source: 'llm',
    };
  }

  const toolName = decision.action.toolName;

  if (toolName === 'postMessage') {
    const text = typeof decision.action.params.text === 'string' ? decision.action.params.text.trim() : '';
    return {
      action: {
        type: 'agent.message',
        reason: decision.action.reason,
        payload: {
          text: text || explainText || decision.action.reason,
        },
      },
      explainText,
      source: 'llm',
    };
  }

  if (!toolName || !hasTool(context.toolSchema, toolName)) return null;

  const params = decision.action.params ?? {};

  if (toolName === 'select') {
    const itemId = typeof params.itemId === 'string' ? params.itemId : '';
    if (!itemId) return null;
    const selectable = new Set(getEnabledVisibleItems(spec).map((item) => item.id));
    if (!selectable.has(itemId)) return null;
    return {
      action: toolCall(toolName, { itemId }, decision.action.reason),
      explainText,
      source: 'llm',
    };
  }

  if (toolName === 'selectMultiple') {
    if (spec.stage !== 'seat') return null;
    const itemIds = normalizeStringArray(params.itemIds);
    if (itemIds.length === 0) return null;
    const selectable = new Set(getEnabledVisibleItems(spec).map((item) => item.id));
    if (itemIds.some((itemId) => !selectable.has(itemId))) return null;
    return {
      action: toolCall(toolName, { itemIds }, decision.action.reason),
      explainText,
      source: 'llm',
    };
  }

  return {
    action: toolCall(toolName, params, decision.action.reason),
    explainText,
    source: 'llm',
  };
}

export async function planNextAction(
  context: PerceivedContext,
  memory: AgentMemory
): Promise<PlanDecision> {
  if (!context.sessionId) {
    return { action: null, source: 'rule', fallbackReason: 'NO_SESSION' };
  }

  const stage = toStage(context.stage);
  const spec = toUISpecLike(context.uiSpec);
  if (!stage || !spec) {
    return { action: null, source: 'rule', fallbackReason: 'INVALID_STAGE_OR_SPEC' };
  }

  const userRequest = context.lastUserMessage?.text ?? '';
  const hasUserRequest = Boolean(userRequest.trim());

  refreshModelEnvVars();

  const geminiEnabled =
    process.env.AGENT_ENABLE_GEMINI !== 'false' && Boolean(process.env.GEMINI_API_KEY);
  const openaiEnabled =
    process.env.AGENT_ENABLE_OPENAI !== 'false' && Boolean(process.env.OPENAI_API_KEY);

  if (!geminiEnabled && !openaiEnabled) {
    return {
      action: null,
      explainText: hasUserRequest
        ? 'Planner model is unavailable right now. Please try again in a moment.'
        : undefined,
      source: 'rule',
      fallbackReason: 'LLM_DISABLED_NO_PROVIDER',
    };
  }

  try {
    const plannerTools = getPlannerToolSchema(context.toolSchema);
    const plannerCpMemoryLimit = Math.max(0, Math.floor(context.plannerCpMemoryLimit ?? 0));
    const plannerMemory = buildPlannerMemory(
      memory.getPreferences(),
      memory.getActiveConflicts(),
      memory.getDeadEnds(),
      plannerCpMemoryLimit
    );
    const cpMemoryEnabled = plannerMemory !== null;
    const plannerInput = {
      history: buildPlannerHistory(context),
      availableTools: plannerTools,
      workflow: buildWorkflowContext(
        context,
        stage,
        spec,
        plannerTools,
        plannerMemory,
        cpMemoryEnabled
      ),
    };

    const llm = geminiEnabled
      ? await planActionWithGemini(plannerInput)
      : await planActionWithOpenAI(plannerInput);

    if (!llm) {
      return {
        action: null,
        explainText: hasUserRequest
          ? 'I could not parse a planner output this turn. Please rephrase your request.'
          : undefined,
        source: 'rule',
        fallbackReason: 'LLM_EMPTY_OR_UNPARSEABLE_OUTPUT',
      };
    }

    const validated = validateLlmAction(context, spec, llm);
    if (!validated) {
      return {
        action: null,
        explainText: hasUserRequest
          ? 'I could not validate the planner action against the current UI state.'
          : undefined,
        source: 'rule',
        fallbackReason: 'LLM_VALIDATION_REJECTED',
      };
    }

    return validated;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      action: null,
      explainText: hasUserRequest
        ? 'Planner request failed this turn. Please try again shortly.'
        : undefined,
      source: 'rule',
      fallbackReason: `LLM_REQUEST_FAILED:${message}`,
    };
  }
}
