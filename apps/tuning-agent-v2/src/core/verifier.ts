import type { ActionOutcome, PlannedAction } from '../types';

export function shouldResync(action: PlannedAction, outcome: ActionOutcome): boolean {
  if (!outcome.ok) return true;
  if (action.type !== 'tool.call') return false;

  const toolName =
    typeof action.payload.toolName === 'string' ? action.payload.toolName : '';

  // Stage navigation tools are asynchronous on host side.
  // Prefer waiting for host-driven state.updated to avoid snapshot races
  // where stale stage data causes duplicate planning turns.
  if (toolName === 'next' || toolName === 'prev') {
    return false;
  }

  return false;
}
