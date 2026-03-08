import { executePlannedAction } from './core/executor';
import { AgentMemory } from './core/memory';
import { applyStateUpdated, applyUserMessage, fromSnapshot } from './core/perception';
import { planBaselineAction } from './core/baselinePlanner';
import { planNextAction } from './core/planner';
import {
  getBaselineRouterSystemPrompt,
  subscribeLlmTrace as subscribeBaselineRouterLlmTrace,
} from './llm/baselineRouter';
import {
  getPlannerSystemPrompt,
  subscribeLlmTrace as subscribePlannerLlmTrace,
} from './llm/llmPlanner';
import {
  deriveActiveConflicts,
  extractStructuredPreferences,
  getExtractorSystemPrompt,
  subscribeLlmTrace as subscribeExtractorLlmTrace,
  type ActiveConflictDerivationContext,
  type PreferenceExtractionContext,
} from './llm/llmExtractor';
import { materializeDeadEndsFromConflicts } from './core/cpMemory';
import {
  buildWorkflowSelectionState,
  toWorkflowStage,
  WORKFLOW_STAGE_ORDER,
} from './core/workflowState';
import { shouldResync } from './core/verifier';
import { isActionSafe } from './policies/safetyPolicy';
import { RelayClient } from './runtime/relayClient';
import { AgentMonitorServer } from './monitor/server';
import type {
  PlanDecision,
  PerceivedContext,
  RelayEnvelope,
  SnapshotStatePayload,
  StateUpdatedPayload,
  UserMessagePayload,
} from './types';

const relayUrl = process.env.AGENT_RELAY_URL || 'ws://localhost:3000/agent/ws';
const sessionId = process.env.AGENT_SESSION_ID || 'default';
const agentName = process.env.AGENT_NAME || 'tuning-agent';
const studyId = process.env.AGENT_STUDY_ID || 'pilot-01';
const participantId = process.env.AGENT_PARTICIPANT_ID || 'P01';
const studyMode = process.env.AGENT_STUDY_MODE || 'basic-tuning';
const monitorPort = Number(process.env.AGENT_MONITOR_PORT || 3500);
const monitorWebPort = Number(process.env.AGENT_MONITOR_WEB_PORT || 3501);
const isProduction = process.env.NODE_ENV === 'production';
const isBaselineMode = studyMode === 'baseline';

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

const monitorEnabled = parseBooleanEnv(process.env.AGENT_MONITOR_ENABLED) ?? !isProduction;

const memory = new AgentMemory();
const relay = new RelayClient({ relayUrl, sessionId, agentName, requestTimeoutMs: 12000 });
const monitor = new AgentMonitorServer({
  enabled: monitorEnabled,
  port: monitorPort,
  relayUrl,
  sessionId,
  agentName,
  routingMode: isBaselineMode ? 'baseline' : 'planner',
  llmSystemPrompts: {
    planner: isBaselineMode ? getBaselineRouterSystemPrompt() : getPlannerSystemPrompt(),
    extractor: isBaselineMode ? 'Disabled in baseline mode.' : getExtractorSystemPrompt(),
  },
});

function extractSystemPromptFromTracePayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;

  const direct = typeof record.systemPrompt === 'string' && record.systemPrompt.trim()
    ? record.systemPrompt.trim()
    : null;
  if (direct) return direct;

  const body =
    record.body && typeof record.body === 'object' && !Array.isArray(record.body)
      ? (record.body as Record<string, unknown>)
      : null;
  const input = body && Array.isArray(body.input) ? body.input : [];
  if (input.length === 0) return null;
  const firstMessage =
    input[0] && typeof input[0] === 'object' && !Array.isArray(input[0])
      ? (input[0] as Record<string, unknown>)
      : null;
  const content =
    firstMessage && typeof firstMessage.content === 'string' && firstMessage.content.trim()
      ? firstMessage.content.trim()
      : null;
  return content;
}

const llmTraceHandler = (event: { component?: string; type: string; payload: unknown }) => {
  const component =
    typeof event.component === 'string' && event.component.trim() ? event.component.trim() : 'unknown';
  const systemPrompt = extractSystemPromptFromTracePayload(event.payload);
  if (event.type === 'request' && systemPrompt && (component === 'planner' || component === 'extractor')) {
    monitor.updateLlmSystemPrompt(component, systemPrompt);
  }
  monitor.pushEvent(`llm.${component}.${event.type}`, event.payload);
};
const unsubscribePlannerLlmTrace = isBaselineMode
  ? subscribeBaselineRouterLlmTrace(llmTraceHandler)
  : subscribePlannerLlmTrace(llmTraceHandler);
const unsubscribeExtractorLlmTrace = isBaselineMode
  ? () => {}
  : subscribeExtractorLlmTrace(llmTraceHandler);

function unsubscribeAllLlmTraces(): void {
  unsubscribePlannerLlmTrace();
  unsubscribeExtractorLlmTrace();
}

let actionInFlight = false;
let lastActionFingerprint = '';
let lastActionAt = 0;
let ensureSessionReadyInFlight: Promise<void> | null = null;
let sessionReady = false;
let hostConnectionAvailable = false;
let connectedOnce = false;
let planningInFlight = false;
let deferredReplanRequested = false;
let deferredReplanTrigger: string | null = null;
let userTurnAwaitingStateUpdate = false;
let userPreferenceExtractionInFlight: Promise<void> | null = null;
let userConversationStarted = false;
let fatalErrorMessage: string | null = null;
let perceptionVersion = 0;
let lastUiFingerprint: string | null = null;
let isFirstSnapshotSeen = false;
type AgentStatusPhase = 'idle' | 'planning' | 'executing';
let currentAgentStatusPhase: AgentStatusPhase = 'idle';

interface PerceptionWaiter {
  afterVersion: number;
  resolve: () => void;
  reject: (error: Error) => void;
}

const perceptionWaiters = new Set<PerceptionWaiter>();

const RETRY_DELAY_MS = 1200;
const DEFAULT_CP_MEMORY_LIMIT = Math.max(
  0,
  Number.parseInt(process.env.AGENT_DEFAULT_CP_MEMORY_LIMIT || '10', 10) || 10
);
const EXTRACTION_STAGE_ORDER = WORKFLOW_STAGE_ORDER;
const EXTRACTION_HISTORY_WINDOW = 10;
const EXTRACTION_VISIBLE_ITEMS_LIMIT = 6;

function getMonitorApiPort(): number {
  if (!monitor.isEnabled()) return monitorPort;
  return monitor.getListeningPort() ?? monitorPort;
}

function sendAgentStatus(
  phase: AgentStatusPhase,
  options: {
    stage?: string | null;
    trigger?: string;
  } = {}
): void {
  const stage =
    typeof options.stage === 'string' && options.stage.trim() ? options.stage.trim() : undefined;
  const trigger =
    typeof options.trigger === 'string' && options.trigger.trim()
      ? options.trigger.trim()
      : undefined;

  if (
    currentAgentStatusPhase === phase &&
    stage === undefined &&
    trigger === undefined
  ) {
    return;
  }

  currentAgentStatusPhase = phase;

  try {
    relay.send('agent.status', {
      agentName,
      phase,
      ...(stage ? { stage } : {}),
      ...(trigger ? { trigger } : {}),
    });
  } catch {
    // Host disconnections should not fail the planner loop.
  }
}

function syncMonitorMemoryState(): void {
  monitor.updateMemory(
    memory.getPreferences(),
    memory.getActiveConflicts(),
    memory.getDeadEnds()
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function compactExtractionVisibleItems(
  value: unknown
): Array<{ id: string; value: string; isDisabled?: true }> {
  if (!Array.isArray(value)) return [];

  const compacted: Array<{ id: string; value: string; isDisabled?: true }> = [];
  for (const rawItem of value) {
    const item = asRecord(rawItem);
    if (!item) continue;
    const id = readNonEmptyString(item.id);
    const itemValue = readNonEmptyString(item.value);
    if (!id || !itemValue) continue;
    if (item.isDisabled === true) {
      compacted.push({ id, value: itemValue, isDisabled: true });
    } else {
      compacted.push({ id, value: itemValue });
    }
    if (compacted.length >= EXTRACTION_VISIBLE_ITEMS_LIMIT) break;
  }

  return compacted;
}

function compactExtractionSystemSpec(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;

  const summary: Record<string, unknown> = {};
  const stage = readNonEmptyString(record.stage);
  if (stage) summary.stage = stage;

  const state = asRecord(record.state);
  const selected = state ? asRecord(state.selected) : null;
  const selectedId = selected ? readNonEmptyString(selected.id) : null;
  const selectedValue = selected ? readNonEmptyString(selected.value) : null;
  if (selectedId && selectedValue) {
    summary.selected = { id: selectedId, value: selectedValue };
  }

  const selectedList =
    state && Array.isArray(state.selectedList) ? state.selectedList : [];
  if (selectedList.length > 0) {
    summary.selectedListCount = selectedList.length;
  }

  const visibleItems = compactExtractionVisibleItems(record.visibleItems);
  if (visibleItems.length > 0) {
    summary.visibleItems = visibleItems;
  }
  if (Array.isArray(record.visibleItems) && record.visibleItems.length > visibleItems.length) {
    summary.visibleItemCount = record.visibleItems.length;
  }

  const modification = asRecord(record.modification);
  if (modification && Object.keys(modification).length > 0) {
    summary.modification = modification;
  }

  return Object.keys(summary).length > 0 ? summary : null;
}

function compactExtractionHistoryEntry(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;

  const type = readNonEmptyString(record.type);
  if (type !== 'system' && type !== 'user' && type !== 'agent') return null;

  const compacted: Record<string, unknown> = { type };
  const stage = readNonEmptyString(record.stage);
  if (stage) compacted.stage = stage;

  if (type === 'user') {
    const action = readNonEmptyString(record.action);
    const label = readNonEmptyString(record.label);
    if (action) compacted.action = action;
    if (label) compacted.label = label;
    return action || label ? compacted : null;
  }

  if (type === 'agent') {
    const text = readNonEmptyString(record.text);
    if (!text) return null;
    compacted.text = text;
    return compacted;
  }

  const spec = compactExtractionSystemSpec(record.spec);
  if (!spec) return stage ? compacted : null;
  compacted.spec = spec;
  return compacted;
}

function buildExtractionRecentHistory(context: PerceivedContext): unknown[] {
  return context.messageHistoryTail
    .slice(-EXTRACTION_HISTORY_WINDOW)
    .map((entry) => compactExtractionHistoryEntry(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

function buildExtractionUiFlow(context: PerceivedContext): Record<string, unknown> {
  const currentStage = context.stage ?? '';
  const stageIndex = EXTRACTION_STAGE_ORDER.indexOf(currentStage as (typeof EXTRACTION_STAGE_ORDER)[number]);
  const previousStage = stageIndex > 0 ? EXTRACTION_STAGE_ORDER[stageIndex - 1] : null;
  const nextStage =
    stageIndex >= 0 && stageIndex < EXTRACTION_STAGE_ORDER.length - 1
      ? EXTRACTION_STAGE_ORDER[stageIndex + 1]
      : null;

  const uiSpecRecord = asRecord(context.uiSpec);
  const state = asRecord(uiSpecRecord.state);
  const booking = asRecord(state.booking);
  const bookingSummary: Record<string, unknown> = {};

  const movie = asRecord(booking.movie);
  const movieId = readNonEmptyString(movie.id);
  const movieTitle = readNonEmptyString(movie.title);
  if (movieId || movieTitle) {
    bookingSummary.movie = {
      ...(movieId ? { id: movieId } : {}),
      ...(movieTitle ? { title: movieTitle } : {}),
    };
  }

  const theater = asRecord(booking.theater);
  const theaterId = readNonEmptyString(theater.id);
  const theaterName = readNonEmptyString(theater.name);
  if (theaterId || theaterName) {
    bookingSummary.theater = {
      ...(theaterId ? { id: theaterId } : {}),
      ...(theaterName ? { name: theaterName } : {}),
    };
  }

  const date = readNonEmptyString(booking.date);
  if (date) bookingSummary.date = date;

  const showing = asRecord(booking.showing);
  const showingId = readNonEmptyString(showing.id);
  const showingTime = readNonEmptyString(showing.time);
  if (showingId || showingTime) {
    bookingSummary.showing = {
      ...(showingId ? { id: showingId } : {}),
      ...(showingTime ? { time: showingTime } : {}),
    };
  }

  const selectedSeats = Array.isArray(booking.selectedSeats) ? booking.selectedSeats : [];
  if (selectedSeats.length > 0) {
    bookingSummary.selectedSeatsCount = selectedSeats.length;
  }

  return {
    stageOrder: EXTRACTION_STAGE_ORDER,
    currentStage,
    previousStage,
    nextStage,
    ...(Object.keys(bookingSummary).length > 0 ? { booking: bookingSummary } : {}),
  };
}

function resolvePlannerCpMemoryLimit(payload: Record<string, unknown>, fallback: number): number {
  const rawLimit = payload.plannerCpMemoryLimit;
  if (typeof rawLimit === 'number' && Number.isFinite(rawLimit)) {
    return Math.max(0, Math.floor(rawLimit));
  }
  const parsed = Number.parseInt(String(rawLimit ?? ''), 10);
  if (Number.isFinite(parsed)) {
    return Math.max(0, parsed);
  }
  const legacyToggle = payload.plannerCpEnabled;
  if (typeof legacyToggle === 'boolean') {
    return legacyToggle ? fallback : 0;
  }
  return fallback;
}

function toSnapshotPayload(value: unknown): SnapshotStatePayload {
  const payload = asRecord(value);
  return {
    sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : '',
    uiSpec: payload.uiSpec ?? null,
    messageHistory: Array.isArray(payload.messageHistory) ? payload.messageHistory : [],
    toolSchema: Array.isArray(payload.toolSchema) ? payload.toolSchema : [],
    plannerCpMemoryLimit: resolvePlannerCpMemoryLimit(payload, DEFAULT_CP_MEMORY_LIMIT),
    plannerCpEnabled:
      typeof payload.plannerCpEnabled === 'boolean' ? payload.plannerCpEnabled : undefined,
    guiAdaptationEnabled:
      typeof payload.guiAdaptationEnabled === 'boolean' ? payload.guiAdaptationEnabled : undefined,
  };
}

function toStateUpdatedPayload(value: unknown): StateUpdatedPayload {
  const payload = asRecord(value);
  return {
    source: typeof payload.source === 'string' ? payload.source : undefined,
    uiSpec: payload.uiSpec ?? null,
    messageHistory: Array.isArray(payload.messageHistory) ? payload.messageHistory : [],
    toolSchema: Array.isArray(payload.toolSchema) ? payload.toolSchema : [],
    plannerCpMemoryLimit: resolvePlannerCpMemoryLimit(payload, DEFAULT_CP_MEMORY_LIMIT),
    plannerCpEnabled:
      typeof payload.plannerCpEnabled === 'boolean' ? payload.plannerCpEnabled : undefined,
    guiAdaptationEnabled:
      typeof payload.guiAdaptationEnabled === 'boolean' ? payload.guiAdaptationEnabled : undefined,
  };
}

function toUserMessagePayload(value: unknown): UserMessagePayload {
  const payload = asRecord(value);
  return {
    text: typeof payload.text === 'string' ? payload.text : '',
    stage: typeof payload.stage === 'string' ? payload.stage : undefined,
  };
}

function pickStageFromUiSpec(uiSpec: unknown): string | null {
  const record = asRecord(uiSpec);
  const stage = record.currentStage ?? record.stage;
  return typeof stage === 'string' ? stage : null;
}

function applyImmediateUiSpec(context: PerceivedContext, uiSpec: unknown): PerceivedContext {
  const nextStage = pickStageFromUiSpec(uiSpec) ?? context.stage;
  return {
    ...context,
    stage: nextStage,
    uiSpec: uiSpec ?? null,
    lastUpdatedAt: new Date().toISOString(),
  };
}

function buildUiFingerprint(uiSpec: unknown): string {
  if (uiSpec === null || uiSpec === undefined) return 'null';
  try {
    return JSON.stringify(uiSpec);
  } catch {
    return JSON.stringify({ stage: pickStageFromUiSpec(uiSpec) ?? null });
  }
}

function sanitizeExtractionUiSpec(uiSpec: unknown): unknown {
  if (uiSpec === null || uiSpec === undefined || Array.isArray(uiSpec) || typeof uiSpec !== 'object') {
    return uiSpec ?? null;
  }

  const spec = uiSpec as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(spec, 'state')) {
    return spec;
  }

  const nextSpec: Record<string, unknown> = { ...spec };
  delete nextSpec.state;
  return nextSpec;
}

function buildExtractionViewContext(
  context: PerceivedContext
): Pick<PreferenceExtractionContext, 'currentStage' | 'state' | 'uiSpec' | 'recentHistory'> {
  const currentStage = toWorkflowStage(context.stage ?? null);
  const state = currentStage
    ? buildWorkflowSelectionState({
        currentStage,
        messageHistory: context.messageHistoryTail,
        uiSpec: context.uiSpec,
      })
    : null;

  return {
    currentStage: context.stage ?? '',
    uiSpec: sanitizeExtractionUiSpec(context.uiSpec),
    state,
    recentHistory: buildExtractionRecentHistory(context),
  };
}

async function runPreferenceExtractionFromUserMessage(
  context: PerceivedContext,
  userMessageText: string
): Promise<void> {
  const userMessage = userMessageText.trim();
  if (!userMessage) return;

  const extractionView = buildExtractionViewContext(context);
  const existingPreferences = memory.getPreferences();
  const uiFingerprint = buildUiFingerprint(context.uiSpec);

  const extractionCtx: PreferenceExtractionContext = {
    userMessage,
    ...extractionView,
    existingPreferences,
  };

  try {
    const updatedPreferences = await extractStructuredPreferences(extractionCtx);
    memory.setPreferences(updatedPreferences);
    const activeConflictCtx: ActiveConflictDerivationContext = {
      currentStage: extractionView.currentStage,
      state: extractionView.state,
      uiSpec: extractionView.uiSpec,
      preferences: updatedPreferences,
    };
    const updatedActiveConflicts = await deriveActiveConflicts(activeConflictCtx);
    memory.setActiveConflicts(updatedActiveConflicts);
    syncMonitorMemoryState();
    monitor.pushEvent('extraction.completed', {
      trigger: 'user.message',
      mode: 'preferences+active-conflicts',
      uiFingerprint,
      updatedPreferences,
      updatedActiveConflicts,
      preferences: memory.getPreferences(),
      activeConflicts: memory.getActiveConflicts(),
      deadEnds: memory.getDeadEnds(),
    });
  } catch (extractionError) {
    monitor.pushEvent('extraction.failed', {
      trigger: 'user.message',
      mode: 'preferences+active-conflicts',
      uiFingerprint,
      message: extractionError instanceof Error ? extractionError.message : String(extractionError),
    });
  }
}

async function runActiveConflictDerivationFromUiChange(
  context: PerceivedContext,
  trigger: string,
  uiFingerprint: string,
  uiFingerprintChanged: boolean
): Promise<void> {
  const extractionView = buildExtractionViewContext(context);
  const preferences = memory.getPreferences();

  const extractionCtx: ActiveConflictDerivationContext = {
    currentStage: extractionView.currentStage,
    state: extractionView.state,
    uiSpec: extractionView.uiSpec,
    preferences,
  };

  try {
    const updatedActiveConflicts = await deriveActiveConflicts(extractionCtx);
    memory.setActiveConflicts(updatedActiveConflicts);
    syncMonitorMemoryState();
    monitor.pushEvent('extraction.completed', {
      trigger,
      mode: 'active-conflicts',
      uiFingerprint,
      uiFingerprintChanged,
      updatedPreferences: preferences,
      updatedActiveConflicts,
      preferences: memory.getPreferences(),
      activeConflicts: memory.getActiveConflicts(),
      deadEnds: memory.getDeadEnds(),
    });
  } catch (extractionError) {
    monitor.pushEvent('extraction.failed', {
      trigger,
      mode: 'active-conflicts',
      uiFingerprint,
      uiFingerprintChanged,
      message: extractionError instanceof Error ? extractionError.message : String(extractionError),
    });
  }
}

function hasInputUserMessage(history: unknown[]): boolean {
  return history.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const record = entry as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : '';
    const action = typeof record.action === 'string' ? record.action : '';
    const label = typeof record.label === 'string' ? record.label : '';
    return type === 'user' && action === 'input' && label.trim().length > 0;
  });
}

function syncUserConversationStarted(context: PerceivedContext): void {
  if (userConversationStarted) return;
  if (context.lastUserMessage?.text?.trim()) {
    userConversationStarted = true;
    return;
  }
  if (hasInputUserMessage(context.messageHistoryTail)) {
    userConversationStarted = true;
  }
}

function getToolName(action: import('./types').PlannedAction): string {
  if (action.type !== 'tool.call') return action.type;
  return typeof action.payload.toolName === 'string' ? action.payload.toolName : 'tool.call';
}

function requestDeferredReplan(trigger: string): void {
  deferredReplanRequested = true;
  deferredReplanTrigger = trigger;
  monitor.updateState({ pendingUserMessages: 1 });
  monitor.pushEvent('planner.deferred_replan', { trigger });
}

function markPerceptionUpdated(): void {
  perceptionVersion += 1;
  for (const waiter of Array.from(perceptionWaiters)) {
    if (perceptionVersion > waiter.afterVersion) {
      perceptionWaiters.delete(waiter);
      waiter.resolve();
    }
  }
}

function waitForPerceptionAdvance(afterVersion: number): Promise<void> {
  if (perceptionVersion > afterVersion) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const waiter: PerceptionWaiter = { afterVersion, resolve, reject };
    perceptionWaiters.add(waiter);
  });
}

function rejectPerceptionWaiters(message: string): void {
  const error = new Error(message);
  for (const waiter of Array.from(perceptionWaiters)) {
    perceptionWaiters.delete(waiter);
    waiter.reject(error);
  }
}

function enterFatalState(reason: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  fatalErrorMessage = `${reason}: ${message}`;
  monitor.updateState({
    phase: 'error',
    actionInFlight: false,
    pendingUserMessages: 0,
  });
  monitor.pushEvent('runtime.fatal', {
    reason,
    message,
  });
  console.error(`[tuning-agent] fatal ${reason}: ${message}`);
}

function isControlFlowCancellation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message === 'session-reset' || message === 'terminated-by-signal';
}

function buildAgentMessageAction(text: string): import('./types').PlannedAction {
  return {
    type: 'agent.message',
    reason: 'Provide a concise assistant response to the user.',
    payload: {
      text,
    },
  };
}

async function maybeSendAssistantMessage(context: PerceivedContext, text: string): Promise<void> {
  if (isBaselineMode) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  const action = buildAgentMessageAction(trimmed);
  if (!isActionSafe(context, action)) return;
  const outcome = await executePlannedAction(relay, action);
  monitor.pushEvent('assistant_message.outcome', { text: trimmed, outcome });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSessionNotActiveError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('SESSION_NOT_ACTIVE');
}

async function ensureRelayConnected(): Promise<void> {
  monitor.updateState({ phase: 'connecting-relay', relayConnected: false });
  while (true) {
    try {
      await relay.connect();
      monitor.updateState({ relayConnected: true, phase: 'relay-connected' });
      monitor.pushEvent('relay.connected', { relayUrl, sessionId });
      return;
    } catch (error) {
      monitor.pushEvent('relay.connect_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      console.warn(
        `[tuning-agent] relay connect failed, retrying in ${RETRY_DELAY_MS}ms: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      await sleep(RETRY_DELAY_MS);
    }
  }
}

async function ensureSessionReady(reason: string): Promise<void> {
  if (ensureSessionReadyInFlight) {
    await ensureSessionReadyInFlight;
    return;
  }

  ensureSessionReadyInFlight = (async () => {
    while (true) {
      await ensureRelayConnected();

      try {
        monitor.updateState({ phase: 'starting-session', waitingForHost: false });
        await relay.request('session.start', { studyId, participantId });
        await relay.request('snapshot.get', {});
        sessionReady = true;
        monitor.updateState({
          waitingForHost: false,
          sessionReady: true,
          phase: 'ready',
        });
        monitor.pushEvent('session.ready', { reason });

        if (!connectedOnce) {
          connectedOnce = true;
          console.log(`[tuning-agent] connected to ${relayUrl} (sessionId=${sessionId})`);
          if (monitor.isEnabled()) {
            const activeMonitorPort = getMonitorApiPort();
            console.log(
              `[tuning-agent] monitor API available at http://localhost:${activeMonitorPort}`
            );
            console.log(`[tuning-agent] monitor UI available at http://localhost:${monitorWebPort}`);
          } else {
            console.log('[tuning-agent] monitor disabled');
          }
        }
        return;
      } catch (error) {
        if (isSessionNotActiveError(error)) {
          sessionReady = false;
          hostConnectionAvailable = false;
          monitor.updateState({
            waitingForHost: true,
            sessionReady: false,
            phase: 'waiting-host',
          });
          monitor.pushEvent('session.waiting_host', { reason });
          console.log(
            `[tuning-agent] waiting for host connection (${reason}); retrying in ${RETRY_DELAY_MS}ms`
          );
          await sleep(RETRY_DELAY_MS);
          continue;
        }

        console.warn(
          `[tuning-agent] session bootstrap failed, retrying in ${RETRY_DELAY_MS}ms: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        monitor.pushEvent('session.bootstrap_failed', {
          message: error instanceof Error ? error.message : String(error),
        });
        await sleep(RETRY_DELAY_MS);
      }
    }
  })();

  try {
    await ensureSessionReadyInFlight;
  } finally {
    ensureSessionReadyInFlight = null;
  }
}

async function maybePlanAndExecute(trigger: string): Promise<void> {
  if (fatalErrorMessage) {
    monitor.pushEvent('planner.blocked_fatal', {
      trigger,
      fatalError: fatalErrorMessage,
    });
    return;
  }

  if (actionInFlight || planningInFlight) {
    if (trigger === 'state.updated') {
      monitor.pushEvent('planner.skip_replan_while_busy', { trigger });
      return;
    }
    requestDeferredReplan(trigger);
    return;
  }

  const context = memory.getContext();
  if (!context) return;
  const isBaselineUserTrigger =
    trigger === 'state.updated:user-message' || trigger === 'deferred:state.updated:user-message';
  if (isBaselineMode && !isBaselineUserTrigger) {
    monitor.pushEvent('planner.ignored_trigger_baseline', {
      trigger,
      stage: context.stage,
    });
    return;
  }
  if (!userConversationStarted && trigger !== 'state.updated:user-message') {
    monitor.pushEvent('planner.blocked_until_user_message', {
      trigger,
      stage: context.stage,
    });
    return;
  }

  planningInFlight = true;
  monitor.updateContext(context);
  monitor.updateState({ pendingUserMessages: deferredReplanRequested ? 1 : 0 });
  sendAgentStatus('planning', { stage: context.stage, trigger });

  try {
    const planningContext = memory.getContext() ?? context;
    const decision: PlanDecision = isBaselineMode
      ? await planBaselineAction(planningContext)
      : await planNextAction(planningContext, memory);
    const action = decision.action;
    const decisionExplainText = decision.explainText ?? '';

    if (!action) {
      if (decisionExplainText.trim()) {
        await maybeSendAssistantMessage(planningContext, decisionExplainText);
      }
      monitor.pushEvent('planner.no_action', {
        source: decision.source,
        explainText: decision.explainText ?? null,
        fallbackReason: decision.fallbackReason ?? null,
      });
      return;
    }

    monitor.setLastPlan(action, trigger);
    monitor.pushEvent('planner.decision', {
      source: decision.source,
      explainText: decision.explainText ?? null,
      fallbackReason: decision.fallbackReason ?? null,
      action,
    });

    const actionFingerprint = JSON.stringify({
      stage: planningContext.stage,
      type: action.type,
      payload: action.payload,
    });
    const now = Date.now();
    if (!isBaselineMode && actionFingerprint === lastActionFingerprint && now - lastActionAt < 700) {
      return;
    }

    if (!isActionSafe(planningContext, action)) {
      memory.addRecord({
        timestamp: new Date().toISOString(),
        stage: planningContext.stage,
        actionType: action.type,
        ok: false,
        code: 'SAFETY_BLOCKED',
        reason: action.reason,
      });
      monitor.pushEvent('action.blocked', { trigger, action });
      console.warn(`[tuning-agent] action blocked by safety policy (${trigger})`);
      return;
    }

    actionInFlight = true;
    monitor.updateState({ actionInFlight: true, phase: 'executing-action' });
    sendAgentStatus('executing', { stage: planningContext.stage, trigger });
    lastActionFingerprint = actionFingerprint;
    lastActionAt = now;

    if (!isBaselineMode && action.type !== 'agent.message') {
      await maybeSendAssistantMessage(
        planningContext,
        decisionExplainText || `I will run ${getToolName(action)} next. Reason: ${action.reason}`
      );
    }

    const outcome = await executePlannedAction(relay, action);
    if (outcome.uiSpec !== undefined) {
      const current = memory.getContext();
      if (current) {
        const next = applyImmediateUiSpec(current, outcome.uiSpec);
        upsertContext(next);
        monitor.updateContext(next);
      }
    }
    monitor.setLastOutcome(outcome);
    monitor.pushEvent('action.outcome', { action, outcome });

    if (!outcome.ok && outcome.code === 'SESSION_NOT_ACTIVE') {
      sessionReady = false;
      hostConnectionAvailable = false;
      monitor.updateState({ sessionReady: false, waitingForHost: true, phase: 'waiting-host' });
      await maybeSendAssistantMessage(
        planningContext,
        'The host connection is not ready yet. I will retry once the host is available.'
      );
      await ensureSessionReady('runtime-action');
      if (isBaselineMode) {
        await maybePlanAndExecute('state.updated:user-message');
        return;
      }
      requestDeferredReplan('runtime-action');
      return;
    }

    memory.addRecord({
      timestamp: new Date().toISOString(),
      stage: planningContext.stage,
      actionType: action.type,
      ok: outcome.ok,
      code: outcome.code,
      reason: action.reason,
    });

    const toolName =
      action.type === 'tool.call' && typeof action.payload.toolName === 'string'
        ? action.payload.toolName
        : '';

    if (
      outcome.ok &&
      action.type === 'tool.call' &&
      (toolName === 'prev' || toolName === 'startOver')
    ) {
      const blockingConflicts = memory.getBlockingActiveConflicts();
      if (blockingConflicts.length > 0) {
        const timestamp = new Date().toISOString();
        const deadEnds = materializeDeadEndsFromConflicts(blockingConflicts, timestamp);
        memory.upsertDeadEnds(deadEnds);
        syncMonitorMemoryState();
        monitor.pushEvent('memory.dead_ends_updated', {
          trigger,
          toolName,
          deadEnds: memory.getDeadEnds(),
        });
      }
    }

    if (!outcome.ok) {
      await maybeSendAssistantMessage(
        planningContext,
        `The action failed (${outcome.code ?? 'UNKNOWN'}). ${outcome.message ?? 'Please try again.'}`
      );
    }
    const shouldResyncAfterSuccess =
      outcome.ok && action.type === 'tool.call' && toolName !== 'next' && toolName !== 'prev';
    const shouldResyncNow = shouldResync(action, outcome) || shouldResyncAfterSuccess;
    if (shouldResyncNow) {
      monitor.pushEvent('state.resync_requested', {
        reason: outcome.ok ? 'post-action' : 'error',
        code: outcome.code,
      });
      await relay.request('snapshot.get', {});
    }

    if (action.type === 'session.end' && outcome.ok) {
      monitor.updateState({ phase: 'ended' });
      relay.close();
      monitor.close();
      process.exit(0);
    }
  } catch (error) {
    monitor.pushEvent('action.exception', {
      message: error instanceof Error ? error.message : String(error),
    });
    if (isControlFlowCancellation(error)) {
      monitor.pushEvent('planner.cancelled', {
        reason: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    if (!fatalErrorMessage) {
      enterFatalState('plan-or-action-cycle', error);
    }
  } finally {
    actionInFlight = false;
    planningInFlight = false;
    monitor.updateState({ actionInFlight: false, phase: 'ready' });
    if (fatalErrorMessage) {
      sendAgentStatus('idle', {
        stage: (memory.getContext() ?? context)?.stage ?? null,
        trigger,
      });
      deferredReplanRequested = false;
      deferredReplanTrigger = null;
      monitor.updateState({ pendingUserMessages: 0, phase: 'error' });
      return;
    }
    if (deferredReplanRequested) {
      const deferredTrigger = deferredReplanTrigger ?? trigger;
      deferredReplanRequested = false;
      deferredReplanTrigger = null;
      monitor.updateState({ pendingUserMessages: 0 });
      queueMicrotask(() => {
        void maybePlanAndExecute(`deferred:${deferredTrigger}`);
      });
      return;
    }
    sendAgentStatus('idle', {
      stage: (memory.getContext() ?? context)?.stage ?? null,
      trigger,
    });
  }
}

function upsertContext(next: PerceivedContext): void {
  memory.setContext(next);
}

function resetRuntimeState(): void {
  rejectPerceptionWaiters('session-reset');
  memory.reset();
  syncMonitorMemoryState();
  actionInFlight = false;
  planningInFlight = false;
  currentAgentStatusPhase = 'idle';
  sendAgentStatus('idle', { trigger: 'session-reset' });
  deferredReplanRequested = false;
  deferredReplanTrigger = null;
  userTurnAwaitingStateUpdate = false;
  userPreferenceExtractionInFlight = null;
  userConversationStarted = false;
  fatalErrorMessage = null;
  perceptionVersion = 0;
  lastUiFingerprint = null;
  isFirstSnapshotSeen = false;
  lastActionFingerprint = '';
  lastActionAt = 0;
  monitor.updateState({
    phase: 'ready',
    actionInFlight: false,
    contextStage: null,
    lastUserMessage: null,
    lastTrigger: null,
    lastPlan: null,
    lastOutcome: null,
    pendingUserMessages: 0,
  });
}

async function handleInbound(envelope: RelayEnvelope): Promise<void> {
  monitor.pushEvent('relay.inbound', {
    type: envelope.type,
    replyTo: envelope.replyTo,
  });

  switch (envelope.type) {
    case 'relay.presence': {
      const payload = asRecord(envelope.payload);
      const hostActive = payload.hostActive === true;
      hostConnectionAvailable = hostActive;
      monitor.pushEvent('session.presence', {
        hostActive,
        agentCount: typeof payload.agentCount === 'number' ? payload.agentCount : null,
      });
      if (!sessionReady && hostActive) {
        monitor.updateState({ waitingForHost: false, phase: 'starting-session' });
        void ensureSessionReady('host-presence').catch((error) => {
          monitor.pushEvent('session.presence_start_failed', {
            message: error instanceof Error ? error.message : String(error),
          });
        });
      }
      return;
    }
    case 'snapshot.state': {
      const previous = memory.getContext();
      const snapshot = toSnapshotPayload(envelope.payload);
      const next = fromSnapshot(snapshot);
      if (previous?.lastUserMessage) {
        next.lastUserMessage = previous.lastUserMessage;
      }
      upsertContext(next);
      lastUiFingerprint = buildUiFingerprint(next.uiSpec);
      isFirstSnapshotSeen = true;
      syncUserConversationStarted(next);
      markPerceptionUpdated();
      monitor.updateContext(memory.getContext());
      if (!isBaselineMode) {
        await maybePlanAndExecute('snapshot.state');
      } else {
        monitor.pushEvent('planner.ignored_snapshot_baseline', {
          stage: next.stage,
        });
      }
      return;
    }
    case 'state.updated': {
      const current = memory.getContext();
      if (!current) return;
      const next = applyStateUpdated(current, toStateUpdatedPayload(envelope.payload));
      const stageChanged = next.stage !== current.stage;
      const nextUiFingerprint = buildUiFingerprint(next.uiSpec);
      const uiFingerprintChanged =
        lastUiFingerprint === null ? true : lastUiFingerprint !== nextUiFingerprint;
      lastUiFingerprint = nextUiFingerprint;
      upsertContext(next);
      syncUserConversationStarted(next);
      markPerceptionUpdated();
      monitor.updateContext(memory.getContext());

      if (!isBaselineMode && isFirstSnapshotSeen && uiFingerprintChanged) {
        await runActiveConflictDerivationFromUiChange(
          next,
          'state.updated:ui-changed',
          nextUiFingerprint,
          uiFingerprintChanged
        );
      }

      if (userTurnAwaitingStateUpdate) {
        userTurnAwaitingStateUpdate = false;
        if (!isBaselineMode && userPreferenceExtractionInFlight) {
          monitor.pushEvent('planner.waiting_preference_extraction', {
            trigger: 'state.updated:user-message',
          });
          await userPreferenceExtractionInFlight;
        }
        await maybePlanAndExecute('state.updated:user-message');
        return;
      }

      if (isBaselineMode) {
        monitor.pushEvent('planner.ignored_state_updated_baseline', {
          stage: next.stage,
          reason: 'non-user state update',
        });
        return;
      }

      if (stageChanged) {
        await maybePlanAndExecute('state.updated:stage-change');
        return;
      }

      monitor.pushEvent('planner.ignored_state_updated', {
        stage: next.stage,
        reason: 'no-user-turn-and-no-stage-change',
      });
      return;
    }
    case 'user.message': {
      const current = memory.getContext();
      if (!current) return;
      const userMessage = toUserMessagePayload(envelope.payload);
      if (!userMessage.text.trim()) return;
      userConversationStarted = true;
      const next = applyUserMessage(current, userMessage);
      upsertContext(next);
      monitor.updateContext(memory.getContext());
      monitor.updateState({ pendingUserMessages: 0 });
      // Set this before async extraction so fast state.updated events cannot bypass planning.
      // Planning still waits for state.updated to keep timeline-consistent history.
      userTurnAwaitingStateUpdate = true;
      monitor.pushEvent('planner.waiting_state_updated_after_user_message', {
        stage: userMessage.stage ?? null,
      });
      if (isBaselineMode) {
        return;
      }
      const extractionPromise = runPreferenceExtractionFromUserMessage(next, userMessage.text);
      userPreferenceExtractionInFlight = extractionPromise.finally(() => {
        if (userPreferenceExtractionInFlight === extractionPromise) {
          userPreferenceExtractionInFlight = null;
        }
      });
      await userPreferenceExtractionInFlight;
      return;
    }
    case 'session.reset': {
      resetRuntimeState();
      monitor.pushEvent('session.reset', {
        source: 'host',
        payload: envelope.payload ?? null,
      });
      try {
        await relay.request('snapshot.get', {});
      } catch (error) {
        monitor.pushEvent('session.reset_snapshot_failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    case 'session.ended': {
      monitor.updateState({ phase: 'ended' });
      relay.close();
      monitor.close();
      process.exit(0);
    }
    default:
      return;
  }
}

async function main(): Promise<void> {
  await monitor.start();
  monitor.updateState({ phase: 'monitor-ready' });
  syncMonitorMemoryState();
  const activeMonitorPort = getMonitorApiPort();
  monitor.pushEvent('runtime.start', {
    relayUrl,
    sessionId,
    studyMode,
    routingMode: isBaselineMode ? 'baseline' : 'planner',
    monitorEnabled: monitor.isEnabled(),
    monitorPort: activeMonitorPort,
  });

  relay.messages.subscribe(handleInbound);
  await ensureRelayConnected();
  monitor.updateState({
    waitingForHost: !hostConnectionAvailable,
    sessionReady: false,
    phase: hostConnectionAvailable ? 'starting-session' : 'idle-waiting-host',
  });
  if (hostConnectionAvailable) {
    await ensureSessionReady('startup');
  }
}

process.on('SIGINT', () => {
  monitor.pushEvent('runtime.signal', { signal: 'SIGINT' });
  rejectPerceptionWaiters('terminated-by-signal');
  unsubscribeAllLlmTraces();

  relay.close();
  monitor.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  monitor.pushEvent('runtime.signal', { signal: 'SIGTERM' });
  rejectPerceptionWaiters('terminated-by-signal');
  unsubscribeAllLlmTraces();

  relay.close();
  monitor.close();
  process.exit(0);
});

void main().catch((error) => {
  monitor.pushEvent('runtime.fatal', {
    message: error instanceof Error ? error.message : String(error),
  });
  unsubscribeAllLlmTraces();
  monitor.close();
  console.error(`[tuning-agent] fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
