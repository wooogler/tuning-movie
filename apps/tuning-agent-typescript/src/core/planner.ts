import { chooseItemWithOpenAI } from '../llm/openaiResponses';
import type { AgentMemory } from './memory';
import {
  getEnabledVisibleItems,
  getSelectedId,
  getSelectedListIds,
  getTicketMaxTotal,
  getTicketQuantities,
  toUISpecLike,
  type DisplayItemLike,
} from './uiModel';
import type { PerceivedContext, PlannedAction, ToolSchemaItem } from '../types';

type Stage = 'movie' | 'theater' | 'date' | 'time' | 'seat' | 'ticket' | 'confirm';

function containsEndIntent(text: string): boolean {
  const normalized = text.toLowerCase();
  return normalized.includes('end') || normalized.includes('finish') || normalized.includes('종료');
}

function hasTool(toolSchema: ToolSchemaItem[], toolName: string): boolean {
  return toolSchema.some((tool) => tool.name === toolName);
}

function toStage(raw: string | null): Stage | null {
  switch (raw) {
    case 'movie':
    case 'theater':
    case 'date':
    case 'time':
    case 'seat':
    case 'ticket':
    case 'confirm':
      return raw;
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

function parseHour(value: string): number | null {
  const match = value.match(/(\d{1,2}):(\d{2})\s*([ap]m)?/i);
  if (!match) return null;

  let hour = Number(match[1]);
  if (!Number.isFinite(hour)) return null;
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return hour;
}

function chooseByPreference(candidates: DisplayItemLike[], preference: string): DisplayItemLike {
  const normalized = preference.toLowerCase();
  if (!normalized) return candidates[0];

  if (normalized.includes('latest') || normalized.includes('last') || normalized.includes('늦')) {
    return [...candidates].reverse()[0];
  }

  if (normalized.includes('earliest') || normalized.includes('early') || normalized.includes('빠')) {
    return candidates[0];
  }

  const withHour = candidates
    .map((item) => ({ item, hour: parseHour(item.value) }))
    .filter((entry): entry is { item: DisplayItemLike; hour: number } => entry.hour !== null);

  if (withHour.length === 0) return candidates[0];

  if (
    normalized.includes('evening') ||
    normalized.includes('night') ||
    normalized.includes('저녁') ||
    normalized.includes('밤')
  ) {
    const preferred = withHour.find((entry) => entry.hour >= 17);
    return preferred ? preferred.item : withHour[withHour.length - 1].item;
  }

  if (normalized.includes('afternoon') || normalized.includes('오후')) {
    const preferred = withHour.find((entry) => entry.hour >= 12 && entry.hour < 17);
    return preferred ? preferred.item : withHour[0].item;
  }

  if (normalized.includes('morning') || normalized.includes('오전') || normalized.includes('아침')) {
    const preferred = withHour.find((entry) => entry.hour < 12);
    return preferred ? preferred.item : withHour[0].item;
  }

  return candidates[0];
}

function containsBookingConfirmed(messages: unknown[]): boolean {
  const tail = messages.slice(-10);
  return tail.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const record = entry as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : '';
    const label = typeof record.label === 'string' ? record.label : '';
    return type === 'user' && label.toLowerCase().includes('booking confirmed');
  });
}

async function chooseSelectableItem(
  stage: Stage,
  candidates: DisplayItemLike[],
  preference: string
): Promise<DisplayItemLike> {
  if (candidates.length === 1) return candidates[0];

  // Rule-based baseline first.
  const ruleChoice = stage === 'time' ? chooseByPreference(candidates, preference) : candidates[0];

  // OpenAI is optional and only used for select stages where alternatives exist.
  if (candidates.length <= 1) return ruleChoice;

  try {
    const llmChoice = await chooseItemWithOpenAI({
      stage,
      preference,
      candidates: candidates.slice(0, 40).map((item) => ({
        id: item.id,
        value: item.value,
      })),
    });
    if (!llmChoice) return ruleChoice;

    const matched = candidates.find((item) => item.id === llmChoice.itemId);
    return matched ?? ruleChoice;
  } catch {
    return ruleChoice;
  }
}

export async function planNextAction(
  context: PerceivedContext,
  memory: AgentMemory
): Promise<PlannedAction | null> {
  if (!context.sessionId) return null;

  const recentFailures = memory.countRecentFailures(context.stage);
  if (recentFailures >= 3) {
    const alreadyWarned = context.messageHistoryTail
      .slice(-3)
      .some((entry) => {
        if (!entry || typeof entry !== 'object') return false;
        const record = entry as Record<string, unknown>;
        if (record.type !== 'agent') return false;
        const text = typeof record.text === 'string' ? record.text : '';
        return text.includes('I am blocked');
      });

    if (alreadyWarned) return null;

    return {
      type: 'agent.message',
      reason: 'Repeated failures; switch to explicit user-facing status update.',
      payload: {
        text: `I am blocked at stage "${context.stage ?? 'unknown'}". Please adjust input or ask for manual intervention.`,
      },
    };
  }

  if (context.lastUserMessage && containsEndIntent(context.lastUserMessage.text)) {
    return {
      type: 'session.end',
      reason: 'User requested to end the session.',
      payload: { reason: 'user-requested' },
    };
  }

  const stage = toStage(context.stage);
  const spec = toUISpecLike(context.uiSpec);
  if (!stage || !spec) return null;

  const canSelect = hasTool(context.toolSchema, 'select');
  const canSetQuantity = hasTool(context.toolSchema, 'setQuantity');
  const canNext = hasTool(context.toolSchema, 'next');

  const preferenceText = context.lastUserMessage?.text ?? '';

  if (stage === 'confirm') {
    if (containsBookingConfirmed(context.messageHistoryTail)) {
      return {
        type: 'session.end',
        reason: 'Booking confirmation detected; ending session.',
        payload: { reason: 'booking-complete' },
      };
    }
    if (canNext) {
      return toolCall('next', {}, 'Submit confirmation at final stage.');
    }
    return null;
  }

  if (stage === 'ticket') {
    const quantities = getTicketQuantities(spec);
    const maxTotal = getTicketMaxTotal(spec);
    const total = quantities.reduce((sum, quantity) => sum + quantity.count, 0);

    if (canSetQuantity && maxTotal > 0 && total !== maxTotal) {
      const targetTypeId =
        quantities[0]?.typeId ??
        getEnabledVisibleItems(spec)[0]?.id;

      if (targetTypeId) {
        const nonTargetWithCount = quantities.find(
          (quantity) => quantity.typeId !== targetTypeId && quantity.count > 0
        );
        if (nonTargetWithCount) {
          return toolCall(
            'setQuantity',
            { typeId: nonTargetWithCount.typeId, quantity: 0 },
            `Reset non-primary ticket type "${nonTargetWithCount.typeId}" to 0.`
          );
        }

        return toolCall(
          'setQuantity',
          { typeId: targetTypeId, quantity: maxTotal },
          `Set ticket quantity to match selected seats (${maxTotal}).`
        );
      }
    }

    if (canNext && maxTotal > 0 && total === maxTotal) {
      return toolCall('next', {}, 'Proceed after ticket quantities satisfy seat count.');
    }
    return null;
  }

  if (stage === 'seat') {
    const selectedIds = new Set(getSelectedListIds(spec));
    if (selectedIds.size === 0 && canSelect) {
      const candidates = getEnabledVisibleItems(spec).filter((item) => !selectedIds.has(item.id));
      if (candidates.length > 0) {
        const chosen = await chooseSelectableItem(stage, candidates, preferenceText);
        return toolCall('select', { itemId: chosen.id }, `Select seat "${chosen.value}" to continue.`);
      }
    }

    if (canNext && selectedIds.size > 0) {
      return toolCall('next', {}, 'Proceed after selecting at least one seat.');
    }

    return null;
  }

  const selectedId = getSelectedId(spec);
  if (!selectedId && canSelect) {
    const candidates = getEnabledVisibleItems(spec);
    if (candidates.length > 0) {
      const chosen = await chooseSelectableItem(stage, candidates, preferenceText);
      return toolCall('select', { itemId: chosen.id }, `Select "${chosen.value}" to progress at ${stage} stage.`);
    }
  }

  if (canNext && selectedId) {
    return toolCall('next', {}, `Proceed to next stage after ${stage} selection.`);
  }

  return null;
}
