import { planActionWithOpenAI, planActionWithGemini, type PlannerWorkflow } from '../llm/llmPlanner';
import { refreshModelEnvVars } from './envRefresh';
import type { AgentMemory } from './memory';
import {
  getEnabledVisibleItems,
  getSelectedId,
  getSelectedListIds,
  getTicketMaxTotal,
  getTicketQuantities,
  toUISpecLike,
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
  plannerTools: ToolSchemaItem[],
  preferences: string[],
  constraints: string[],
  conflicts: string[],
  candidates: string[]
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
    constraints,
    preferences,
    conflicts,
    candidates,
  };
}

function buildPlannerHistory(
  context: PerceivedContext
): unknown[] {
  // Pass frontend messageHistory through as-is so the LLM sees exactly what users see.
  return context.messageHistoryTail.slice();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLikelyInternalId(id: string): boolean {
  // Keep natural words untouched; mask technical ids like m1, time_2, seat-a12.
  return /[0-9_-]/.test(id);
}

function sanitizeAssistantMessage(text: string, spec: UISpecLike): string | undefined {
  let next = text.trim();
  if (!next) return undefined;

  const visibleItemIds = getEnabledVisibleItems(spec).map((item) => item.id);
  for (const id of visibleItemIds) {
    const trimmedId = id.trim();
    if (!trimmedId || !isLikelyInternalId(trimmedId)) continue;
    const escaped = escapeRegExp(trimmedId);
    next = next.replace(new RegExp(`\\(\\s*${escaped}\\s*\\)`, 'gu'), '');
    next = next.replace(new RegExp(`\\[\\s*${escaped}\\s*\\]`, 'gu'), '');
    next = next.replace(new RegExp(`\\{\\s*${escaped}\\s*\\}`, 'gu'), '');
    next = next.replace(new RegExp(`\\b${escaped}\\b`, 'gu'), '');
  }

  next = next
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/,\s*,+/g, ', ')
    .trim();

  return next || undefined;
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
  const explainText = sanitizeAssistantMessage(decision.assistantMessage, spec);
  if (decision.action.type === 'none') {
    return {
      action: null,
      explainText,
      source: 'llm',
    };
  }

  const toolName = decision.action.toolName;

  if (toolName === 'postMessage') {
    const rawText = typeof decision.action.params.text === 'string' ? decision.action.params.text.trim() : '';
    const text = sanitizeAssistantMessage(rawText, spec);
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

  const userRequest = context.lastUserMessage?.text ?? '';
  const hasUserRequest = Boolean(userRequest.trim());

  refreshModelEnvVars();

  const geminiEnabled =
    process.env.AGENT_ENABLE_GEMINI !== 'false' && Boolean(process.env.GEMINI_API_KEY);
  const openaiEnabled =
    process.env.AGENT_ENABLE_OPENAI !== 'false' && Boolean(process.env.OPENAI_API_KEY);

  if (!geminiEnabled && !openaiEnabled) {
    return {
      action: null,
      explainText: hasUserRequest
        ? 'Planner model is unavailable right now. Please try again in a moment.'
        : undefined,
      source: 'rule',
      fallbackReason: 'LLM_DISABLED_NO_PROVIDER',
    };
  }

  try {
    const plannerTools = getPlannerToolSchema(context.toolSchema);
    const plannerCpEnabled = context.plannerCpEnabled !== false;
    const plannerPreferences = plannerCpEnabled ? memory.getPreferences() : [];
    const plannerConstraints = plannerCpEnabled ? memory.getConstraints() : [];
    const plannerConflicts = plannerCpEnabled ? memory.getConflicts() : [];
    const plannerCandidates = plannerCpEnabled ? memory.getCandidates() : [];
    const plannerInput = {
      history: buildPlannerHistory(context),
      availableTools: plannerTools,
      workflow: buildWorkflowContext(
        context,
        stage,
        spec,
        plannerTools,
        plannerPreferences,
        plannerConstraints,
        plannerConflicts,
        plannerCandidates
      ),
    };

    const llm = geminiEnabled
      ? await planActionWithGemini(plannerInput)
      : await planActionWithOpenAI(plannerInput);

    if (!llm) {
      return {
        action: null,
        explainText: hasUserRequest
          ? 'I could not parse a planner output this turn. Please rephrase your request.'
          : undefined,
        source: 'rule',
        fallbackReason: 'LLM_EMPTY_OR_UNPARSEABLE_OUTPUT',
      };
    }

    const validated = validateLlmAction(context, spec, llm);
    if (!validated) {
      return {
        action: null,
        explainText: hasUserRequest
          ? 'I could not validate the planner action against the current UI state.'
          : undefined,
        source: 'rule',
        fallbackReason: 'LLM_VALIDATION_REJECTED',
      };
    }

    // Do not allow autonomous tool actions before the user gives any intent.
    if (!hasUserRequest && validated.action?.type === 'tool.call') {
      return {
        action: null,
        explainText: validated.explainText,
        source: 'llm',
        fallbackReason: 'NO_USER_REQUEST_TOOL_BLOCKED',
      };
    }

    return validated;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      action: null,
      explainText: hasUserRequest
        ? 'Planner request failed this turn. Please try again shortly.'
        : undefined,
      source: 'rule',
      fallbackReason: `LLM_REQUEST_FAILED:${message}`,
    };
  }
}
