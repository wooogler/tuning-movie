import { executePlannedAction } from './core/executor';
import { AgentMemory } from './core/memory';
import { applyStateUpdated, applyUserMessage, fromSnapshot } from './core/perception';
import { planNextAction } from './core/planner';
import { shouldResync } from './core/verifier';
import { isActionSafe } from './policies/safetyPolicy';
import { RelayClient } from './runtime/relayClient';
import type {
  PerceivedContext,
  RelayEnvelope,
  SnapshotStatePayload,
  StateUpdatedPayload,
  UserMessagePayload,
} from './types';

const relayUrl = process.env.AGENT_RELAY_URL || 'ws://localhost:3000/agent/ws';
const sessionId = process.env.AGENT_SESSION_ID || 'default';
const studyId = process.env.AGENT_STUDY_ID || 'pilot-01';
const participantId = process.env.AGENT_PARTICIPANT_ID || 'P01';

const memory = new AgentMemory();
const relay = new RelayClient({ relayUrl, sessionId, requestTimeoutMs: 12000 });

let actionInFlight = false;
let lastActionFingerprint = '';
let lastActionAt = 0;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toSnapshotPayload(value: unknown): SnapshotStatePayload {
  const payload = asRecord(value);
  return {
    sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : '',
    uiSpec: payload.uiSpec ?? null,
    messageHistory: Array.isArray(payload.messageHistory) ? payload.messageHistory : [],
    toolSchema: Array.isArray(payload.toolSchema) ? payload.toolSchema : [],
  };
}

function toStateUpdatedPayload(value: unknown): StateUpdatedPayload {
  const payload = asRecord(value);
  return {
    source: typeof payload.source === 'string' ? payload.source : undefined,
    uiSpec: payload.uiSpec ?? null,
    messageHistory: Array.isArray(payload.messageHistory) ? payload.messageHistory : [],
    toolSchema: Array.isArray(payload.toolSchema) ? payload.toolSchema : [],
  };
}

function toUserMessagePayload(value: unknown): UserMessagePayload {
  const payload = asRecord(value);
  return {
    text: typeof payload.text === 'string' ? payload.text : '',
    stage: typeof payload.stage === 'string' ? payload.stage : undefined,
  };
}

async function maybePlanAndExecute(trigger: string): Promise<void> {
  if (actionInFlight) return;

  const context = memory.getContext();
  if (!context) return;

  const action = await planNextAction(context, memory);
  if (!action) return;

  const actionFingerprint = JSON.stringify({
    stage: context.stage,
    type: action.type,
    payload: action.payload,
  });
  const now = Date.now();
  if (actionFingerprint === lastActionFingerprint && now - lastActionAt < 700) {
    return;
  }

  if (!isActionSafe(context, action)) {
    memory.addRecord({
      timestamp: new Date().toISOString(),
      stage: context.stage,
      actionType: action.type,
      ok: false,
      code: 'SAFETY_BLOCKED',
      reason: action.reason,
    });
    console.warn(`[tuning-agent-typescript] action blocked by safety policy (${trigger})`);
    return;
  }

  actionInFlight = true;
  lastActionFingerprint = actionFingerprint;
  lastActionAt = now;
  try {
    const outcome = await executePlannedAction(relay, action);
    memory.addRecord({
      timestamp: new Date().toISOString(),
      stage: context.stage,
      actionType: action.type,
      ok: outcome.ok,
      code: outcome.code,
      reason: action.reason,
    });

    if (shouldResync(action, outcome)) {
      await relay.request('snapshot.get', {});
    }

    if (action.type === 'session.end' && outcome.ok) {
      relay.close();
      process.exit(0);
    }
  } catch (error) {
    console.error(
      `[tuning-agent-typescript] execute failed: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    actionInFlight = false;
  }
}

function upsertContext(next: PerceivedContext): void {
  memory.setContext(next);
}

async function handleInbound(envelope: RelayEnvelope): Promise<void> {
  switch (envelope.type) {
    case 'snapshot.state': {
      const snapshot = toSnapshotPayload(envelope.payload);
      upsertContext(fromSnapshot(snapshot));
      await maybePlanAndExecute('snapshot.state');
      return;
    }
    case 'state.updated': {
      const current = memory.getContext();
      if (!current) return;
      upsertContext(applyStateUpdated(current, toStateUpdatedPayload(envelope.payload)));
      await maybePlanAndExecute('state.updated');
      return;
    }
    case 'user.message': {
      const current = memory.getContext();
      if (!current) return;
      const userMessage = toUserMessagePayload(envelope.payload);
      if (!userMessage.text) return;
      upsertContext(applyUserMessage(current, userMessage));
      await maybePlanAndExecute('user.message');
      return;
    }
    case 'session.ended': {
      relay.close();
      process.exit(0);
    }
    default:
      return;
  }
}

async function main(): Promise<void> {
  relay.messages.subscribe(handleInbound);
  await relay.connect();
  await relay.request('session.start', { studyId, participantId });
  await relay.request('snapshot.get', {});

  console.log(`[tuning-agent-typescript] connected to ${relayUrl} (sessionId=${sessionId})`);
}

process.on('SIGINT', () => {
  relay.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  relay.close();
  process.exit(0);
});

void main().catch((error) => {
  console.error(`[tuning-agent-typescript] fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
