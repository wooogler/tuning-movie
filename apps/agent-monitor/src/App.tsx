import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';

type MonitorEvent = {
  index: number;
  timestamp: string;
  type: string;
  payload: unknown;
  traceMeta?: Record<string, unknown>;
};

type Preference = {
  id: string;
  description: string;
  strength: 'hard' | 'soft';
};

type ConflictScope = {
  stage: string;
  movie?: string;
  theater?: string;
  date?: string;
  showing?: string;
};

type DeadEnd = {
  id: string;
  preferenceIds: string[];
  scope: ConflictScope;
  reason: string;
  createdAt: string;
  lastSeenAt: string;
  count: number;
};

type MonitorState = {
  startedAt: string;
  agentName?: string;
  relayUrl: string;
  sessionId: string;
  routingMode?: 'planner' | 'baseline';
  phase: string;
  relayConnected: boolean;
  waitingForHost: boolean;
  sessionReady: boolean;
  actionInFlight: boolean;
  contextStage: string | null;
  lastUserMessage: string | null;
  lastTrigger: string | null;
  lastPlan: unknown;
  lastOutcome: unknown;
  memoryPreferences: Preference[];
  memoryDeadEnds: DeadEnd[];
  actionCount: number;
  pendingUserMessages: number;
  llmSystemPrompts?: {
    planner: string;
    extractor: string;
  };
};

type SnapshotPayload = {
  state: MonitorState;
  events: MonitorEvent[];
};

type StatePayload = {
  state: MonitorState;
};

type EventPayload = {
  event: MonitorEvent;
};

type LlmComponent = 'planner' | 'extractor' | 'unknown';
type LlmFilter = 'all' | 'planner' | 'extractor';
type LlmInteractionStatus = 'pending' | 'completed' | 'error';
type MonitorConnectionState = 'connecting' | 'live' | 'error' | 'imported';
type ImportedJsonlKind = 'llm-trace' | 'interaction-log';
type ExtractorBadge =
  | 'preferences'
  | 'preferences_conflicts'
  | 'constraints_conflicts';

type LlmInteraction = {
  id: number;
  timestamp: string;
  component: LlmComponent;
  requestId: string | null;
  request: unknown;
  raw: unknown;
  parsed: unknown;
  error: unknown;
  sourceEvents: MonitorEvent[];
};

type MonitorDataSource =
  | { mode: 'live' }
  | {
      mode: 'imported';
      fileName: string;
      importedAt: string;
      format: 'jsonl';
      kind: ImportedJsonlKind;
    };

type ParsedImportedMonitorFile = {
  source: Extract<MonitorDataSource, { mode: 'imported' }>;
  monitorState: MonitorState | null;
  events: MonitorEvent[];
  llmFilter: LlmFilter;
  showSystemPrompts: boolean;
  selectedInteractionId: number | null;
};

const API_BASE = import.meta.env.VITE_MONITOR_API_BASE || '/monitor-api';
const MAX_EVENTS = 500;
const RECONNECT_DELAY_MS = 1200;

function fmt(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function copyText(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    const json = JSON.stringify(value, null, 2);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

function shortTime(value: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString();
}

function createExportTimestamp(): string {
  return new Date().toISOString();
}

function formatExportTimestamp(value: string): string {
  return value.replaceAll(':', '-').replaceAll('.', '-');
}

function sanitizeFileToken(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function buildTraceExportFilename(
  state: MonitorState | null,
  filter: LlmFilter,
  exportedAt: string
): string {
  const sessionId = sanitizeFileToken(state?.sessionId, 'session');
  return `llm-trace-${sessionId}-${filter}-${formatExportTimestamp(exportedAt)}.jsonl`;
}

function buildInteractionExportFilename(
  state: MonitorState | null,
  item: LlmInteraction,
  exportedAt: string
): string {
  const sessionId = sanitizeFileToken(state?.sessionId, 'session');
  return `llm-trace-${sessionId}-${item.component}-${item.id}-${formatExportTimestamp(exportedAt)}.jsonl`;
}

function downloadTextFile(filename: string, value: string, contentType = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([value], {
    type: contentType,
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function uniqueSortedMonitorEvents(events: MonitorEvent[]): MonitorEvent[] {
  const seen = new Set<string>();
  const deduped: MonitorEvent[] = [];

  for (const event of events) {
    const key = `${event.index}|${event.timestamp}|${event.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(event);
  }

  return deduped.sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index;
    if (a.timestamp !== b.timestamp) return a.timestamp.localeCompare(b.timestamp);
    return a.type.localeCompare(b.type);
  });
}

function getOptionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function truncateText(value: string, maxLength = 140): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function parseImportedJsonlEvent(line: string, fallbackIndex: number): MonitorEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON on line ${fallbackIndex}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const record = asRecord(parsed);
  if (!record) {
    throw new Error(`Expected a JSON object on line ${fallbackIndex}.`);
  }

  const timestamp = getOptionalString(record, 'timestamp');
  const type = getOptionalString(record, 'type');
  if (!timestamp) {
    throw new Error(`Missing timestamp on line ${fallbackIndex}.`);
  }
  if (!type) {
    throw new Error(`Missing type on line ${fallbackIndex}.`);
  }
  if (!('payload' in record)) {
    throw new Error(`Missing payload on line ${fallbackIndex}.`);
  }

  const traceMeta = Object.fromEntries(
    Object.entries(record).filter(([key]) => !['index', 'timestamp', 'type', 'payload'].includes(key))
  );
  const index = typeof record.index === 'number' && Number.isFinite(record.index) ? record.index : fallbackIndex;

  return {
    index,
    timestamp,
    type,
    payload: record.payload,
    ...(Object.keys(traceMeta).length > 0 ? { traceMeta } : {}),
  };
}

function detectImportedJsonlKind(events: MonitorEvent[]): ImportedJsonlKind {
  return events.some((event) => event.type.startsWith('llm.')) ? 'llm-trace' : 'interaction-log';
}

function buildImportedMonitorState(events: MonitorEvent[], kind: ImportedJsonlKind): MonitorState | null {
  const firstEvent = events[0];
  const meta = asRecord(firstEvent?.traceMeta);
  if (!firstEvent) return null;

  return {
    startedAt: firstEvent.timestamp,
    agentName:
      getOptionalString(meta ?? {}, 'agentName') ??
      (kind === 'interaction-log' ? 'imported-interaction-log' : 'imported-jsonl-trace'),
    relayUrl: getOptionalString(meta ?? {}, 'relayUrl') ?? '',
    sessionId: getOptionalString(meta ?? {}, 'sessionId') ?? '',
    routingMode:
      getOptionalString(meta ?? {}, 'routingMode') === 'baseline'
        ? 'baseline'
        : getOptionalString(meta ?? {}, 'routingMode') === 'planner'
          ? 'planner'
          : undefined,
    phase: 'imported',
    relayConnected: false,
    waitingForHost: false,
    sessionReady: false,
    actionInFlight: false,
    contextStage: null,
    lastUserMessage: null,
    lastTrigger: null,
    lastPlan: null,
    lastOutcome: null,
    memoryPreferences: [],
    memoryDeadEnds: [],
    actionCount: 0,
    pendingUserMessages: 0,
  };
}

function parseImportedMonitorFile(rawText: string, fileName: string): ParsedImportedMonitorFile {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error('Expected at least one JSONL line.');
  }

  const events = lines.map((line, index) => parseImportedJsonlEvent(line, index + 1));
  const kind = detectImportedJsonlKind(events);

  return {
    source: {
      mode: 'imported',
      fileName,
      importedAt: createExportTimestamp(),
      format: 'jsonl',
      kind,
    },
    monitorState: buildImportedMonitorState(events, kind),
    events: uniqueSortedMonitorEvents(events),
    llmFilter: 'all',
    showSystemPrompts: false,
    selectedInteractionId: null,
  };
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function getTraceRequestBody(request: unknown): Record<string, unknown> | null {
  const requestRecord = asRecord(request);
  if (!requestRecord) return null;
  return asRecord(requestRecord.body) ?? requestRecord;
}

function getTraceRequestUserInput(request: unknown): Record<string, unknown> | null {
  const body = getTraceRequestBody(request);
  const input = body && Array.isArray(body.input) ? body.input : [];
  for (const rawMessage of input) {
    const message = asRecord(rawMessage);
    if (!message || message.role !== 'user') continue;
    if (typeof message.content === 'string' && message.content.trim()) {
      return parseJsonRecord(message.content);
    }
  }
  return null;
}

function getTraceRequestDisplayValue(request: unknown): unknown {
  return getTraceRequestUserInput(request) ?? request;
}

function getTraceRequestSchemaName(request: unknown): string | null {
  const body = getTraceRequestBody(request);
  const text = asRecord(body?.text);
  const format = asRecord(text?.format);
  return typeof format?.name === 'string' && format.name.trim() ? format.name.trim() : null;
}

function getLlmEventType(event: MonitorEvent): 'request' | 'response.raw' | 'response.parsed' | 'error' | null {
  if (!event.type.startsWith('llm.')) return null;

  let suffix = event.type.slice(4);
  if (suffix.startsWith('planner.')) suffix = suffix.slice('planner.'.length);
  else if (suffix.startsWith('extractor.')) suffix = suffix.slice('extractor.'.length);
  else if (suffix.startsWith('unknown.')) suffix = suffix.slice('unknown.'.length);

  if (suffix === 'request') return 'request';
  if (suffix === 'response.raw') return 'response.raw';
  if (suffix === 'response.parsed') return 'response.parsed';
  if (suffix === 'error') return 'error';
  return null;
}

function getLlmComponent(event: MonitorEvent): LlmComponent {
  if (event.type.startsWith('llm.planner.')) return 'planner';
  if (event.type.startsWith('llm.extractor.')) return 'extractor';
  if (event.type.startsWith('llm.unknown.')) return 'unknown';

  const payload = asRecord(event.payload);
  const component = payload?.component;
  if (component === 'planner' || component === 'extractor' || component === 'unknown') {
    return component;
  }

  // Backward compatibility for older monitor streams (`llm.request` etc.)
  return 'planner';
}

function getLlmTraceRequestId(payload: unknown): string | null {
  const record = asRecord(payload);
  return typeof record?.requestId === 'string' && record.requestId.trim() ? record.requestId.trim() : null;
}

function buildLlmInteractions(events: MonitorEvent[]): LlmInteraction[] {
  const interactions: LlmInteraction[] = [];
  const currentByComponent: Record<LlmComponent, LlmInteraction | null> = {
    planner: null,
    extractor: null,
    unknown: null,
  };
  const currentByRequestId = new Map<string, LlmInteraction>();

  for (const event of events) {
    const llmEventType = getLlmEventType(event);
    if (!llmEventType) continue;
    const component = getLlmComponent(event);
    const requestId = getLlmTraceRequestId(event.payload);

    if (requestId) {
      let current = currentByRequestId.get(requestId) ?? null;

      if (llmEventType === 'request') {
        if (current) {
          current.request = event.payload;
          current.sourceEvents.push(event);
        } else {
          currentByRequestId.set(requestId, {
            id: event.index,
            timestamp: event.timestamp,
            component,
            requestId,
            request: event.payload,
            raw: null,
            parsed: null,
            error: null,
            sourceEvents: [event],
          });
        }
        continue;
      }

      if (!current) {
        current = {
          id: event.index,
          timestamp: event.timestamp,
          component,
          requestId,
          request: null,
          raw: null,
          parsed: null,
          error: null,
          sourceEvents: [event],
        };
        currentByRequestId.set(requestId, current);
      } else {
        current.sourceEvents.push(event);
      }

      if (llmEventType === 'response.raw') {
        current.raw = event.payload;
      } else if (llmEventType === 'response.parsed') {
        current.parsed = event.payload;
        interactions.push(current);
        currentByRequestId.delete(requestId);
      } else if (llmEventType === 'error') {
        current.error = event.payload;
        interactions.push(current);
        currentByRequestId.delete(requestId);
      }
      continue;
    }

    let current = currentByComponent[component];

    if (llmEventType === 'request') {
      if (current) {
        const isRetryRequest =
          current.raw === null &&
          current.parsed === null &&
          current.error === null;
        if (isRetryRequest) {
          // Retries can emit another request before any terminal event arrives.
          // Keep a single card for the logical interaction instead of leaving a stale pending entry behind.
          current.request = event.payload;
          current.sourceEvents.push(event);
          continue;
        }
        interactions.push(current);
      }
      currentByComponent[component] = {
        id: event.index,
        timestamp: event.timestamp,
        component,
        requestId: null,
        request: event.payload,
        raw: null,
        parsed: null,
        error: null,
        sourceEvents: [event],
      };
      continue;
    }

    if (!current) {
      current = {
        id: event.index,
        timestamp: event.timestamp,
        component,
        requestId: null,
        request: null,
        raw: null,
        parsed: null,
        error: null,
        sourceEvents: [event],
      };
      currentByComponent[component] = current;
    } else {
      current.sourceEvents.push(event);
    }

    if (llmEventType === 'response.raw') {
      current.raw = event.payload;
    } else if (llmEventType === 'response.parsed') {
      current.parsed = event.payload;
      interactions.push(current);
      currentByComponent[component] = null;
    } else if (llmEventType === 'error') {
      current.error = event.payload;
      interactions.push(current);
      currentByComponent[component] = null;
    }
  }

  for (const component of ['planner', 'extractor', 'unknown'] as const) {
    const current = currentByComponent[component];
    if (current) interactions.push(current);
  }
  for (const current of currentByRequestId.values()) {
    interactions.push(current);
  }
  return interactions.sort((a, b) => {
    if (a.id !== b.id) return a.id - b.id;
    if (a.timestamp !== b.timestamp) return a.timestamp.localeCompare(b.timestamp);
    return a.component.localeCompare(b.component);
  });
}

function getInteractionStatus(item: LlmInteraction): LlmInteractionStatus {
  if (item.error) return 'error';
  if (item.parsed) return 'completed';
  return 'pending';
}

function getComponentLabel(
  component: LlmComponent,
  routingMode?: 'planner' | 'baseline'
): string {
  if (component === 'extractor') return 'Extractor';
  if (component === 'planner') {
    return routingMode === 'baseline' ? 'Planner (Baseline Router)' : 'Planner';
  }
  return 'Unknown';
}

function getExtractorRequestInput(request: unknown): Record<string, unknown> | null {
  const fromTraceBody = getTraceRequestUserInput(request);
  if (fromTraceBody) return fromTraceBody;
  const requestRecord = asRecord(request);
  if (!requestRecord) return null;
  const nestedInput = asRecord(requestRecord.input);
  return nestedInput ?? requestRecord;
}

function getExtractorBadge(request: unknown): ExtractorBadge | null {
  const schemaName = getTraceRequestSchemaName(request);
  if (schemaName === 'preferences_result') return 'preferences';

  const requestRecord = asRecord(request);
  const kind = requestRecord?.kind;
  if (kind === 'preferences') {
    return kind;
  }

  const input = getExtractorRequestInput(request);
  const mode = input?.updateFocus;
  if (mode === 'preferences_conflicts' || mode === 'constraints_conflicts') {
    return mode;
  }
  return null;
}

function getExtractorTrigger(request: unknown): string | null {
  const input = getExtractorRequestInput(request);
  return typeof input?.trigger === 'string' && input.trigger.trim() ? input.trigger : null;
}

function getInteractionEventMeta(event: MonitorEvent): Record<string, unknown> {
  return event.traceMeta ?? {};
}

function getInteractionEventClientTimestamp(event: MonitorEvent): string | null {
  return getOptionalString(getInteractionEventMeta(event), 'clientTimestamp');
}

function getInteractionEventStageLabel(event: MonitorEvent): string | null {
  const payload = asRecord(event.payload);
  if (!payload) return null;

  const fromStage = getOptionalString(payload, 'fromStage');
  const toStage = getOptionalString(payload, 'toStage');
  if (fromStage && toStage) {
    return `${fromStage} -> ${toStage}`;
  }

  const directStage = getOptionalString(payload, 'stage');
  if (directStage) return directStage;

  const message = asRecord(payload.message);
  const messageStage = message ? getOptionalString(message, 'stage') : null;
  if (messageStage) return messageStage;

  const spec = asRecord(payload.spec) ?? asRecord(message?.spec);
  return spec ? getOptionalString(spec, 'stage') : null;
}

function getInteractionEventSummary(event: MonitorEvent): string {
  const payload = asRecord(event.payload);
  if (!payload) {
    return truncateText(copyText(event.payload), 140);
  }

  const message = asRecord(payload.message);
  if (message) {
    const text = readTrimmedString(message.text);
    if (text) return truncateText(text, 140);
    const label = readTrimmedString(message.label);
    const action = readTrimmedString(message.action);
    if (label && action) return truncateText(`${action}: ${label}`, 140);
    if (label) return truncateText(label, 140);
    if (action) return truncateText(action, 140);
    const spec = asRecord(message.spec);
    const title = spec ? getOptionalString(spec, 'title') : null;
    if (title) return truncateText(title, 140);
  }

  const action = getOptionalString(payload, 'action');
  const selectionLabel = getOptionalString(payload, 'selectionLabel');
  const itemId = getOptionalString(payload, 'itemId');
  const reason = getOptionalString(payload, 'reason');
  if (action && selectionLabel) return truncateText(`${action}: ${selectionLabel}`, 140);
  if (action && itemId) return truncateText(`${action}: ${itemId}`, 140);
  if (action) return truncateText(action, 140);
  if (selectionLabel) return truncateText(selectionLabel, 140);
  if (reason) return truncateText(reason, 140);

  return truncateText(copyText(payload), 140);
}

function isUserMessageInteractionEvent(event: MonitorEvent): boolean {
  if (event.type !== 'chat.message.rendered') return false;
  const payload = asRecord(event.payload);
  const message = asRecord(payload?.message);
  return message?.type === 'user';
}

function getUserMessageDisplayText(event: MonitorEvent): string {
  const payload = asRecord(event.payload);
  if (!payload) return getInteractionEventSummary(event);

  const message = asRecord(payload.message);
  if (message) {
    const text = readTrimmedString(message.text);
    if (text) return text;
    const label = readTrimmedString(message.label);
    if (label) return label;
    const action = readTrimmedString(message.action);
    if (action) return action;
  }

  return getInteractionEventSummary(event);
}

function getUserMessageActionLabel(event: MonitorEvent): string | null {
  const payload = asRecord(event.payload);
  const message = asRecord(payload?.message);
  return message ? readTrimmedString(message.action) : null;
}

function getUserMessageSourceLabel(event: MonitorEvent): string | null {
  const payload = asRecord(event.payload);
  if (!payload) return null;
  const message = asRecord(payload.message);
  const source = getOptionalString(message ?? {}, 'inputSource') ?? getOptionalString(payload, 'source');
  if (source) return source;
  if (event.type === 'chat.message.rendered') return 'rendered';
  return null;
}

function getUserMessageActionBadgeClass(event: MonitorEvent): string {
  const action = getUserMessageActionLabel(event);
  if (action === 'input') {
    return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200';
  }
  if (action === 'select') {
    return 'border-sky-500/35 bg-sky-500/10 text-sky-200';
  }
  if (action === 'back') {
    return 'border-rose-500/35 bg-rose-500/10 text-rose-200';
  }
  return 'border-cyan-500/35 bg-cyan-500/10 text-cyan-200';
}

function buildJsonlEventRecord(
  event: MonitorEvent,
  state: MonitorState | null,
  exportedAt: string
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    ...(event.traceMeta ?? {}),
    timestamp: event.timestamp,
    type: event.type,
    payload: event.payload,
  };

  if (record.source === undefined) {
    record.source = 'tuning-agent-monitor';
  }
  if (record.exportedAt === undefined) {
    record.exportedAt = exportedAt;
  }
  if (state?.sessionId && record.sessionId === undefined) {
    record.sessionId = state.sessionId;
  }
  if (state?.agentName && record.agentName === undefined) {
    record.agentName = state.agentName;
  }
  if (state?.routingMode && record.routingMode === undefined) {
    record.routingMode = state.routingMode;
  }
  if (state?.relayUrl && record.relayUrl === undefined) {
    record.relayUrl = state.relayUrl;
  }

  return record;
}

function buildJsonlTraceText(
  sourceEvents: MonitorEvent[],
  state: MonitorState | null,
  exportedAt: string
): string {
  return uniqueSortedMonitorEvents(sourceEvents)
    .map((event) => JSON.stringify(buildJsonlEventRecord(event, state, exportedAt)))
    .join('\n')
    .concat('\n');
}

export default function App() {
  const [tab, setTab] = useState<'agent' | 'llm' | 'interaction'>('llm');
  const [llmFilter, setLlmFilter] = useState<LlmFilter>('all');
  const [showSystemPrompts, setShowSystemPrompts] = useState(false);
  const [monitorState, setMonitorState] = useState<MonitorState | null>(null);
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [connection, setConnection] = useState<MonitorConnectionState>('connecting');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [selectedLlmId, setSelectedLlmId] = useState<number | null>(null);
  const [interactionViewMode, setInteractionViewMode] = useState<'all' | 'user-messages'>('all');
  const [interactionTypeFilter, setInteractionTypeFilter] = useState<string>('all');
  const [selectedInteractionEventId, setSelectedInteractionEventId] = useState<number | null>(null);
  const [dataSource, setDataSource] = useState<MonitorDataSource>({ mode: 'live' });
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (dataSource.mode !== 'live') {
      setConnection('imported');
      setErrorText(null);
      return;
    }

    let closed = false;
    let es: EventSource | null = null;
    let reconnectTimer: number | null = null;
    const eventsUrl = `${API_BASE}/events`;

    function clearReconnectTimer() {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function scheduleReconnect() {
      if (closed || reconnectTimer !== null) return;
      setConnection('connecting');
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        void bootstrap();
      }, RECONNECT_DELAY_MS);
    }

    async function bootstrap() {
      if (closed) return;
      if (es) {
        es.close();
        es = null;
      }
      setConnection('connecting');
      try {
        const res = await fetch(`${API_BASE}/state`);
        if (!res.ok) throw new Error(`state fetch failed (${res.status})`);
        const payload = (await res.json()) as SnapshotPayload;
        if (closed) return;
        setMonitorState(payload.state);
        setEvents(payload.events ?? []);
        setErrorText(null);
      } catch (error) {
        if (closed) return;
        setConnection('error');
        setErrorText(error instanceof Error ? error.message : String(error));
        scheduleReconnect();
        return;
      }

      es = new EventSource(eventsUrl);

      es.addEventListener('open', () => {
        if (closed) return;
        setConnection('live');
        setErrorText(null);
      });

      es.addEventListener('error', () => {
        if (closed) return;
        setConnection('error');
        setErrorText('event stream disconnected');
        if (es) {
          es.close();
          es = null;
        }
        scheduleReconnect();
      });

      es.addEventListener('snapshot', (event) => {
        if (closed) return;
        const payload = JSON.parse(event.data) as SnapshotPayload;
        setMonitorState(payload.state);
        setEvents(payload.events ?? []);
      });

      es.addEventListener('state', (event) => {
        if (closed) return;
        const payload = JSON.parse(event.data) as StatePayload;
        setMonitorState(payload.state);
      });

      es.addEventListener('event', (event) => {
        if (closed) return;
        const payload = JSON.parse(event.data) as EventPayload;
        setEvents((prev) => [...prev, payload.event].slice(-MAX_EVENTS));
      });
    }

    void bootstrap();
    return () => {
      closed = true;
      clearReconnectTimer();
      if (es) {
        es.close();
        es = null;
      }
    };
  }, [dataSource.mode]);

  const llmInteractions = useMemo(() => buildLlmInteractions(events), [events]);
  const llmCounts = useMemo(
    () =>
      llmInteractions.reduce(
        (acc, item) => {
          acc.all += 1;
          if (item.component === 'planner') acc.planner += 1;
          if (item.component === 'extractor') acc.extractor += 1;
          return acc;
        },
        { all: 0, planner: 0, extractor: 0 }
      ),
    [llmInteractions]
  );
  const visibleLlmInteractions = useMemo(
    () => llmInteractions.filter((item) => llmFilter === 'all' || item.component === llmFilter),
    [llmInteractions, llmFilter]
  );
  const importedJsonlKind = dataSource.mode === 'imported' ? dataSource.kind : null;
  const interactionEvents = useMemo(
    () => (importedJsonlKind === 'interaction-log' ? uniqueSortedMonitorEvents(events) : []),
    [events, importedJsonlKind]
  );
  const interactionTypeOptions = useMemo(
    () => Array.from(new Set(interactionEvents.map((event) => event.type))).sort((a, b) => a.localeCompare(b)),
    [interactionEvents]
  );
  const userMessageEvents = useMemo(
    () => interactionEvents.filter(isUserMessageInteractionEvent),
    [interactionEvents]
  );
  const filteredInteractionEvents = useMemo(() => {
    const visible =
      interactionTypeFilter === 'all'
        ? interactionEvents
        : interactionEvents.filter((event) => event.type === interactionTypeFilter);
    return visible.slice().reverse();
  }, [interactionEvents, interactionTypeFilter]);
  const filteredUserMessageEvents = useMemo(
    () => userMessageEvents.slice(),
    [userMessageEvents]
  );
  const selectedInteractionEvent = useMemo(
    () =>
      selectedInteractionEventId === null
        ? null
        : interactionEvents.find((event) => event.index === selectedInteractionEventId) ?? null,
    [interactionEvents, selectedInteractionEventId]
  );
  const importedInteractionMeta = useMemo(
    () => (interactionEvents.length > 0 ? getInteractionEventMeta(interactionEvents[0]) : {}),
    [interactionEvents]
  );
  const filteredLlmInteractions = useMemo(
    () => visibleLlmInteractions.slice().reverse(),
    [visibleLlmInteractions]
  );
  const selectedLlmInteraction = useMemo(
    () => (selectedLlmId === null ? null : llmInteractions.find((item) => item.id === selectedLlmId) ?? null),
    [llmInteractions, selectedLlmId]
  );
  const selectedExtractorBadge = useMemo(
    () =>
      selectedLlmInteraction?.component === 'extractor'
        ? getExtractorBadge(selectedLlmInteraction.request)
        : null,
    [selectedLlmInteraction]
  );
  const selectedExtractorTrigger = useMemo(
    () =>
      selectedLlmInteraction?.component === 'extractor'
        ? getExtractorTrigger(selectedLlmInteraction.request)
        : null,
    [selectedLlmInteraction]
  );
  const selectedLlmRequestDisplayValue = useMemo(
    () => (selectedLlmInteraction ? getTraceRequestDisplayValue(selectedLlmInteraction.request) : null),
    [selectedLlmInteraction]
  );
  const recentEvents = useMemo(() => events.slice().reverse().slice(0, 160), [events]);

  useEffect(() => {
    if (!selectedLlmInteraction) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedLlmId(null);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedLlmInteraction]);

  useEffect(() => {
    if (!selectedInteractionEvent) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedInteractionEventId(null);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedInteractionEvent]);

  useEffect(() => {
    if (tab !== 'llm') {
      setSelectedLlmId(null);
    }
  }, [tab]);

  useEffect(() => {
    if (tab !== 'interaction') {
      setSelectedInteractionEventId(null);
    }
  }, [tab]);

  useEffect(() => {
    if (interactionTypeFilter === 'all') return;
    if (!interactionTypeOptions.includes(interactionTypeFilter)) {
      setInteractionTypeFilter('all');
    }
  }, [interactionTypeFilter, interactionTypeOptions]);

  async function clearMonitorEvents() {
    if (dataSource.mode !== 'live') return;
    if (isClearing) return;
    const confirmed = window.confirm('Clear all monitor events and LLM trace?');
    if (!confirmed) return;

    setIsClearing(true);
    try {
      const res = await fetch(`${API_BASE}/events/clear`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(`clear failed (${res.status})`);
      }
      setErrorText(null);
      setEvents([]);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setIsClearing(false);
    }
  }

  async function handleImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const imported = parseImportedMonitorFile(text, file.name);
      setDataSource(imported.source);
      setMonitorState(imported.monitorState);
      setEvents(imported.events);
      setLlmFilter(imported.llmFilter);
      setShowSystemPrompts(imported.showSystemPrompts);
      setSelectedLlmId(imported.selectedInteractionId);
      setInteractionViewMode('all');
      setInteractionTypeFilter('all');
      setSelectedInteractionEventId(null);
      setErrorText(null);
      setTab(imported.source.kind === 'interaction-log' ? 'interaction' : 'llm');
    } catch (error) {
      setErrorText(`import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function returnToLiveMode() {
    setSelectedLlmId(null);
    setSelectedInteractionEventId(null);
    setDataSource({ mode: 'live' });
  }

  function buildTraceExport() {
    const exportedAt = createExportTimestamp();
    return {
      filename: buildTraceExportFilename(monitorState, llmFilter, exportedAt),
      contents: buildJsonlTraceText(
        visibleLlmInteractions.flatMap((item) => item.sourceEvents),
        monitorState,
        exportedAt
      ),
    };
  }

  function buildSelectedTraceExport() {
    if (!selectedLlmInteraction) {
      throw new Error('No LLM interaction selected.');
    }

    const exportedAt = createExportTimestamp();
    return {
      filename: buildInteractionExportFilename(monitorState, selectedLlmInteraction, exportedAt),
      contents: buildJsonlTraceText(selectedLlmInteraction.sourceEvents, monitorState, exportedAt),
    };
  }

  return (
    <>
      <div className="mx-auto max-w-[1500px] px-4 pb-10 pt-6">
      <header className="mb-5 rounded-2xl border border-ink-700/70 bg-ink-900/60 p-4 backdrop-blur">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Tuning Agent Monitor</h1>
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="text-mist-300">stream:</span>
            <span
              className={`rounded-full px-2 py-1 ${
                connection === 'live'
                  ? 'bg-ok-500/15 text-ok-500'
                  : connection === 'imported'
                    ? 'bg-cyan-500/15 text-cyan-300'
                  : connection === 'connecting'
                    ? 'bg-warn-500/15 text-warn-500'
                    : 'bg-danger-500/15 text-danger-500'
              }`}
            >
              {connection}
            </span>
          </div>
        </div>
        <div className="text-xs text-mist-300">
          {errorText
            ? errorText
            : dataSource.mode === 'imported'
              ? `Viewing imported ${dataSource.kind === 'interaction-log' ? 'interaction log' : 'LLM trace'} JSONL from ${dataSource.fileName}.`
              : 'Live data from /state and /events.'}
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex gap-2">
          <button
            className={`rounded-lg border px-3 py-1.5 ${
              tab === 'llm'
                ? 'border-mist-500 bg-mist-700/20 text-mist-100'
                : 'border-ink-700 bg-ink-900/50 text-mist-300'
            }`}
            onClick={() => setTab('llm')}
            type="button"
          >
            LLM Trace
          </button>
          <button
            className={`rounded-lg border px-3 py-1.5 ${
              tab === 'interaction'
                ? 'border-mist-500 bg-mist-700/20 text-mist-100'
                : 'border-ink-700 bg-ink-900/50 text-mist-300'
            }`}
            onClick={() => setTab('interaction')}
            type="button"
          >
            Interaction
          </button>
          <button
            className={`rounded-lg border px-3 py-1.5 ${
              tab === 'agent'
                ? 'border-mist-500 bg-mist-700/20 text-mist-100'
                : 'border-ink-700 bg-ink-900/50 text-mist-300'
            }`}
            onClick={() => setTab('agent')}
            type="button"
          >
            Agent
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-lg border border-ink-600 bg-ink-900/60 px-3 py-1.5 text-xs font-semibold text-mist-100 hover:border-mist-500"
            onClick={() => importInputRef.current?.click()}
            type="button"
          >
            Import JSONL
          </button>
          {dataSource.mode === 'imported' ? (
            <button
              className="rounded-lg border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20"
              onClick={returnToLiveMode}
              type="button"
            >
              Return to Live
            </button>
          ) : null}
          <button
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              isClearing || dataSource.mode !== 'live'
                ? 'cursor-not-allowed border-ink-700 bg-ink-900/50 text-mist-400'
                : 'border-danger-500/60 bg-danger-500/10 text-danger-500 hover:bg-danger-500/20'
            }`}
            disabled={isClearing || dataSource.mode !== 'live'}
            onClick={() => void clearMonitorEvents()}
            type="button"
          >
            {dataSource.mode !== 'live' ? 'Clear Disabled' : isClearing ? 'Clearing...' : 'Clear'}
          </button>
          <input
            accept=".jsonl,application/x-ndjson,application/jsonl,text/plain"
            className="hidden"
            onChange={(event) => void handleImportFileChange(event)}
            ref={importInputRef}
            type="file"
          />
        </div>
      </div>

      {tab === 'agent' ? (
        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Agent" value={monitorState?.agentName ?? '-'} />
            <StatCard label="Routing Mode" value={monitorState?.routingMode ?? 'planner'} />
            <StatCard label="Phase" value={monitorState?.phase ?? '-'} />
            <StatCard label="Stage" value={monitorState?.contextStage ?? '-'} />
            <StatCard label="Session Ready" value={String(Boolean(monitorState?.sessionReady))} />
            <StatCard label="Action In Flight" value={String(Boolean(monitorState?.actionInFlight))} />
            <StatCard label="Preference Count" value={String(monitorState?.memoryPreferences?.length ?? 0)} />
            <StatCard label="Dead End Count" value={String(monitorState?.memoryDeadEnds?.length ?? 0)} />
          </div>

          <JsonCard
            title="Runtime"
            value={{
              startedAt: monitorState?.startedAt,
              agentName: monitorState?.agentName,
              relayUrl: monitorState?.relayUrl,
              sessionId: monitorState?.sessionId,
              routingMode: monitorState?.routingMode,
              relayConnected: monitorState?.relayConnected,
              waitingForHost: monitorState?.waitingForHost,
              sessionReady: monitorState?.sessionReady,
              lastUserMessage: monitorState?.lastUserMessage,
              lastTrigger: monitorState?.lastTrigger,
              actionCount: monitorState?.actionCount,
              pendingUserMessages: monitorState?.pendingUserMessages,
            }}
          />
          <JsonCard
            title="Agent Memory"
            value={{
              preferences: monitorState?.memoryPreferences ?? [],
              deadEnds: monitorState?.memoryDeadEnds ?? [],
            }}
          />
          <JsonCard title="Last Plan" value={monitorState?.lastPlan ?? null} />
          <JsonCard title="Last Outcome" value={monitorState?.lastOutcome ?? null} />

          <section className="rounded-2xl border border-ink-700/70 bg-ink-900/50 p-4">
            <h2 className="mb-3 text-sm font-semibold text-mist-200">Events</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-xs">
                <thead>
                  <tr className="text-left text-mist-300">
                    <th className="border-b border-ink-700 px-2 py-2">time</th>
                    <th className="border-b border-ink-700 px-2 py-2">type</th>
                    <th className="border-b border-ink-700 px-2 py-2">payload</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((event) => (
                    <tr key={event.index}>
                      <td className="border-b border-ink-800 px-2 py-2 align-top text-mist-300">
                        {shortTime(event.timestamp)}
                      </td>
                      <td className="border-b border-ink-800 px-2 py-2 align-top text-mist-200">{event.type}</td>
                      <td className="border-b border-ink-800 px-2 py-2 align-top">
                        <pre className="max-h-44 overflow-auto rounded-md border border-ink-700 bg-ink-950/70 p-2 font-mono text-[11px] text-mist-100">
                          {fmt(event.payload)}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      ) : tab === 'interaction' ? (
        <section className="space-y-4">
          {importedJsonlKind !== 'interaction-log' ? (
            <section className="rounded-2xl border border-ink-700/70 bg-ink-900/50 p-4 text-sm text-mist-300">
              Import a study interaction JSONL file from `logs/interaction` to inspect participant actions, stage
              transitions, rendered messages, and raw payloads.
            </section>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Events" value={String(interactionEvents.length)} />
                <StatCard
                  label="Condition"
                  value={getOptionalString(importedInteractionMeta, 'conditionLabel') ?? '-'}
                />
                <StatCard
                  label="Scenario"
                  value={getOptionalString(importedInteractionMeta, 'scenarioId') ?? '-'}
                />
                <StatCard
                  label="Participant"
                  value={
                    getOptionalString(importedInteractionMeta, 'participantId') ??
                    getOptionalString(importedInteractionMeta, 'sessionParticipantId') ??
                    '-'
                  }
                />
              </div>

              <section className="rounded-2xl border border-ink-700/70 bg-ink-900/50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {getOptionalString(importedInteractionMeta, 'conditionLabel') ? (
                        <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-1 font-semibold text-cyan-200">
                          condition: {getOptionalString(importedInteractionMeta, 'conditionLabel')}
                        </span>
                      ) : null}
                      {getOptionalString(importedInteractionMeta, 'scenarioId') ? (
                        <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 font-semibold text-amber-200">
                          scenario: {getOptionalString(importedInteractionMeta, 'scenarioId')}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-mist-300">
                      Imported interaction log view. Switch to user messages to isolate participant input, or browse
                      all raw events below.
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button
                      className={`rounded-lg border px-2.5 py-1 ${
                        interactionViewMode === 'all'
                          ? 'border-mist-500 bg-mist-700/20 text-mist-100'
                          : 'border-ink-700 bg-ink-900/50 text-mist-300'
                      }`}
                      onClick={() => setInteractionViewMode('all')}
                      type="button"
                    >
                      All Events
                    </button>
                    <button
                      className={`rounded-lg border px-2.5 py-1 ${
                        interactionViewMode === 'user-messages'
                          ? 'border-mist-500 bg-mist-700/20 text-mist-100'
                          : 'border-ink-700 bg-ink-900/50 text-mist-300'
                      }`}
                      onClick={() => setInteractionViewMode('user-messages')}
                      type="button"
                    >
                      User Messages ({userMessageEvents.length})
                    </button>
                    {interactionViewMode === 'all' ? (
                      <>
                        <label className="text-mist-300" htmlFor="interaction-type-filter">
                          type
                        </label>
                        <select
                          id="interaction-type-filter"
                          className="rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-mist-100"
                          onChange={(event) => setInteractionTypeFilter(event.target.value)}
                          value={interactionTypeFilter}
                        >
                          <option value="all">All ({interactionEvents.length})</option>
                          {interactionTypeOptions.map((type) => {
                            const count = interactionEvents.filter((event) => event.type === type).length;
                            return (
                              <option key={type} value={type}>
                                {type} ({count})
                              </option>
                            );
                          })}
                        </select>
                      </>
                    ) : null}
                  </div>
                </div>
                {interactionViewMode === 'user-messages' ? (
                  filteredUserMessageEvents.length === 0 ? (
                    <div className="rounded-xl border border-ink-800 bg-ink-950/50 p-4 text-sm text-mist-300">
                      No user message events found in this interaction log.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredUserMessageEvents.map((event) => {
                        const messageText = getUserMessageDisplayText(event);
                        return (
                          <article
                            key={event.index}
                            className="cursor-pointer rounded-xl border border-ink-700/70 bg-ink-950/55 p-4 transition hover:border-mist-500/70"
                            onClick={() => setSelectedInteractionEventId(event.index)}
                          >
                            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-mist-300">
                                {getInteractionEventStageLabel(event) ? (
                                  <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 font-semibold text-amber-200">
                                    stage: {getInteractionEventStageLabel(event)}
                                  </span>
                                ) : null}
                                <span>{shortTime(event.timestamp)}</span>
                                {getUserMessageActionLabel(event) ? (
                                  <span
                                    className={`rounded-full border px-2 py-1 font-medium ${getUserMessageActionBadgeClass(
                                      event
                                    )}`}
                                  >
                                    {getUserMessageActionLabel(event)}
                                  </span>
                                ) : null}
                                {getUserMessageSourceLabel(event) &&
                                getUserMessageSourceLabel(event) !== 'rendered' ? (
                                  <span className="rounded-full border border-ink-700 bg-ink-900/70 px-2 py-1 text-mist-200">
                                    source: {getUserMessageSourceLabel(event)}
                                  </span>
                                ) : null}
                              </div>
                              <CopyTextButton
                                onClick={(clickEvent) => clickEvent.stopPropagation()}
                                text={messageText}
                              />
                            </div>
                            <div className="whitespace-pre-wrap text-base font-medium leading-6 text-mist-100">
                              {messageText}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] border-collapse text-xs">
                      <thead>
                        <tr className="text-left text-mist-300">
                          <th className="border-b border-ink-700 px-2 py-2">time</th>
                          <th className="border-b border-ink-700 px-2 py-2">type</th>
                          <th className="border-b border-ink-700 px-2 py-2">stage</th>
                          <th className="border-b border-ink-700 px-2 py-2">summary</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInteractionEvents.map((event) => (
                          <tr
                            key={event.index}
                            className="cursor-pointer hover:bg-ink-800/40"
                            onClick={() => setSelectedInteractionEventId(event.index)}
                          >
                            <td className="border-b border-ink-800 px-2 py-2 align-top text-mist-300">
                              <div>{shortTime(event.timestamp)}</div>
                              {getInteractionEventClientTimestamp(event) ? (
                                <div className="mt-1 text-[10px] text-mist-500">
                                  client {shortTime(getInteractionEventClientTimestamp(event) ?? '')}
                                </div>
                              ) : null}
                            </td>
                            <td className="border-b border-ink-800 px-2 py-2 align-top text-mist-100">
                              <span className="rounded-full border border-ink-700 bg-ink-950/80 px-2 py-1">
                                {event.type}
                              </span>
                            </td>
                            <td className="border-b border-ink-800 px-2 py-2 align-top text-mist-200">
                              {getInteractionEventStageLabel(event) ?? '-'}
                            </td>
                            <td className="border-b border-ink-800 px-2 py-2 align-top text-mist-100">
                              {getInteractionEventSummary(event)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-mist-300">
              One card per LLM interaction (request → response/error) across planner/extractor. Click a card to open
              full-height detail.
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <ExportTraceButton
                buildExport={buildTraceExport}
                className="bg-ink-900/60 text-mist-100 hover:border-mist-500"
                disabled={visibleLlmInteractions.length === 0}
                label="Export Trace"
              />
              <button
                className={`rounded-lg border px-2.5 py-1 ${
                  showSystemPrompts
                    ? 'border-mist-500 bg-mist-700/20 text-mist-100'
                    : 'border-ink-700 bg-ink-900/50 text-mist-300'
                }`}
                onClick={() => setShowSystemPrompts((prev) => !prev)}
                type="button"
              >
                {showSystemPrompts ? 'Hide System Prompts' : 'Show System Prompts'}
              </button>
              <button
                className={`rounded-lg border px-2.5 py-1 ${
                  llmFilter === 'all'
                    ? 'border-mist-500 bg-mist-700/20 text-mist-100'
                    : 'border-ink-700 bg-ink-900/50 text-mist-300'
                }`}
                onClick={() => setLlmFilter('all')}
                type="button"
              >
                All ({llmCounts.all})
              </button>
              <button
                className={`rounded-lg border px-2.5 py-1 ${
                  llmFilter === 'planner'
                    ? 'border-mist-500 bg-mist-700/20 text-mist-100'
                    : 'border-ink-700 bg-ink-900/50 text-mist-300'
                }`}
                onClick={() => setLlmFilter('planner')}
                type="button"
              >
                {monitorState?.routingMode === 'baseline' ? 'Planner (Baseline Router)' : 'Planner'} ({llmCounts.planner})
              </button>
              <button
                className={`rounded-lg border px-2.5 py-1 ${
                  llmFilter === 'extractor'
                    ? 'border-mist-500 bg-mist-700/20 text-mist-100'
                    : 'border-ink-700 bg-ink-900/50 text-mist-300'
                }`}
                onClick={() => setLlmFilter('extractor')}
                type="button"
              >
                Extractor ({llmCounts.extractor})
              </button>
            </div>
          </div>
          {showSystemPrompts ? (
            <section className="rounded-2xl border border-ink-700/70 bg-ink-900/50 p-4">
              <h2 className="mb-1 text-sm font-semibold text-mist-200">System Prompts</h2>
              <p className="mb-3 text-xs text-mist-300">
                Most recent composed system prompts actually sent for each LLM component.
              </p>
              <div className="grid gap-3 xl:grid-cols-2">
                <PromptBlock
                  title={monitorState?.routingMode === 'baseline' ? 'Planner (Baseline Router)' : 'Planner'}
                  prompt={monitorState?.llmSystemPrompts?.planner}
                />
                <PromptBlock
                  title="Extractor"
                  prompt={monitorState?.llmSystemPrompts?.extractor}
                />
              </div>
            </section>
          ) : null}
          {filteredLlmInteractions.length === 0 ? (
            <section className="rounded-2xl border border-ink-700/70 bg-ink-900/50 p-4 text-sm text-mist-300">
              No LLM interactions for selected filter.
            </section>
          ) : (
            filteredLlmInteractions.map((item) => {
              const status = getInteractionStatus(item);
              const componentLabel = getComponentLabel(item.component, monitorState?.routingMode);
              const extractorBadge = item.component === 'extractor' ? getExtractorBadge(item.request) : null;
              const extractorTrigger =
                item.component === 'extractor' ? getExtractorTrigger(item.request) : null;
              return (
                <article
                  key={item.id}
                  className="cursor-pointer rounded-2xl border border-ink-700/70 bg-ink-900/50 p-4 transition hover:border-mist-500/70"
                  onClick={() => setSelectedLlmId(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedLlmId(item.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 font-semibold ${
                          item.component === 'extractor'
                            ? 'bg-cyan-500/15 text-cyan-300'
                            : item.component === 'planner'
                              ? 'bg-mist-500/20 text-mist-100'
                              : 'bg-ink-700/60 text-mist-300'
                        }`}
                      >
                        {componentLabel}
                      </span>
                      <span className="text-mist-300">
                        #{item.id} · {shortTime(item.timestamp)}
                      </span>
                      {extractorBadge ? (
                        <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-1 font-semibold text-cyan-200">
                          kind: {extractorBadge}
                        </span>
                      ) : null}
                      {extractorTrigger ? (
                        <span className="rounded-full border border-ink-600 bg-ink-800/70 px-2 py-1 font-semibold text-mist-200">
                          trigger: {extractorTrigger}
                        </span>
                      ) : null}
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 font-semibold ${
                        status === 'completed'
                          ? 'bg-ok-500/15 text-ok-500'
                          : status === 'pending'
                            ? 'bg-warn-500/15 text-warn-500'
                            : 'bg-danger-500/15 text-danger-500'
                      }`}
                    >
                      {status}
                    </span>
                    <CopyTraceButton interaction={item} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <TraceBlock title="Request" value={getTraceRequestDisplayValue(item.request)} copyable />
                    <TraceBlock title="Response" value={item.parsed} copyable />
                  </div>
                  {item.error !== null && item.error !== undefined ? (
                    <div className="mt-3">
                      <TraceBlock title="Error" value={item.error} />
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </section>
      )}
      </div>
      {selectedLlmInteraction ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 bg-ink-950/85 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setSelectedLlmId(null)}
          role="dialog"
        >
          <section
            className="mx-auto flex h-full w-full max-w-[1500px] flex-col rounded-2xl border border-ink-600 bg-ink-900/95"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700/80 px-4 py-3 text-xs sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-1 font-semibold ${
                    selectedLlmInteraction.component === 'extractor'
                      ? 'bg-cyan-500/15 text-cyan-300'
                      : selectedLlmInteraction.component === 'planner'
                        ? 'bg-mist-500/20 text-mist-100'
                        : 'bg-ink-700/60 text-mist-300'
                  }`}
                >
                  {getComponentLabel(selectedLlmInteraction.component, monitorState?.routingMode)}
                </span>
                <span className="text-mist-300">
                  #{selectedLlmInteraction.id} · {shortTime(selectedLlmInteraction.timestamp)}
                </span>
                {selectedExtractorBadge ? (
                  <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-1 font-semibold text-cyan-200">
                    kind: {selectedExtractorBadge}
                  </span>
                ) : null}
                {selectedExtractorTrigger ? (
                  <span className="rounded-full border border-ink-600 bg-ink-800/70 px-2 py-1 font-semibold text-mist-200">
                    trigger: {selectedExtractorTrigger}
                  </span>
                ) : null}
                <span
                  className={`rounded-full px-2 py-1 font-semibold ${
                    getInteractionStatus(selectedLlmInteraction) === 'completed'
                      ? 'bg-ok-500/15 text-ok-500'
                      : getInteractionStatus(selectedLlmInteraction) === 'pending'
                        ? 'bg-warn-500/15 text-warn-500'
                        : 'bg-danger-500/15 text-danger-500'
                  }`}
                >
                  {getInteractionStatus(selectedLlmInteraction)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ExportTraceButton
                  buildExport={buildSelectedTraceExport}
                  className="bg-ink-900/70 text-mist-100 hover:border-mist-500"
                  label="Export Selected"
                  sizeClassName="px-3 py-1.5"
                />
                <button
                  className="rounded-lg border border-ink-600 bg-ink-900/70 px-3 py-1.5 text-mist-100 hover:border-mist-500"
                  onClick={() => setSelectedLlmId(null)}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:p-5">
              {(() => {
                const rawObj = selectedLlmInteraction.raw;
                const summaries =
                  rawObj && typeof rawObj === 'object' && !Array.isArray(rawObj)
                    ? (rawObj as Record<string, unknown>).reasoningSummary
                    : undefined;
                const hasSummary = Array.isArray(summaries) && summaries.length > 0;
                const cols = hasSummary ? 'grid-cols-3' : 'grid-cols-2';
                return (
                  <div className={`grid min-h-0 flex-1 ${cols} gap-3`}>
                    <TraceBlock fillHeight title="Request" value={selectedLlmRequestDisplayValue} copyable />
                    {hasSummary ? (
                      <ReasoningSummaryBlock summaries={summaries.filter((s): s is string => typeof s === 'string')} />
                    ) : null}
                    <TraceBlock fillHeight title="Response" value={selectedLlmInteraction.parsed} copyable />
                  </div>
                );
              })()}
              <div className="max-h-[35vh] min-h-[140px]">
                <TraceBlock fillHeight title="Raw Response" value={selectedLlmInteraction.raw} copyable />
              </div>
              {selectedLlmInteraction.error !== null && selectedLlmInteraction.error !== undefined ? (
                <div className="max-h-[35vh] min-h-[140px]">
                  <TraceBlock fillHeight title="Error" value={selectedLlmInteraction.error} />
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
      {selectedInteractionEvent ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 bg-ink-950/85 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setSelectedInteractionEventId(null)}
          role="dialog"
        >
          <section
            className="mx-auto flex h-full w-full max-w-[1400px] flex-col rounded-2xl border border-ink-600 bg-ink-900/95"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700/80 px-4 py-3 text-xs sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-ink-600 bg-ink-950/80 px-2 py-1 font-semibold text-mist-100">
                  {selectedInteractionEvent.type}
                </span>
                <span className="text-mist-300">
                  #{selectedInteractionEvent.index} · {shortTime(selectedInteractionEvent.timestamp)}
                </span>
                {getInteractionEventStageLabel(selectedInteractionEvent) ? (
                  <span className="rounded-full border border-ink-600 bg-ink-800/70 px-2 py-1 font-semibold text-mist-200">
                    stage: {getInteractionEventStageLabel(selectedInteractionEvent)}
                  </span>
                ) : null}
                {getInteractionEventClientTimestamp(selectedInteractionEvent) ? (
                  <span className="rounded-full border border-ink-600 bg-ink-800/70 px-2 py-1 font-semibold text-mist-200">
                    client: {getInteractionEventClientTimestamp(selectedInteractionEvent)}
                  </span>
                ) : null}
              </div>
              <button
                className="rounded-lg border border-ink-600 bg-ink-900/70 px-3 py-1.5 text-mist-100 hover:border-mist-500"
                onClick={() => setSelectedInteractionEventId(null)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="grid min-h-0 flex-1 gap-3 p-4 sm:grid-cols-2 sm:p-5">
              <TraceBlock
                fillHeight
                title="Metadata"
                value={{
                  timestamp: selectedInteractionEvent.timestamp,
                  clientTimestamp: getInteractionEventClientTimestamp(selectedInteractionEvent),
                  ...getInteractionEventMeta(selectedInteractionEvent),
                }}
                copyable
              />
              <TraceBlock fillHeight title="Payload" value={selectedInteractionEvent.payload} copyable />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-xl border border-ink-700/70 bg-ink-900/55 p-3">
      <div className="text-[11px] uppercase tracking-wide text-mist-300">{label}</div>
      <div className="mt-2 text-sm font-semibold text-mist-100">{value}</div>
    </section>
  );
}

function JsonCard({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="rounded-2xl border border-ink-700/70 bg-ink-900/50 p-4">
      <h2 className="mb-3 text-sm font-semibold text-mist-200">{title}</h2>
      <pre className="max-h-80 overflow-auto rounded-md border border-ink-700 bg-ink-950/70 p-3 font-mono text-[11px] text-mist-100">
        {fmt(value)}
      </pre>
    </section>
  );
}

function PromptBlock({
  title,
  prompt,
}: {
  title: string;
  prompt?: string;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const text = prompt?.trim() ? prompt : 'Prompt unavailable.';

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 1200);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-mist-300">{title}</div>
        <button
          className={`rounded border px-2 py-0.5 text-[11px] ${
            copyState === 'copied'
              ? 'border-ok-500/60 bg-ok-500/15 text-ok-500'
              : copyState === 'error'
                ? 'border-danger-500/60 bg-danger-500/15 text-danger-500'
                : 'border-ink-600 bg-ink-900/60 text-mist-200 hover:border-mist-500'
          }`}
          onClick={() => void handleCopy()}
          type="button"
        >
          {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Failed' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-ink-700 bg-ink-950/70 p-2 font-mono text-[11px] text-mist-100">
        {text}
      </pre>
    </section>
  );
}

function ExportTraceButton({
  buildExport,
  className,
  disabled = false,
  label,
  sizeClassName = 'px-2.5 py-1',
}: {
  buildExport: () => { filename: string; contents: string };
  className?: string;
  disabled?: boolean;
  label: string;
  sizeClassName?: string;
}) {
  const [exportState, setExportState] = useState<'idle' | 'exported' | 'error'>('idle');

  useEffect(() => {
    if (exportState === 'idle') return;
    const timer = window.setTimeout(() => setExportState('idle'), 1200);
    return () => window.clearTimeout(timer);
  }, [exportState]);

  function getButtonClassName(): string {
    if (exportState === 'exported') {
      return 'border-ok-500/60 bg-ok-500/15 text-ok-500';
    }
    if (exportState === 'error') {
      return 'border-danger-500/60 bg-danger-500/15 text-danger-500';
    }
    if (disabled) {
      return 'cursor-not-allowed border-ink-700 bg-ink-900/50 text-mist-400';
    }
    return `border-ink-600 ${className ?? 'bg-ink-900/60 text-mist-200 hover:border-mist-500'}`;
  }

  async function handleExport() {
    if (disabled) return;
    try {
      const { filename, contents } = buildExport();
      downloadTextFile(filename, contents, 'application/x-ndjson;charset=utf-8');
      setExportState('exported');
    } catch {
      setExportState('error');
    }
  }

  return (
    <button
      className={`rounded-lg border ${sizeClassName} ${getButtonClassName()}`}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        void handleExport();
      }}
      type="button"
    >
      {exportState === 'exported' ? 'Exported' : exportState === 'error' ? 'Failed' : label}
    </button>
  );
}

function CopyTextButton({
  text,
  onClick,
}: {
  text: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 1200);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  return (
    <button
      className={`rounded border px-2 py-0.5 text-[11px] ${
        copyState === 'copied'
          ? 'border-ok-500/60 bg-ok-500/15 text-ok-500'
          : copyState === 'error'
            ? 'border-danger-500/60 bg-danger-500/15 text-danger-500'
            : 'border-ink-600 bg-ink-900/70 text-mist-200 hover:border-mist-500'
      }`}
      onClick={(event) => {
        onClick?.(event);
        void handleCopy();
      }}
      type="button"
    >
      {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Failed' : 'Copy'}
    </button>
  );
}

function CopyTraceButton({ interaction }: { interaction: LlmInteraction }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 1200);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function handleCopy() {
    try {
      const trace: Record<string, unknown> = {
        id: interaction.id,
        timestamp: interaction.timestamp,
        component: interaction.component,
        request: interaction.request,
        response: interaction.parsed,
      };
      if (interaction.error !== null && interaction.error !== undefined) {
        trace.error = interaction.error;
      }
      await navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  return (
    <button
      className={`rounded border px-2 py-0.5 text-[11px] ${
        copyState === 'copied'
          ? 'border-ok-500/60 bg-ok-500/15 text-ok-500'
          : copyState === 'error'
            ? 'border-danger-500/60 bg-danger-500/15 text-danger-500'
            : 'border-ink-600 bg-ink-900/60 text-mist-200 hover:border-mist-500'
      }`}
      onClick={(event) => {
        event.stopPropagation();
        void handleCopy();
      }}
      type="button"
    >
      {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Failed' : 'Copy Trace'}
    </button>
  );
}

function TraceBlock({
  title,
  value,
  copyable = false,
  fillHeight = false,
}: {
  title: string;
  value: unknown;
  copyable?: boolean;
  fillHeight?: boolean;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 1200);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(copyText(value));
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  return (
    <section className={fillHeight ? 'flex min-h-0 flex-col' : undefined}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-mist-300">{title}</div>
        {copyable ? (
          <button
            className={`rounded border px-2 py-0.5 text-[11px] ${
              copyState === 'copied'
                ? 'border-ok-500/60 bg-ok-500/15 text-ok-500'
                : copyState === 'error'
                  ? 'border-danger-500/60 bg-danger-500/15 text-danger-500'
                  : 'border-ink-600 bg-ink-900/60 text-mist-200 hover:border-mist-500'
            }`}
            onClick={(event) => {
              event.stopPropagation();
              void handleCopy();
            }}
            type="button"
          >
            {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Failed' : 'Copy'}
          </button>
        ) : null}
      </div>
      <pre
        className={`overflow-auto rounded-md border border-ink-700 bg-ink-950/70 p-2 font-mono text-[11px] text-mist-100 ${
          fillHeight ? 'min-h-0 flex-1' : 'max-h-72'
        }`}
      >
        {fmt(value)}
      </pre>
    </section>
  );
}

function ReasoningSummaryBlock({ summaries }: { summaries: string[] }) {
  return (
    <section className="flex min-h-0 flex-col">
      <div className="mb-1 flex items-center gap-2">
        <div className="text-xs font-semibold text-mist-300">Reasoning Summary</div>
        <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
          {summaries.length === 1 ? '1 step' : `${summaries.length} steps`}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-ink-700 bg-ink-950/70 p-2">
        {summaries.map((text, i) => (
          <p key={i} className="whitespace-pre-wrap font-mono text-[11px] text-mist-100">
            {text}
          </p>
        ))}
      </div>
    </section>
  );
}
