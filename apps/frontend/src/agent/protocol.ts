import type { ToolDefinition } from './tools';
import type { ChatMessage } from '../store/chatStore';

export const PROTOCOL_VERSION = 'mvp-0.2';

export interface RelayEnvelope {
  v?: string;
  type: string;
  id?: string;
  replyTo?: string;
  payload?: Record<string, unknown>;
}

export interface SnapshotPayload {
  sessionId: string;
  uiSpec: Record<string, unknown> | null;
  messageHistory: ChatMessage[];
  toolSchema: ToolDefinition[];
  plannerCpMemoryLimit: number;
  guiAdaptationEnabled: boolean;
}
