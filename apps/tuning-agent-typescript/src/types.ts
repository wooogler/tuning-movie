export const PROTOCOL_VERSION = 'mvp-0.2';

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

export interface UserMessagePayload {
  text: string;
  stage?: string;
}

export interface SnapshotStatePayload {
  sessionId: string;
  uiSpec: unknown | null;
  messageHistory: unknown[];
  toolSchema: ToolSchemaItem[];
}

export interface StateUpdatedPayload {
  source?: string;
  uiSpec: unknown | null;
  messageHistory: unknown[];
  toolSchema: ToolSchemaItem[];
}

export interface PerceivedContext {
  sessionId: string | null;
  stage: string | null;
  uiSpec: unknown | null;
  messageHistoryTail: unknown[];
  toolSchema: ToolSchemaItem[];
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
  source: 'llm' | 'rule';
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
