import type {
  PerceivedContext,
  SnapshotStatePayload,
  StateUpdatedPayload,
  ToolSchemaItem,
  UserMessagePayload,
} from '../types';

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

export function fromSnapshot(payload: SnapshotStatePayload): PerceivedContext {
  return {
    sessionId: payload.sessionId ?? null,
    stage: pickStage(payload.uiSpec),
    uiSpec: payload.uiSpec ?? null,
    messageHistoryTail: safeArray(payload.messageHistory).slice(),
    toolSchema: safeArray<ToolSchemaItem>(payload.toolSchema),
    lastUserMessage: null,
    lastUpdatedAt: nowIso(),
  };
}

export function applyStateUpdated(
  previous: PerceivedContext,
  payload: StateUpdatedPayload
): PerceivedContext {
  return {
    ...previous,
    stage: pickStage(payload.uiSpec),
    uiSpec: payload.uiSpec ?? null,
    messageHistoryTail: safeArray(payload.messageHistory).slice(),
    toolSchema: safeArray<ToolSchemaItem>(payload.toolSchema),
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
