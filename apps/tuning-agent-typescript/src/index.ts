import { executePlannedAction } from './core/executor';
import { AgentMemory } from './core/memory';
import { applyStateUpdated, applyUserMessage, fromSnapshot } from './core/perception';
import { planNextAction } from './core/planner';
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
const studyId = process.env.AGENT_STUDY_ID || 'pilot-01';
const participantId = process.env.AGENT_PARTICIPANT_ID || 'P01';
const monitorPort = Number(process.env.AGENT_MONITOR_PORT || 3500);

const memory = new AgentMemory();
const relay = new RelayClient({ relayUrl, sessionId, requestTimeoutMs: 12000 });
const monitor = new AgentMonitorServer({ port: monitorPort, relayUrl, sessionId });

let actionInFlight = false;
let lastActionFingerprint = '';
let lastActionAt = 0;
let ensureSessionReadyInFlight: Promise<void> | null = null;
let connectedOnce = false;
const userMessageQueue: UserMessagePayload[] = [];
let pendingExecutionAction: import('./types').PlannedAction | null = null;

const RETRY_DELAY_MS = 1200;

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

function getToolName(action: import('./types').PlannedAction): string {
  if (action.type !== 'tool.call') return action.type;
  return typeof action.payload.toolName === 'string' ? action.payload.toolName : 'tool.call';
}

function isExecutionToolName(toolName: string): boolean {
  return toolName === 'select' || toolName === 'next' || toolName === 'prev' || toolName === 'setQuantity';
}

function isExecutionAction(action: import('./types').PlannedAction): boolean {
  if (action.type !== 'tool.call') return false;
  const toolName = getToolName(action);
  return isExecutionToolName(toolName);
}

function isConfirmationIntent(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const phrases = ['yes', 'confirm', 'go ahead', 'proceed', 'do it', 'looks good', 'ok', 'okay', 'sure'];
  return phrases.some((phrase) => normalized === phrase || normalized.includes(phrase));
}

function isRejectIntent(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const phrases = ['no', 'cancel', 'stop', 'not now', "don't", 'do not'];
  return phrases.some((phrase) => normalized === phrase || normalized.includes(phrase));
}

function buildPostMessageAction(text: string): import('./types').PlannedAction {
  return {
    type: 'tool.call',
    reason: 'Explain current agent decision to the user.',
    payload: {
      toolName: 'postMessage',
      params: { text },
      reason: 'Explain current agent decision to the user.',
    },
  };
}

async function maybePostMessage(context: PerceivedContext, text: string): Promise<void> {
  if (!context.toolSchema.some((tool) => tool.name === 'postMessage')) return;
  const action = buildPostMessageAction(text);
  if (!isActionSafe(context, action)) return;
  const outcome = await executePlannedAction(relay, action);
  monitor.pushEvent('postmessage.outcome', { text, outcome });
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
        `[tuning-agent-typescript] relay connect failed, retrying in ${RETRY_DELAY_MS}ms: ${
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
        monitor.updateState({
          waitingForHost: false,
          sessionReady: true,
          phase: 'ready',
        });
        monitor.pushEvent('session.ready', { reason });

        if (!connectedOnce) {
          connectedOnce = true;
          console.log(`[tuning-agent-typescript] connected to ${relayUrl} (sessionId=${sessionId})`);
          console.log(`[tuning-agent-typescript] monitor available at http://localhost:${monitorPort}`);
        }
        return;
      } catch (error) {
        if (isSessionNotActiveError(error)) {
          monitor.updateState({
            waitingForHost: true,
            sessionReady: false,
            phase: 'waiting-host',
          });
          monitor.pushEvent('session.waiting_host', { reason });
          console.log(
            `[tuning-agent-typescript] waiting for host connection (${reason}); retrying in ${RETRY_DELAY_MS}ms`
          );
          await sleep(RETRY_DELAY_MS);
          continue;
        }

        console.warn(
          `[tuning-agent-typescript] session bootstrap failed, retrying in ${RETRY_DELAY_MS}ms: ${
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
  if (actionInFlight) return;
  if (userMessageQueue.length === 0) return;

  const context = memory.getContext();
  if (!context) return;

  const messageForTurn = userMessageQueue[0] ?? null;
  const planningContext = messageForTurn
    ? { ...context, lastUserMessage: messageForTurn }
    : context;
  const userText = messageForTurn?.text ?? '';

  monitor.updateContext(planningContext);
  monitor.updateState({ pendingUserMessages: userMessageQueue.length });
  let action: import('./types').PlannedAction | null = null;
  let decisionSource: PlanDecision['source'] = 'rule';
  let decisionExplainText = '';

  if (pendingExecutionAction && isRejectIntent(userText)) {
    const canceledTool = getToolName(pendingExecutionAction);
    pendingExecutionAction = null;
    await maybePostMessage(
      planningContext,
      `Okay, I canceled the pending ${canceledTool} action. Tell me what you want to do next.`
    );
    monitor.pushEvent('pending.execution_rejected', { toolName: canceledTool });
    userMessageQueue.shift();
    monitor.updateState({ pendingUserMessages: userMessageQueue.length });
    return;
  }

  if (pendingExecutionAction && isConfirmationIntent(userText)) {
    action = pendingExecutionAction;
    pendingExecutionAction = null;
    decisionSource = 'rule';
    decisionExplainText = `Thanks for confirming. I will now execute ${getToolName(action)}.`;
    monitor.pushEvent('pending.execution_confirmed', {
      toolName: getToolName(action),
      trigger,
    });
  }

  if (!action) {
    const decision: PlanDecision = await planNextAction(planningContext, memory, {
      executionAllowed: false,
      pendingExecutionAction,
    });
    action = decision.action;
    decisionSource = decision.source;
    decisionExplainText = decision.explainText ?? '';

    if (!action) {
      await maybePostMessage(
        planningContext,
        decision.explainText ??
          'I could not find a single valid next action from the current state. Please share your preference in a bit more detail.'
      );
      monitor.pushEvent('planner.no_action', { source: decision.source });
      userMessageQueue.shift();
      monitor.updateState({ pendingUserMessages: userMessageQueue.length });
      return;
    }

    monitor.setLastPlan(action, trigger);
    monitor.pushEvent('planner.decision', {
      source: decision.source,
      explainText: decision.explainText ?? null,
      action,
    });

    // Hard safety gate: no execution without explicit user confirmation.
    if (isExecutionAction(action)) {
      pendingExecutionAction = action;
      await maybePostMessage(
        planningContext,
        `${decision.explainText ?? `I can execute ${getToolName(action)} next.`} Please confirm to proceed.`
      );
      monitor.pushEvent('pending.execution_proposed', {
        toolName: getToolName(action),
        reason: action.reason,
      });
      userMessageQueue.shift();
      monitor.updateState({ pendingUserMessages: userMessageQueue.length });
      return;
    }
  } else {
    monitor.setLastPlan(action, trigger);
    monitor.pushEvent('planner.decision', {
      source: decisionSource,
      explainText: decisionExplainText || null,
      action,
    });
  }

  const actionFingerprint = JSON.stringify({
    stage: planningContext.stage,
    type: action.type,
    payload: action.payload,
  });
  const now = Date.now();
  if (actionFingerprint === lastActionFingerprint && now - lastActionAt < 700) {
    userMessageQueue.shift();
    monitor.updateState({ pendingUserMessages: userMessageQueue.length });
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
    console.warn(`[tuning-agent-typescript] action blocked by safety policy (${trigger})`);
    userMessageQueue.shift();
    monitor.updateState({ pendingUserMessages: userMessageQueue.length });
    return;
  }

  actionInFlight = true;
  monitor.updateState({ actionInFlight: true, phase: 'executing-action' });
  lastActionFingerprint = actionFingerprint;
  lastActionAt = now;
  let consumedTurn = false;
  try {
    if (action.type !== 'tool.call' || getToolName(action) !== 'postMessage') {
      await maybePostMessage(
        planningContext,
        decisionExplainText || `I will run ${getToolName(action)} next. Reason: ${action.reason}`
      );
    }

    const outcome = await executePlannedAction(relay, action);
    monitor.setLastOutcome(outcome);
    monitor.pushEvent('action.outcome', { action, outcome });

    if (!outcome.ok && outcome.code === 'SESSION_NOT_ACTIVE') {
      monitor.updateState({ sessionReady: false, waitingForHost: true, phase: 'waiting-host' });
      await maybePostMessage(
        planningContext,
        'The host connection is not ready yet. I will retry once the host is available.'
      );
      await ensureSessionReady('runtime-action');
      userMessageQueue.shift();
      consumedTurn = true;
      monitor.updateState({ pendingUserMessages: userMessageQueue.length });
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

    if (!outcome.ok) {
      await maybePostMessage(
        planningContext,
        `The action failed (${outcome.code ?? 'UNKNOWN'}). ${outcome.message ?? 'Please try again.'}`
      );
    }

    if (shouldResync(action, outcome)) {
      monitor.pushEvent('state.resync_requested', {
        reason: outcome.ok ? 'policy' : 'error',
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

    // Core policy: one actionable step per user message.
    userMessageQueue.shift();
    consumedTurn = true;
    monitor.updateState({ pendingUserMessages: userMessageQueue.length });
  } catch (error) {
    monitor.pushEvent('action.exception', {
      message: error instanceof Error ? error.message : String(error),
    });
    console.error(
      `[tuning-agent-typescript] execute failed: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    if (!consumedTurn && userMessageQueue[0] === messageForTurn) {
      userMessageQueue.shift();
      monitor.updateState({ pendingUserMessages: userMessageQueue.length });
    }
    actionInFlight = false;
    monitor.updateState({ actionInFlight: false, phase: 'ready' });
  }
}

function upsertContext(next: PerceivedContext): void {
  memory.setContext(next);
}

async function handleInbound(envelope: RelayEnvelope): Promise<void> {
  monitor.pushEvent('relay.inbound', {
    type: envelope.type,
    replyTo: envelope.replyTo,
  });

  switch (envelope.type) {
    case 'snapshot.state': {
      const snapshot = toSnapshotPayload(envelope.payload);
      upsertContext(fromSnapshot(snapshot));
      monitor.updateContext(memory.getContext());
      await maybePlanAndExecute('snapshot.state');
      return;
    }
    case 'state.updated': {
      const current = memory.getContext();
      if (!current) return;
      upsertContext(applyStateUpdated(current, toStateUpdatedPayload(envelope.payload)));
      monitor.updateContext(memory.getContext());
      await maybePlanAndExecute('state.updated');
      return;
    }
    case 'user.message': {
      const current = memory.getContext();
      if (!current) return;
      const userMessage = toUserMessagePayload(envelope.payload);
      if (!userMessage.text) return;
      userMessageQueue.push(userMessage);
      upsertContext(applyUserMessage(current, userMessage));
      monitor.updateContext(memory.getContext());
      monitor.updateState({ pendingUserMessages: userMessageQueue.length });
      await maybePlanAndExecute('user.message');
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
  monitor.pushEvent('runtime.start', {
    relayUrl,
    sessionId,
    monitorPort,
  });

  relay.messages.subscribe(handleInbound);
  await ensureSessionReady('startup');
}

process.on('SIGINT', () => {
  monitor.pushEvent('runtime.signal', { signal: 'SIGINT' });
  relay.close();
  monitor.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  monitor.pushEvent('runtime.signal', { signal: 'SIGTERM' });
  relay.close();
  monitor.close();
  process.exit(0);
});

void main().catch((error) => {
  monitor.pushEvent('runtime.fatal', {
    message: error instanceof Error ? error.message : String(error),
  });
  monitor.close();
  console.error(`[tuning-agent-typescript] fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
