import type { ActionOutcome, PlannedAction } from '../types';

export function shouldResync(action: PlannedAction, outcome: ActionOutcome): boolean {
  if (!outcome.ok) return true;
  if (action.type !== 'tool.call') return false;

  const toolName =
    typeof action.payload.toolName === 'string' ? action.payload.toolName : '';

  // Stage navigation tools are asynchronous on host side.
  // Requesting a snapshot helps us recover if state.updated is delayed.
  if (toolName === 'next' || toolName === 'prev') {
    return true;
  }

  return false;
}
