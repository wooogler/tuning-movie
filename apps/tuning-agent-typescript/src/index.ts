import { executePlannedAction } from './core/executor';
import { AgentMemory } from './core/memory';
import { applyStateUpdated, applyUserMessage, fromSnapshot } from './core/perception';
import { planNextAction } from './core/planner';
import { subscribeLlmTrace } from './llm/openaiPlanner';
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
const agentName = process.env.AGENT_NAME || 'tuning-agent-typescript';
const studyId = process.env.AGENT_STUDY_ID || 'pilot-01';
const participantId = process.env.AGENT_PARTICIPANT_ID || 'P01';
const monitorPort = Number(process.env.AGENT_MONITOR_PORT || 3500);
const monitorWebPort = Number(process.env.AGENT_MONITOR_WEB_PORT || 3501);

const memory = new AgentMemory();
const relay = new RelayClient({ relayUrl, sessionId, agentName, requestTimeoutMs: 12000 });
const monitor = new AgentMonitorServer({ port: monitorPort, relayUrl, sessionId });
const unsubscribeLlmTrace = subscribeLlmTrace((event) => {
  monitor.pushEvent(`llm.${event.type}`, event.payload);
});

let actionInFlight = false;
let lastActionFingerprint = '';
let lastActionAt = 0;
let ensureSessionReadyInFlight: Promise<void> | null = null;
let connectedOnce = false;
let planningInFlight = false;
let deferredReplanRequested = false;
let deferredReplanTrigger: string | null = null;
let userTurnAwaitingStateUpdate = false;

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
          console.log(`[tuning-agent-typescript] monitor API available at http://localhost:${monitorPort}`);
          console.log(`[tuning-agent-typescript] monitor UI available at http://localhost:${monitorWebPort}`);
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

  planningInFlight = true;
  monitor.updateContext(context);
  monitor.updateState({ pendingUserMessages: deferredReplanRequested ? 1 : 0 });

  try {
    const planningContext = memory.getContext() ?? context;
    const decision: PlanDecision = await planNextAction(planningContext, memory);
    const action = decision.action;
    const decisionExplainText = decision.explainText ?? '';

    if (!action) {
      if (trigger === 'user.message' || trigger === 'state.updated:user-message') {
        await maybeSendAssistantMessage(
          planningContext,
          decision.explainText ??
            'I could not find a single valid next action from the current state. Please share your preference in a bit more detail.'
        );
      }
      monitor.pushEvent('planner.no_action', {
        source: decision.source,
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
    if (actionFingerprint === lastActionFingerprint && now - lastActionAt < 700) {
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
      return;
    }

    actionInFlight = true;
    monitor.updateState({ actionInFlight: true, phase: 'executing-action' });
    lastActionFingerprint = actionFingerprint;
    lastActionAt = now;

    if (action.type !== 'agent.message') {
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
      monitor.updateState({ sessionReady: false, waitingForHost: true, phase: 'waiting-host' });
      await maybeSendAssistantMessage(
        planningContext,
        'The host connection is not ready yet. I will retry once the host is available.'
      );
      await ensureSessionReady('runtime-action');
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

    if (!outcome.ok) {
      await maybeSendAssistantMessage(
        planningContext,
        `The action failed (${outcome.code ?? 'UNKNOWN'}). ${outcome.message ?? 'Please try again.'}`
      );
    }

    const toolName =
      action.type === 'tool.call' && typeof action.payload.toolName === 'string'
        ? action.payload.toolName
        : '';
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
    console.error(
      `[tuning-agent-typescript] execute failed: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    actionInFlight = false;
    planningInFlight = false;
    monitor.updateState({ actionInFlight: false, phase: 'ready' });
    if (deferredReplanRequested) {
      const deferredTrigger = deferredReplanTrigger ?? trigger;
      deferredReplanRequested = false;
      deferredReplanTrigger = null;
      monitor.updateState({ pendingUserMessages: 0 });
      queueMicrotask(() => {
        void maybePlanAndExecute(`deferred:${deferredTrigger}`);
      });
    }
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
      const previous = memory.getContext();
      const snapshot = toSnapshotPayload(envelope.payload);
      const next = fromSnapshot(snapshot);
      if (previous?.lastUserMessage) {
        next.lastUserMessage = previous.lastUserMessage;
      }
      upsertContext(next);
      monitor.updateContext(memory.getContext());
      await maybePlanAndExecute('snapshot.state');
      return;
    }
    case 'state.updated': {
      const current = memory.getContext();
      if (!current) return;
      const next = applyStateUpdated(current, toStateUpdatedPayload(envelope.payload));
      const stageChanged = next.stage !== current.stage;
      upsertContext(next);
      monitor.updateContext(memory.getContext());

      if (userTurnAwaitingStateUpdate) {
        userTurnAwaitingStateUpdate = false;
        await maybePlanAndExecute('state.updated:user-message');
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
      if (!userMessage.text) return;
      upsertContext(applyUserMessage(current, userMessage));
      monitor.updateContext(memory.getContext());
      monitor.updateState({ pendingUserMessages: 0 });
      // Defer planning until state.updated arrives so planner history always
      // includes the newly appended timeline user message.
      userTurnAwaitingStateUpdate = true;
      monitor.pushEvent('planner.waiting_state_updated_after_user_message', {
        stage: userMessage.stage ?? null,
      });
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
  unsubscribeLlmTrace();
  relay.close();
  monitor.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  monitor.pushEvent('runtime.signal', { signal: 'SIGTERM' });
  unsubscribeLlmTrace();
  relay.close();
  monitor.close();
  process.exit(0);
});

void main().catch((error) => {
  monitor.pushEvent('runtime.fatal', {
    message: error instanceof Error ? error.message : String(error),
  });
  unsubscribeLlmTrace();
  monitor.close();
  console.error(`[tuning-agent-typescript] fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
