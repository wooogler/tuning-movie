import type {
  PerceivedContext,
  SnapshotStatePayload,
  StateUpdatedPayload,
  ToolSchemaItem,
  UserMessagePayload,
} from '../types';

const DEFAULT_CP_MEMORY_LIMIT = Math.max(
  0,
  Number.parseInt(process.env.AGENT_DEFAULT_CP_MEMORY_LIMIT || '10', 10) || 10
);

function pickStage(uiSpec: unknown): string | null {
  if (!uiSpec || typeof uiSpec !== 'object') return null;
  const record = uiSpec as Record<string, unknown>;
  const stage = record.currentStage ?? record.stage;
  return typeof stage === 'string' ? stage : null;
}

function safeArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeCpMemoryLimit(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (Number.isFinite(parsed)) {
    return Math.max(0, parsed);
  }
  return fallback;
}

function normalizeGuiAdaptationEnabled(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

export function fromSnapshot(payload: SnapshotStatePayload): PerceivedContext {
  const fallbackFromLegacyToggle =
    typeof payload.plannerCpEnabled === 'boolean'
      ? payload.plannerCpEnabled
        ? DEFAULT_CP_MEMORY_LIMIT
        : 0
      : DEFAULT_CP_MEMORY_LIMIT;
  return {
    sessionId: payload.sessionId ?? null,
    stage: pickStage(payload.uiSpec),
    uiSpec: payload.uiSpec ?? null,
    messageHistoryTail: safeArray(payload.messageHistory).slice(),
    toolSchema: safeArray<ToolSchemaItem>(payload.toolSchema),
    plannerCpMemoryLimit: normalizeCpMemoryLimit(
      payload.plannerCpMemoryLimit,
      fallbackFromLegacyToggle
    ),
    guiAdaptationEnabled: normalizeGuiAdaptationEnabled(payload.guiAdaptationEnabled, true),
    lastUserMessage: null,
    lastUpdatedAt: nowIso(),
    stageFieldGuides: payload.stageFieldGuides,
  };
}

export function applyStateUpdated(
  previous: PerceivedContext,
  payload: StateUpdatedPayload
): PerceivedContext {
  const fallbackFromLegacyToggle =
    typeof payload.plannerCpEnabled === 'boolean'
      ? payload.plannerCpEnabled
        ? previous.plannerCpMemoryLimit
        : 0
      : previous.plannerCpMemoryLimit;
  return {
    ...previous,
    stage: pickStage(payload.uiSpec),
    uiSpec: payload.uiSpec ?? null,
    messageHistoryTail: safeArray(payload.messageHistory).slice(),
    toolSchema: safeArray<ToolSchemaItem>(payload.toolSchema),
    plannerCpMemoryLimit: normalizeCpMemoryLimit(
      payload.plannerCpMemoryLimit,
      fallbackFromLegacyToggle
    ),
    guiAdaptationEnabled: normalizeGuiAdaptationEnabled(
      payload.guiAdaptationEnabled,
      previous.guiAdaptationEnabled
    ),
    lastUpdatedAt: nowIso(),
  };
}

export function applyUserMessage(
  previous: PerceivedContext,
  payload: UserMessagePayload
): PerceivedContext {
  return {
    ...previous,
    lastUserMessage: {
      text: payload.text,
      stage: payload.stage,
    },
    lastUpdatedAt: nowIso(),
  };
}
