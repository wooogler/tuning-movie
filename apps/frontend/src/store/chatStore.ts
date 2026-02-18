import { create } from 'zustand';
import type { Stage, UISpec } from '../spec';

// =============================================================================
// Message Types
// =============================================================================

interface BaseMessage {
  id: string;
  timestamp: number;
  stage: Stage;
}

export interface SystemMessageAnnotation {
  kind: 'tool-modification';
  toolName: string;
  reason: string;
  source: 'agent' | 'devtools';
}

export interface AgentMessageActionTag {
  toolName: 'next' | 'prev';
  reason: string;
  source: 'agent' | 'devtools';
}

export interface SystemMessage extends BaseMessage {
  type: 'system';
  spec: UISpec;
  annotation?: SystemMessageAnnotation;
}

export interface UserMessage extends BaseMessage {
  type: 'user';
  action: 'select' | 'back' | 'input';
  label: string;
}

export interface AgentMessage extends BaseMessage {
  type: 'agent';
  text: string;
  actionTag?: AgentMessageActionTag;
}

export type ChatMessage = SystemMessage | UserMessage | AgentMessage;

// =============================================================================
// Store State & Actions
// =============================================================================

interface ChatState {
  messages: ChatMessage[];
  currentStage: Stage;
  activeSpec: UISpec | null;
}

interface ChatActions {
  /** Add a new system message with stage spec */
  addSystemMessage: (stage: Stage, spec: UISpec, annotation?: SystemMessageAnnotation) => void;

  /** Add user message (selection/back/input) */
  addUserMessage: (stage: Stage, action: 'select' | 'back' | 'input', label: string) => void;

  /** Add agent explanation message */
  addAgentMessage: (stage: Stage, text: string) => void;

  /** Attach tool-action tag to the latest agent message in the stage */
  annotateLastAgentMessage: (stage: Stage, actionTag: AgentMessageActionTag) => void;

  /** Update the active spec (for selections/modifications) */
  updateActiveSpec: (spec: UISpec) => void;

  /** Set current stage */
  setCurrentStage: (stage: Stage) => void;

  /** Reset chat to initial state */
  reset: () => void;
}

// =============================================================================
// Stage Order
// =============================================================================

export const STAGE_ORDER: Stage[] = [
  'movie',
  'theater',
  'date',
  'time',
  'seat',
  'ticket',
  'confirm',
];

export function getNextStage(current: Stage): Stage | null {
  const index = STAGE_ORDER.indexOf(current);
  if (index === -1 || index === STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[index + 1];
}

export function getPrevStage(current: Stage): Stage | null {
  const index = STAGE_ORDER.indexOf(current);
  if (index <= 0) return null;
  return STAGE_ORDER[index - 1];
}

// =============================================================================
// Store
// =============================================================================

const initialState: ChatState = {
  messages: [],
  currentStage: 'movie',
  activeSpec: null,
};

export const useChatStore = create<ChatState & ChatActions>((set) => ({
  ...initialState,

  addSystemMessage: (stage, spec, annotation) => {
    const message: SystemMessage = {
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'system',
      timestamp: Date.now(),
      stage,
      spec,
      annotation,
    };

    set((state) => ({
      messages: [...state.messages, message],
      currentStage: stage,
      activeSpec: spec,
    }));
  },

  addUserMessage: (stage, action, label) => {
    const message: UserMessage = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'user',
      timestamp: Date.now(),
      stage,
      action,
      label,
    };

    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  addAgentMessage: (stage, text) => {
    const message: AgentMessage = {
      id: `agt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'agent',
      timestamp: Date.now(),
      stage,
      text,
    };

    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  annotateLastAgentMessage: (stage, actionTag) => {
    set((state) => {
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message.type === 'agent' && message.stage === stage) {
          messages[i] = { ...message, actionTag };
          break;
        }
      }
      return { messages };
    });
  },

  updateActiveSpec: (spec) => {
    set((state) => {
      // Also update the last system message's spec for consistency
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].type === 'system') {
          messages[i] = { ...messages[i], spec } as SystemMessage;
          break;
        }
      }
      return { messages, activeSpec: spec };
    });
  },

  setCurrentStage: (stage) => set({ currentStage: stage }),

  reset: () => set(initialState),
}));
