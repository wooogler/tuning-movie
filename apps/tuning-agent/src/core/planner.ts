import {
  planActionWithOpenAI,
  type PlannerWorkflow,
  type PlannerWorkflowMemory,
} from '../llm/llmPlanner';
import { refreshModelEnvVars } from './envRefresh';
import type { AgentMemory } from './memory';
import {
  getEnabledVisibleItems,
  getHighlightedIds,
  getSelectedId,
  getSelectedListIds,
  toUISpecLike,
  type UISpecLike,
} from './uiModel';
import { buildEndTimeMap, parseDurationMinutes } from './timeUtils';
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
  value: unknown
): Array<{ id: string; value: string; isDisabled?: true }> {
  if (!Array.isArray(value)) return [];
  const compacted: Array<{ id: string; value: string; isDisabled?: true }> = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    const id = readTrimmedString(record.id);
    const itemValue = readTrimmedString(record.value);
    if (!id || !itemValue) continue;
    if (record.isDisabled === true) continue;
    compacted.push({ id, value: itemValue });
  }
  return compacted;
}

function compactSystemSpec(value: unknown): Record<string, unknown> | null {
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
  const visibleItems = compactVisibleItems(rawVisibleItems);

  if (stage) summary.stage = stage;
  if (visibleItems.length > 0) {
    summary.visibleItems = visibleItems;
  }
  if (rawVisibleItems.length > visibleItems.length) {
    summary.disabledItemCount = rawVisibleItems.length - visibleItems.length;
  }
  if (selectedId && selectedValue) {
    summary.selected = { id: selectedId, value: selectedValue };
  }
  if (selectedListCount > 0) {
    summary.selectedListCount = selectedListCount;
  }
  if (modification && Object.keys(modification).length > 0) {
    summary.modification = modification;
  }

  // Preserve confirm stage meta (booking summary) so the planner can see it
  if (stage === 'confirm' && record.meta && typeof record.meta === 'object') {
    summary.meta = record.meta;
  }

  return Object.keys(summary).length > 0 ? summary : null;
}

function compactAnnotation(
  value: unknown,
  includeReason: boolean
): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;

  const kind = readTrimmedString(record.kind);
  const toolName = readTrimmedString(record.toolName);
  const source = readTrimmedString(record.source);
  const reason = includeReason ? readTrimmedString(record.reason) : null;

  const summary: Record<string, unknown> = {};
  if (kind) summary.kind = kind;
  if (toolName) summary.toolName = toolName;
  if (source) summary.source = source;
  if (reason) summary.reason = reason;

  return Object.keys(summary).length > 0 ? summary : null;
}

function compactAgentText(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;
  if (toHistoryType(record.type) !== 'agent') return null;
  return readTrimmedString(record.text);
}

function compactHistoryEntry(
  entry: unknown,
  linkedAgentText?: string | null
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

  const compactedSpec = compactSystemSpec(record.spec);
  const annotation = compactAnnotation(record.annotation, !linkedAgentText);
  if (compactedSpec) compacted.spec = compactedSpec;
  if (linkedAgentText) compacted.linkedAgentText = linkedAgentText;
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

function stageTransition(stage: Stage): { previousStage: Stage | null; nextStage: Stage | null } {
  const index = STAGE_ORDER.indexOf(stage);
  if (index < 0) return { previousStage: null, nextStage: null };
  return {
    previousStage: index > 0 ? STAGE_ORDER[index - 1] : null,
    nextStage: index < STAGE_ORDER.length - 1 ? STAGE_ORDER[index + 1] : null,
  };
}

function buildSeatLayoutMeta(items: unknown[]): Record<string, unknown> | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const rows = new Set<string>();
  let maxCol = 0;
  for (const rawItem of items) {
    const item = asRecord(rawItem);
    if (!item) continue;
    const row = readTrimmedString(item.row);
    const col = typeof item.number === 'number' ? item.number : 0;
    if (row) rows.add(row);
    if (col > maxCol) maxCol = col;
  }
  if (rows.size === 0 || maxCol === 0) return null;
  return {
    rows: Array.from(rows).sort(),
    seatsPerRow: maxCol,
    totalSeats: items.length,
  };
}

function buildCurrentView(spec: UISpecLike): Record<string, unknown> | null {
  const rawSpec = asRecord(spec as unknown);
  if (!rawSpec) return null;

  const state = asRecord(rawSpec.state);
  const modification = asRecord(rawSpec.modification);
  const selectedId = getSelectedId(spec);
  const selectedValue = readTrimmedString(state?.selected && asRecord(state.selected)?.value);
  const selectedListIds = getSelectedListIds(spec);
  const highlightedIds = Array.from(
    new Set([
      ...normalizeStringArray(asRecord(modification?.highlight)?.itemIds),
      ...getHighlightedIds(spec),
    ])
  ).sort();
  const visibleItems = compactVisibleItems(rawSpec.visibleItems);
  const summary: Record<string, unknown> = {
    stage: spec.stage ?? null,
  };

  if (visibleItems.length > 0) {
    summary.visibleItems = visibleItems;
  }
  const rawVisibleItems = Array.isArray(rawSpec.visibleItems) ? rawSpec.visibleItems.length : 0;
  if (rawVisibleItems > visibleItems.length) {
    summary.disabledItemCount = rawVisibleItems - visibleItems.length;
  }
  if (selectedId) {
    summary.selected = selectedValue ? { id: selectedId, value: selectedValue } : { id: selectedId };
  }
  if (selectedListIds.length > 0) {
    summary.selectedListIds = selectedListIds;
  }
  if (highlightedIds.length > 0) {
    summary.highlightedIds = highlightedIds;
  }
  // Keep non-highlight modifications (filter, sort, augment)
  if (modification) {
    const other: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(modification)) {
      if (key !== 'highlight') other[key] = val;
    }
    if (Object.keys(other).length > 0) {
      summary.modification = other;
    }
  }
  // Item details for current stage
  const items = Array.isArray(rawSpec.items) ? rawSpec.items : [];
  if (items.length > 0) {
    const seatLayout = buildSeatLayoutMeta(items);
    if (seatLayout) {
      // Seat stage: layout meta + available seats only
      summary.seatLayout = seatLayout;
      summary.items = (items as Record<string, unknown>[])
        .filter((item) => item && asRecord(item)?.status === 'available')
        .map((item) => {
          const { showingId: _s, label: _l, status: _st, ...rest } = item as Record<string, unknown>;
          return rest;
        });
    } else {
      // Other stages: include all items
      summary.items = items;
    }
  }

  return Object.keys(summary).length > 0 ? summary : null;
}

function buildTurnContext(trigger: string | undefined, context: PerceivedContext): Record<string, unknown> | null {
  const summary: Record<string, unknown> = {};

  if (trigger) {
    const deferred = trigger.startsWith('deferred:');
    if (deferred) {
      summary.trigger = trigger.slice('deferred:'.length);
      summary.isDeferred = true;
    } else {
      summary.trigger = trigger;
    }
  }

  if (context.lastUserMessage?.text?.trim()) {
    summary.lastUserMessageStage = context.lastUserMessage.stage ?? null;
  }

  return Object.keys(summary).length > 0 ? summary : null;
}

const STAGE_SCOPE_KEY: Record<string, string> = { time: 'showing', seat: 'seats' };

const STAGE_PARENT_SCOPE_KEYS: Record<string, string[]> = Object.fromEntries(
  STAGE_ORDER.map((stage, i) =>
    [stage, STAGE_ORDER.slice(0, i).map((s) => STAGE_SCOPE_KEY[s] ?? s)],
  ),
);

function resolveStateScopeValue(
  state: Record<string, unknown>,
  scopeKey: string,
): string | null {
  const entry = asRecord(state[scopeKey]);
  if (!entry) return null;
  return (
    readTrimmedString(entry.title) ??
    readTrimmedString(entry.name) ??
    readTrimmedString(entry.date) ??
    readTrimmedString(entry.id) ??
    null
  );
}

function isDeadEndRelevant(
  deadEnd: DeadEnd,
  stage: string,
  state: Record<string, unknown> | null,
): boolean {
  if (!state) return true;
  const parentKeys = STAGE_PARENT_SCOPE_KEYS[stage] ?? [];
  const scope = deadEnd.scope as unknown as Record<string, unknown>;

  for (const key of parentKeys) {
    const scopeValue = typeof scope[key] === 'string' ? (scope[key] as string) : null;
    if (!scopeValue) continue;
    const stateValue = resolveStateScopeValue(state, key);
    if (!stateValue) continue;
    if (scopeValue !== stateValue) return false;
  }
  return true;
}

function findDeadEndItemIds(
  items: Record<string, unknown>[],
  deadEnds: DeadEnd[],
  stage: string,
  state: Record<string, unknown> | null,
): string[] {
  const scopeKey = STAGE_SCOPE_KEY[stage] ?? stage;
  const relevantDeadEnds = deadEnds.filter((de) => isDeadEndRelevant(de, stage, state));
  const deadEndValues = new Set<string>();
  for (const de of relevantDeadEnds) {
    const scope = de.scope as unknown as Record<string, unknown>;
    const val = typeof scope[scopeKey] === 'string' ? (scope[scopeKey] as string) : null;
    if (val) deadEndValues.add(val);
  }
  if (deadEndValues.size === 0) return [];

  const ids: string[] = [];
  for (const item of items) {
    const id = typeof item.id === 'string' ? item.id : null;
    if (!id) continue;
    for (const v of Object.values(item)) {
      if (typeof v === 'string' && deadEndValues.has(v)) {
        ids.push(id);
        break;
      }
    }
  }
  return ids;
}

function buildWorkflowContext(
  context: PerceivedContext,
  stage: Stage,
  spec: UISpecLike,
  plannerTools: ToolSchemaItem[],
  cpMemoryEnabled: boolean,
  deadEnds: DeadEnd[],
  stageItemCounts: Map<string, { total: number; highlighted: number }>,
  trigger?: string
): PlannerWorkflow {
  const selectedId = getSelectedId(spec);
  const selectedListCount = getSelectedListIds(spec).length;
  const canNext = hasTool(plannerTools, 'next');
  const { previousStage, nextStage } = stageTransition(stage);
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
  const currentView = buildCurrentView(spec);

  if (currentView && stage === 'time' && Array.isArray(currentView.items) && workflowState) {
    const movie = asRecord(workflowState.movie);
    const duration = movie ? readTrimmedString(movie.duration) : null;
    if (duration) {
      const mins = parseDurationMinutes(duration);
      if (mins) {
        const endTimeMap = buildEndTimeMap(currentView.items as Record<string, unknown>[], mins);
        if (endTimeMap) currentView.endTimeByItemId = endTimeMap;
      }
    }
  }

  if (currentView && Array.isArray(currentView.items) && deadEnds.length > 0) {
    const deadEndIds = findDeadEndItemIds(currentView.items as Record<string, unknown>[], deadEnds, stage, workflowState ?? null);
    if (deadEndIds.length > 0) currentView.deadEndItemIds = deadEndIds;
  }

  const turnContext = buildTurnContext(trigger, context);
  const priorStageSummaries = buildPriorStageSummaries(stageItemCounts, stage);
  const workflow: PlannerWorkflow = {
    currentStage: stage,
    previousStage,
    nextStage,
    proceedRule,
    availableToolNames: [...plannerTools.map((tool) => tool.name), 'respond'],
    guiAdaptationEnabled: context.guiAdaptationEnabled,
    ...(workflowState ? { state: workflowState } : {}),
    ...(currentView ? { currentView } : {}),
    ...(turnContext ? { turnContext } : {}),
    ...(priorStageSummaries.length > 0 ? { priorStageSummaries } : {}),
    cpMemoryEnabled,
  };

  return workflow;
}

function getSystemEntrySignature(entry: CompactedHistoryEntry): string | null {
  if (entry.type !== 'system') return null;
  const spec = asRecord(entry.value.spec);
  if (!spec) return null;
  const stage = readTrimmedString(entry.value.stage) ?? readTrimmedString(spec.stage) ?? '';
  return JSON.stringify({ stage, spec });
}

function collapseRedundantSystemEntries(entries: CompactedHistoryEntry[]): CompactedHistoryEntry[] {
  const collapsed: CompactedHistoryEntry[] = [];

  for (const entry of entries) {
    const previous = collapsed[collapsed.length - 1];
    const previousSignature = previous ? getSystemEntrySignature(previous) : null;
    const currentSignature = getSystemEntrySignature(entry);

    if (previous && previousSignature && currentSignature && previousSignature === currentSignature) {
      collapsed[collapsed.length - 1] = entry;
      continue;
    }

    collapsed.push(entry);
  }

  return collapsed;
}

function buildPlannerHistory(
  context: PerceivedContext,
  cpMemoryEnabled: boolean
): unknown[] {
  // When CP memory is off, let the planner rely on the full compacted timeline instead.
  const rawHistory = cpMemoryEnabled
    ? context.messageHistoryTail.slice(-RAW_SCAN_WINDOW)
    : context.messageHistoryTail.slice();

  const compacted: CompactedHistoryEntry[] = [];
  for (let i = 0; i < rawHistory.length; i += 1) {
    const rawEntry = rawHistory[i];
    const current = asRecord(rawEntry);
    if (!current) continue;

    const currentType = toHistoryType(current.type);
    const currentStage = readTrimmedString(current.stage);
    let linkedAgentText: string | null = null;

    if (currentType === 'system') {
      const next = asRecord(rawHistory[i + 1]);
      const nextType = next ? toHistoryType(next.type) : null;
      const nextStage = next ? readTrimmedString(next.stage) : null;
      const hasAnnotation = Boolean(compactAnnotation(current.annotation, true));
      if (hasAnnotation && nextType === 'agent' && currentStage && nextStage === currentStage) {
        linkedAgentText = compactAgentText(next);
        if (linkedAgentText) {
          i += 1;
        }
      }
    }

    const normalized = compactHistoryEntry(rawEntry, linkedAgentText);
    if (!normalized) continue;
    compacted.push({
      index: i,
      type: normalized.type,
      value: normalized.value,
    });
  }

  const collapsed = collapseRedundantSystemEntries(compacted);

  if (collapsed.length === 0) return [];

  if (!cpMemoryEnabled) {
    return collapsed.map((entry) => entry.value);
  }

  const selectedByIndex = new Map<number, CompactedHistoryEntry>();
  for (const entry of collapsed.slice(-RECENT_WINDOW)) {
    selectedByIndex.set(entry.index, entry);
  }

  for (const type of ['system', 'user', 'agent'] as const) {
    const latest = getLatestCompactedByType(collapsed, type);
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

function filterPlannerPreferencesByStage(preferences: Preference[], stage: Stage): Preference[] {
  return preferences.filter((preference) => {
    const relevantStages = Array.isArray(preference.relevantStages) ? preference.relevantStages : [];
    return relevantStages.length === 0 || relevantStages.includes(stage);
  });
}

function buildPriorStageSummaries(
  stageItemCounts: Map<string, { total: number; highlighted: number }>,
  currentStage: Stage
): Array<{ stage: string; alternatives: number }> {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  if (currentIdx <= 0) return [];

  const summaries: Array<{ stage: string; alternatives: number }> = [];
  for (let i = 0; i < currentIdx; i++) {
    const s = STAGE_ORDER[i];
    const counts = stageItemCounts.get(s);
    if (!counts) continue;
    const base = counts.highlighted > 0 ? counts.highlighted : counts.total;
    const alternatives = base - 1;
    if (alternatives > 0) {
      summaries.push({ stage: s, alternatives });
    }
  }
  return summaries;
}

function buildPlannerMemory(
  preferences: Preference[],
  activeConflicts: ActiveConflict[],
  deadEnds: DeadEnd[],
  plannerCpMemoryLimit: number
): PlannerWorkflowMemory | null {
  if (!Number.isFinite(plannerCpMemoryLimit) || plannerCpMemoryLimit <= 0) {
    return null;
  }

  const limitedDeadEnds = plannerCpMemoryLimit > 0 ? sliceRecent(deadEnds, plannerCpMemoryLimit) : [];
  if (preferences.length === 0 && activeConflicts.length === 0 && limitedDeadEnds.length === 0) {
    return null;
  }

  const compactDeadEnds = limitedDeadEnds.map(({ preferenceIds, scope, reason }) => ({
    preferenceIds,
    scope,
    reason,
  }));

  return {
    preferences,
    activeConflicts,
    deadEnds: compactDeadEnds,
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
      reason?: string;
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
        reason: decision.action.reason ?? '',
        payload: {
          text: text || explainText || (decision.action.reason ?? ''),
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
      action: toolCall(toolName, { itemId }, decision.action.reason ?? ''),
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
      action: toolCall(toolName, { itemIds }, decision.action.reason ?? ''),
      explainText,
      source: 'llm',
    };
  }

  return {
    action: toolCall(toolName, params, decision.action.reason ?? ''),
    explainText,
    source: 'llm',
  };
}

export async function planNextAction(
  context: PerceivedContext,
  memory: AgentMemory,
  trigger?: string
): Promise<PlanDecision> {
  if (!context.sessionId) {
    return { action: null, source: 'rule', fallbackReason: 'NO_SESSION' };
  }

  const stage = toStage(context.stage);
  const spec = toUISpecLike(context.uiSpec);
  if (!stage || !spec) {
    return { action: null, source: 'rule', fallbackReason: 'INVALID_STAGE_OR_SPEC' };
  }

  const visibleCount = getEnabledVisibleItems(spec).length;
  const highlightedCount = getHighlightedIds(spec).length;
  memory.setStageItemCount(stage, visibleCount, highlightedCount);

  const userRequest = context.lastUserMessage?.text ?? '';
  const hasUserRequest = Boolean(userRequest.trim());

  refreshModelEnvVars();

  const openaiEnabled =
    process.env.AGENT_ENABLE_OPENAI !== 'false' && Boolean(process.env.OPENAI_API_KEY);

  if (!openaiEnabled) {
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
    const cpMemoryEnabled = plannerCpMemoryLimit > 0;
    const plannerMemory = buildPlannerMemory(
      filterPlannerPreferencesByStage(memory.getPreferences(), stage),
      memory.getActiveConflicts(),
      memory.getDeadEnds(),
      plannerCpMemoryLimit
    );
    const plannerHistory = buildPlannerHistory(context, cpMemoryEnabled);
    const plannerInput = {
      ...(plannerMemory ? { memory: plannerMemory } : {}),
      history: plannerHistory,
      availableTools: plannerTools,
      workflow: buildWorkflowContext(
        context,
        stage,
        spec,
        plannerTools,
        cpMemoryEnabled,
        memory.getDeadEnds(),
        memory.getStageItemCounts(),
        trigger
      ),
      stageMeta: context.stageMeta,
    };

    const llm = await planActionWithOpenAI(plannerInput);

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
