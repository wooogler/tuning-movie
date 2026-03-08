export const PROTOCOL_VERSION = 'mvp-0.2';
export const CONFLICT_STAGES = ['movie', 'theater', 'date', 'time', 'seat', 'confirm'] as const;

export interface RelayEnvelope {
  v?: string;
  type: string;
  id?: string;
  replyTo?: string;
  payload?: Record<string, unknown>;
}

export interface ToolSchemaItem {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  params?: unknown;
}

export type ConflictStage = (typeof CONFLICT_STAGES)[number];

export interface Preference {
  id: string;
  description: string;
  strength: 'hard' | 'soft';
  relevantStages: ConflictStage[];
}

export interface ConflictScope {
  stage: ConflictStage;
  movie?: string;
  theater?: string;
  date?: string;
  showing?: string;
}

export interface ActiveConflict {
  id: string;
  preferenceIds: string[];
  scope: ConflictScope;
  severity: 'blocking' | 'soft';
  reason: string;
}

export interface DeadEnd {
  id: string;
  preferenceIds: string[];
  scope: ConflictScope;
  reason: string;
  createdAt: string;
  lastSeenAt: string;
  count: number;
}

export interface UserMessagePayload {
  text: string;
  stage?: string;
}

export interface SnapshotStatePayload {
  sessionId: string;
  uiSpec: unknown | null;
  messageHistory: unknown[];
  toolSchema: ToolSchemaItem[];
  plannerCpMemoryLimit?: number;
  plannerCpEnabled?: boolean;
  guiAdaptationEnabled?: boolean;
}

export interface StateUpdatedPayload {
  source?: string;
  uiSpec: unknown | null;
  messageHistory: unknown[];
  toolSchema: ToolSchemaItem[];
  plannerCpMemoryLimit?: number;
  plannerCpEnabled?: boolean;
  guiAdaptationEnabled?: boolean;
}

export interface PerceivedContext {
  sessionId: string | null;
  stage: string | null;
  uiSpec: unknown | null;
  messageHistoryTail: unknown[];
  toolSchema: ToolSchemaItem[];
  plannerCpMemoryLimit: number;
  guiAdaptationEnabled: boolean;
  lastUserMessage: UserMessagePayload | null;
  lastUpdatedAt: string;
}

export type PlannedActionType = 'tool.call' | 'agent.message' | 'snapshot.get' | 'session.end';

export interface PlannedAction {
  type: PlannedActionType;
  reason: string;
  payload: Record<string, unknown>;
}

export interface PlanDecision {
  action: PlannedAction | null;
  explainText?: string;
  source: 'llm' | 'rule' | 'baseline';
  fallbackReason?: string;
}

export interface ActionOutcome {
  ok: boolean;
  code?: string;
  message?: string;
  uiSpec?: unknown;
  replan: boolean;
}

export interface EpisodicRecord {
  timestamp: string;
  stage: string | null;
  actionType: PlannedActionType;
  ok: boolean;
  code?: string;
  reason: string;
}
