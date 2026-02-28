import { RelayClient } from '../runtime/relayClient';
import type { ActionOutcome, PlannedAction } from '../types';

function payloadCodeAndMessage(
  payload: Record<string, unknown> | undefined
): Pick<ActionOutcome, 'code' | 'message' | 'uiSpec'> {
  if (!payload) return {};
  const code = typeof payload.code === 'string' ? payload.code : undefined;
  const message = typeof payload.message === 'string' ? payload.message : undefined;
  const hasUiSpec = Object.prototype.hasOwnProperty.call(payload, 'uiSpec');
  const uiSpec = hasUiSpec ? payload.uiSpec : undefined;
  return { code, message, uiSpec };
}

function classifyExecutionError(error: unknown): Pick<ActionOutcome, 'code' | 'message'> {
  const message = error instanceof Error ? error.message : String(error);
  const codeMatch = message.match(/^([A-Z_]+):\s*(.+)$/);
  if (codeMatch) {
    return {
      code: codeMatch[1],
      message: codeMatch[2],
    };
  }
  return {
    code: 'EXECUTION_FAILED',
    message,
  };
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
    const classified = classifyExecutionError(error);
    return {
      ok: false,
      code: classified.code,
      message: classified.message,
      replan: true,
    };
  }
}
