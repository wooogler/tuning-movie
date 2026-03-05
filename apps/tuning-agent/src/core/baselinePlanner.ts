import {
  getEnabledVisibleItems,
  getSelectedId,
  getSelectedListIds,
  toUISpecLike,
} from './uiModel';
import {
  routeBaselineActionWithOpenAI,
  type BaselineRouterInput,
} from '../llm/baselineRouter';
import type { PerceivedContext, PlanDecision, PlannedAction, ToolSchemaItem } from '../types';

type Stage = 'movie' | 'theater' | 'date' | 'time' | 'seat' | 'confirm';
type BaselineToolName = 'select' | 'selectMultiple' | 'next' | 'prev' | 'startOver';

const BASELINE_STAGE_ORDER: Stage[] = ['movie', 'theater', 'date', 'time', 'seat', 'confirm'];
const ROUTABLE_TOOLS = new Set<BaselineToolName>([
  'select',
  'selectMultiple',
  'next',
  'prev',
  'startOver',
]);

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function toStage(value: string | null): Stage | null {
  switch (value) {
    case 'movie':
    case 'theater':
    case 'date':
    case 'time':
    case 'seat':
    case 'confirm':
      return value;
    default:
      return null;
  }
}

function toolCall(toolName: string, params: Record<string, unknown>, reason: string): PlannedAction {
  return {
    type: 'tool.call',
    reason,
    payload: {
      toolName,
      params,
      reason,
    },
  };
}

function repeatStepDecision(fallbackReason: string, reason?: string): PlanDecision {
  return {
    action: toolCall(
      'repeatStep',
      {},
      reason ?? 'Repeat the current step because the input did not map cleanly to one GUI action.'
    ),
    source: 'baseline',
    fallbackReason,
  };
}

function getAvailableBaselineTools(toolSchema: ToolSchemaItem[]): BaselineToolName[] {
  const deduped = new Set<BaselineToolName>();
  for (const tool of toolSchema) {
    const name = readTrimmedString(tool.name);
    if (!name) continue;
    if (!ROUTABLE_TOOLS.has(name as BaselineToolName)) continue;
    deduped.add(name as BaselineToolName);
  }
  return Array.from(deduped);
}

function stageGoal(stage: Stage): string {
  switch (stage) {
    case 'movie':
      return 'Pick one movie title.';
    case 'theater':
      return 'Pick one theater.';
    case 'date':
      return 'Pick one date.';
    case 'time':
      return 'Pick one showtime.';
    case 'seat':
      return 'Select one or more seats.';
    case 'confirm':
      return 'Confirm the booking or navigate back.';
  }
}

function stageTransition(stage: Stage): { previousStage: Stage | null; nextStage: Stage | null } {
  const index = BASELINE_STAGE_ORDER.indexOf(stage);
  if (index < 0) {
    return { previousStage: null, nextStage: null };
  }
  return {
    previousStage: index > 0 ? BASELINE_STAGE_ORDER[index - 1] : null,
    nextStage: index < BASELINE_STAGE_ORDER.length - 1 ? BASELINE_STAGE_ORDER[index + 1] : null,
  };
}

function proceedRule(
  stage: Stage,
  availableToolNames: BaselineToolName[],
  selectedId: string | null,
  selectedListCount: number
): string {
  const canNext = availableToolNames.includes('next');
  const { previousStage, nextStage } = stageTransition(stage);

  if (stage === 'seat') {
    return (
      'Use select for a single-seat toggle, or selectMultiple to replace the full selected seat set. ' +
      `Use next only when the user explicitly asks to continue and selectedListCount > 0 (current: ${selectedListCount}).`
    );
  }
  if (stage === 'confirm') {
    return `Use next only when the user clearly wants to confirm the booking. Previous stage: ${previousStage ?? 'none'}.`;
  }
  if (!canNext) {
    return `Do not use next here. Previous stage: ${previousStage ?? 'none'}. Next stage: ${nextStage ?? 'none'}.`;
  }
  return `Use next only when the user explicitly asks to continue. Current selectedId: ${selectedId ?? 'none'}.`;
}

export async function planBaselineAction(context: PerceivedContext): Promise<PlanDecision> {
  const stage = toStage(context.stage);
  if (!stage) {
    return repeatStepDecision('BASELINE_STAGE_UNAVAILABLE');
  }

  const spec = toUISpecLike(context.uiSpec);
  if (!spec) {
    return repeatStepDecision('BASELINE_UI_SPEC_UNAVAILABLE');
  }

  const userMessage = context.lastUserMessage?.text?.trim() ?? '';
  if (!userMessage) {
    return repeatStepDecision('BASELINE_USER_MESSAGE_MISSING');
  }

  const availableToolNames = getAvailableBaselineTools(context.toolSchema);
  const selectedId = getSelectedId(spec);
  const selectedListCount = getSelectedListIds(spec).length;
  const visibleItems = (Array.isArray(spec.visibleItems) ? spec.visibleItems : [])
    .map((item) => {
      const id = readTrimmedString(item?.id);
      const value = readTrimmedString(item?.value);
      if (!id || !value) return null;
      return {
        id,
        value,
        ...(item?.isDisabled === true ? { isDisabled: true } : {}),
      };
    })
    .filter((item): item is { id: string; value: string; isDisabled?: true } => item !== null);

  const enabledVisibleIds = new Set(getEnabledVisibleItems(spec).map((item) => item.id));
  const routerInput: BaselineRouterInput = {
    currentStage: stage,
    availableToolNames,
    visibleItems,
    selectedId,
    selectedListCount,
    userMessage,
    stageGoal: stageGoal(stage),
    proceedRule: proceedRule(stage, availableToolNames, selectedId, selectedListCount),
  };

  try {
    const routed = await routeBaselineActionWithOpenAI(routerInput);
    if (!routed) {
      return repeatStepDecision('BASELINE_ROUTER_INVALID_OUTPUT');
    }

    const { toolName, params, reason } = routed.action;
    if (toolName === 'none') {
      return repeatStepDecision('BASELINE_ROUTER_NONE', reason);
    }

    if (!availableToolNames.includes(toolName)) {
      return repeatStepDecision('BASELINE_TOOL_NOT_AVAILABLE', reason);
    }

    if (toolName === 'select') {
      const itemId = readTrimmedString(params.itemId);
      if (!itemId) {
        return repeatStepDecision('BASELINE_SELECT_ITEM_MISSING', reason);
      }
      if (!enabledVisibleIds.has(itemId)) {
        return repeatStepDecision('BASELINE_SELECT_ITEM_INVALID', reason);
      }
      return {
        action: toolCall('select', { itemId }, reason),
        source: 'baseline',
      };
    }

    if (toolName === 'selectMultiple') {
      if (stage !== 'seat') {
        return repeatStepDecision('BASELINE_SELECT_MULTIPLE_INVALID_STAGE', reason);
      }
      const itemIds = normalizeStringArray(params.itemIds);
      if (itemIds.length === 0) {
        return repeatStepDecision('BASELINE_SELECT_MULTIPLE_ITEMS_MISSING', reason);
      }
      if (itemIds.some((itemId) => !enabledVisibleIds.has(itemId))) {
        return repeatStepDecision('BASELINE_SELECT_MULTIPLE_ITEMS_INVALID', reason);
      }
      return {
        action: toolCall('selectMultiple', { itemIds }, reason),
        source: 'baseline',
      };
    }

    return {
      action: toolCall(toolName, {}, reason),
      source: 'baseline',
    };
  } catch (error) {
    return repeatStepDecision(
      error instanceof Error ? error.message : 'BASELINE_ROUTER_EXCEPTION'
    );
  }
}
