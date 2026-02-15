import { RelayClient } from '../runtime/relayClient';
import type { ActionOutcome, PlannedAction } from '../types';

function payloadCodeAndMessage(payload: Record<string, unknown> | undefined): Pick<ActionOutcome, 'code' | 'message'> {
  if (!payload) return {};
  const code = typeof payload.code === 'string' ? payload.code : undefined;
  const message = typeof payload.message === 'string' ? payload.message : undefined;
  return { code, message };
}

export async function executePlannedAction(
  relay: RelayClient,
  action: PlannedAction
): Promise<ActionOutcome> {
  try {
    if (action.type === 'agent.message') {
      relay.send('agent.message', action.payload);
      return { ok: true, replan: false };
    }

    const envelope = await relay.request(action.type, action.payload);
    const outcomeBase: ActionOutcome = { ok: true, replan: false };

    if (action.type === 'tool.call') {
      const payload = envelope.payload ?? {};
      const ok = payload.ok === true;
      return {
        ok,
        replan: !ok,
        ...payloadCodeAndMessage(payload),
      };
    }

    return outcomeBase;
  } catch (error) {
    return {
      ok: false,
      code: 'EXECUTION_FAILED',
      message: error instanceof Error ? error.message : 'unknown execution error',
      replan: true,
    };
  }
}
