import { planActionWithOpenAI, type PlannerWorkflow } from '../llm/openaiPlanner';
import { planActionWithGemini } from '../llm/geminiPlanner';
import type { AgentMemory } from './memory';
import {
  getEnabledVisibleItems,
  getSelectedId,
  getSelectedListIds,
  getTicketMaxTotal,
  getTicketQuantities,
  toUISpecLike,
  type DisplayItemLike,
  type UISpecLike,
} from './uiModel';
import type { PerceivedContext, PlanDecision, PlannedAction, ToolSchemaItem } from '../types';

type Stage = 'movie' | 'theater' | 'date' | 'time' | 'seat' | 'ticket' | 'confirm';
const STAGE_ORDER: Stage[] = ['movie', 'theater', 'date', 'time', 'seat', 'ticket', 'confirm'];

function containsEndIntent(text: string): boolean {
  const normalized = text.toLowerCase();
  const englishEndIntent = /\b(end|finish|quit|exit|stop)\b/u;
  const koreanEndIntent = /(종료|끝내|끝낼|그만|마칠)/u;
  return englishEndIntent.test(normalized) || koreanEndIntent.test(text);
}

function hasTool(toolSchema: ToolSchemaItem[], toolName: string): boolean {
  return toolSchema.some((tool) => tool.name === toolName);
}

function getPlannerToolSchema(toolSchema: ToolSchemaItem[]): ToolSchemaItem[] {
  // Treat conversational text as assistant response (agent.message), not as a UI tool.
  return toolSchema.filter((tool) => tool.name !== 'postMessage');
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

function stageGoal(stage: Stage): string {
  switch (stage) {
    case 'movie':
      return 'Pick one movie title.';
    case 'theater':
      return 'Pick one theater for the selected movie.';
    case 'date':
      return 'Pick one date for the selected movie and theater.';
    case 'time':
      return 'Pick one showtime.';
    case 'seat':
      return 'Select one or more seats.';
    case 'ticket':
      return 'Set ticket quantities to match selected seat count.';
    case 'confirm':
      return 'Submit confirmation to finalize booking.';
    default:
      return 'Make progress to the next stage.';
  }
}

function stageTransition(stage: Stage): { previousStage: Stage | null; nextStage: Stage | null } {
  const index = STAGE_ORDER.indexOf(stage);
  if (index < 0) return { previousStage: null, nextStage: null };
  return {
    previousStage: index > 0 ? STAGE_ORDER[index - 1] : null,
    nextStage: index < STAGE_ORDER.length - 1 ? STAGE_ORDER[index + 1] : null,
  };
}

function buildWorkflowContext(
  context: PerceivedContext,
  stage: Stage,
  spec: UISpecLike,
  plannerTools: ToolSchemaItem[]
): PlannerWorkflow {
  const selectedId = getSelectedId(spec);
  const selectedListCount = getSelectedListIds(spec).length;
  const quantities = getTicketQuantities(spec);
  const ticketTotal = quantities.reduce((sum, quantity) => sum + quantity.count, 0);
  const ticketMaxTotal = getTicketMaxTotal(spec);
  const canNext = hasTool(plannerTools, 'next');
  const { previousStage, nextStage } = stageTransition(stage);

  const guardrails: string[] = [
    'Choose exactly one action for this turn.',
    'Do not call tools outside availableToolNames.',
  ];
  let proceedRule = 'Only advance stage when required selections are complete.';

  if (stage === 'seat') {
    proceedRule = `Call next only if selectedListCount > 0 (current: ${selectedListCount}).`;
  } else if (stage === 'ticket') {
    proceedRule = `Call next only when ticketTotal equals ticketMaxTotal and ticketMaxTotal > 0 (current: ${ticketTotal}/${ticketMaxTotal}).`;
  } else if (stage === 'confirm') {
    const bookingConfirmed = containsBookingConfirmed(context.messageHistoryTail);
    proceedRule = bookingConfirmed
      ? 'Booking confirmation detected; end session.'
      : `Submit confirmation when ready (next available: ${String(canNext)}).`;
  } else {
    proceedRule = `Call next only when selectedId exists (current: ${selectedId ?? 'null'}).`;
  }

  return {
    stageOrder: STAGE_ORDER,
    currentStage: stage,
    previousStage,
    nextStage,
    stageGoal: stageGoal(stage),
    proceedRule,
    availableToolNames: plannerTools.map((tool) => tool.name),
    guardrails,
  };
}

function buildPlannerHistory(
  context: PerceivedContext
): unknown[] {
  // Pass frontend messageHistory through as-is so the LLM sees exactly what users see.
  return context.messageHistoryTail.slice();
}

function validateLlmAction(
  context: PerceivedContext,
  spec: UISpecLike,
  decision: {
    assistantMessage: string;
    action: {
      type: 'tool.call' | 'none';
      toolName: string;
      params: Record<string, unknown>;
      reason: string;
    };
  }
): PlanDecision | null {
  const explainText = decision.assistantMessage || undefined;
  if (decision.action.type === 'none') {
    return {
      action: null,
      explainText,
      source: 'llm',
    };
  }

  const toolName = decision.action.toolName;

  if (toolName === 'postMessage') {
    const text = typeof decision.action.params.text === 'string' ? decision.action.params.text.trim() : '';
    return {
      action: {
        type: 'agent.message',
        reason: decision.action.reason,
        payload: {
          text: text || explainText || decision.action.reason,
        },
      },
      explainText,
      source: 'llm',
    };
  }

  if (!toolName || !hasTool(context.toolSchema, toolName)) return null;

  const params = decision.action.params ?? {};

  if (toolName === 'select') {
    const itemId = typeof params.itemId === 'string' ? params.itemId : '';
    if (!itemId) return null;
    const selectable = new Set(getEnabledVisibleItems(spec).map((item) => item.id));
    if (!selectable.has(itemId)) return null;
  }

  if (toolName === 'setQuantity') {
    const typeId = typeof params.typeId === 'string' ? params.typeId : '';
    const quantity = params.quantity;
    if (!typeId || !Number.isInteger(quantity) || Number(quantity) < 0) return null;
  }

  return {
    action: toolCall(toolName, params, decision.action.reason),
    explainText,
    source: 'llm',
  };
}

function fallbackDecision(
  context: PerceivedContext,
  stage: Stage,
  spec: UISpecLike,
  fallbackReason: string
): PlanDecision {
  const canSelect = hasTool(context.toolSchema, 'select');
  const canSetQuantity = hasTool(context.toolSchema, 'setQuantity');
  const canNext = hasTool(context.toolSchema, 'next');
  const preferenceText = context.lastUserMessage?.text ?? '';

  if (stage === 'confirm') {
    if (containsBookingConfirmed(context.messageHistoryTail)) {
      return {
        action: {
          type: 'session.end',
          reason: 'Booking confirmation detected; ending session.',
          payload: { reason: 'booking-complete' },
        },
        explainText: 'Booking appears to be complete, so I will end this session.',
        source: 'rule',
        fallbackReason,
      };
    }
    if (canNext) {
      return {
        action: toolCall('next', {}, 'Submit confirmation at final stage.'),
        explainText: 'I will submit the confirmation step to complete the booking.',
        source: 'rule',
        fallbackReason,
      };
    }
  }

  if (stage === 'ticket') {
    const quantities = getTicketQuantities(spec);
    const maxTotal = getTicketMaxTotal(spec);
    const total = quantities.reduce((sum, quantity) => sum + quantity.count, 0);

    if (canSetQuantity && maxTotal > 0 && total !== maxTotal) {
      const targetTypeId = quantities[0]?.typeId ?? getEnabledVisibleItems(spec)[0]?.id;
      if (targetTypeId) {
        return {
          action: toolCall(
            'setQuantity',
            { typeId: targetTypeId, quantity: maxTotal },
            `Set ticket quantity to match selected seats (${maxTotal}).`
          ),
          explainText: `I will adjust ticket quantity to match the selected seats (${maxTotal}).`,
          source: 'rule',
          fallbackReason,
        };
      }
    }
    if (canNext && maxTotal > 0 && total === maxTotal) {
      return {
        action: toolCall('next', {}, 'Proceed after ticket quantities satisfy seat count.'),
        explainText: 'Ticket quantity is valid, so I will proceed to the next step.',
        source: 'rule',
        fallbackReason,
      };
    }
  }

  if (stage === 'seat') {
    const selectedIds = new Set(getSelectedListIds(spec));
    if (selectedIds.size === 0 && canSelect) {
      const candidates = getEnabledVisibleItems(spec).filter((item) => !selectedIds.has(item.id));
      if (candidates.length > 0) {
        const chosen = chooseByPreference(candidates, preferenceText);
        return {
          action: toolCall('select', { itemId: chosen.id }, `Select seat "${chosen.value}" to continue.`),
          explainText: `I will first select seat "${chosen.value}".`,
          source: 'rule',
          fallbackReason,
        };
      }
    }
    if (canNext && selectedIds.size > 0) {
      return {
        action: toolCall('next', {}, 'Proceed after selecting at least one seat.'),
        explainText: 'Seat selection is complete, so I will continue.',
        source: 'rule',
        fallbackReason,
      };
    }
  }

  const selectedId = getSelectedId(spec);
  if (!selectedId && canSelect) {
    const candidates = getEnabledVisibleItems(spec);
    if (candidates.length > 0) {
      const chosen = stage === 'time' ? chooseByPreference(candidates, preferenceText) : candidates[0];
      return {
        action: toolCall('select', { itemId: chosen.id }, `Select "${chosen.value}" to progress at ${stage} stage.`),
        explainText: `I will select "${chosen.value}" to prepare the next step.`,
        source: 'rule',
        fallbackReason,
      };
    }
  }

  if (canNext && selectedId) {
    return {
      action: toolCall('next', {}, `Proceed to next stage after ${stage} selection.`),
      explainText: 'Selection is complete, so I will move to the next stage.',
      source: 'rule',
      fallbackReason,
    };
  }

  return {
    action: null,
    explainText: 'I could not find a valid action in the current state. Please share a bit more detail about your preference.',
    source: 'rule',
    fallbackReason,
  };
}

export async function planNextAction(
  context: PerceivedContext,
  memory: AgentMemory
): Promise<PlanDecision> {
  if (!context.sessionId) {
    return { action: null, source: 'rule', fallbackReason: 'NO_SESSION' };
  }

  if (context.lastUserMessage && containsEndIntent(context.lastUserMessage.text)) {
    return {
      action: {
        type: 'session.end',
        reason: 'User requested to end the session.',
        payload: { reason: 'user-requested' },
      },
      explainText: 'I will end the session as requested.',
      source: 'rule',
      fallbackReason: 'USER_REQUESTED_END',
    };
  }

  const recentFailures = memory.countRecentFailures(context.stage);
  if (recentFailures >= 3) {
    return {
      action: null,
      explainText:
        'I am seeing repeated failures at this stage. Please provide more specific preferences and I will try again.',
      source: 'rule',
      fallbackReason: 'REPEATED_FAILURES_GUARD',
    };
  }

  const stage = toStage(context.stage);
  const spec = toUISpecLike(context.uiSpec);
  if (!stage || !spec) {
    return { action: null, source: 'rule', fallbackReason: 'INVALID_STAGE_OR_SPEC' };
  }

  let fallbackReason = 'RULE_FALLBACK';
  const userRequest = context.lastUserMessage?.text ?? '';
  if (!userRequest.trim()) {
    return {
      action: null,
      explainText: 'Please tell me what you want to do, and I will proceed step by step.',
      source: 'rule',
      fallbackReason: 'EMPTY_USER_REQUEST',
    };
  }

  const geminiEnabled =
    process.env.AGENT_ENABLE_GEMINI !== 'false' && Boolean(process.env.GEMINI_API_KEY);
  const openaiEnabled =
    process.env.AGENT_ENABLE_OPENAI !== 'false' && Boolean(process.env.OPENAI_API_KEY);

  if (!geminiEnabled && !openaiEnabled) {
    fallbackReason = 'LLM_DISABLED_NO_PROVIDER';
  }

  try {
    if (geminiEnabled || openaiEnabled) {
      const plannerTools = getPlannerToolSchema(context.toolSchema);
      const plannerInput = {
        history: buildPlannerHistory(context),
        availableTools: plannerTools,
        workflow: buildWorkflowContext(context, stage, spec, plannerTools),
      };

      const llm = geminiEnabled
        ? await planActionWithGemini(plannerInput)
        : await planActionWithOpenAI(plannerInput);

      if (!llm) {
        fallbackReason = 'LLM_EMPTY_OR_UNPARSEABLE_OUTPUT';
      } else {
        const validated = validateLlmAction(context, spec, llm);
        if (validated) return validated;
        fallbackReason = 'LLM_VALIDATION_REJECTED';
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fallbackReason = `LLM_REQUEST_FAILED:${message}`;
    // Fail open to deterministic fallback for runtime resilience.
  }

  return fallbackDecision(context, stage, spec, fallbackReason);
}
