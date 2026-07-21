import type { Stage } from '../spec';
import {
  extractPreferenceMentions,
  type ExtractedPreferenceMention,
  type PreferencePriority,
} from './preferences';

export type InteractionLogSource = 'participant' | 'agent' | 'devtools' | 'system';
export type WorkflowDirection = 'initial' | 'forward' | 'backward' | 'same';
export type PreferenceExtractionAction = 'new' | 'update' | 'restate';

interface PreferenceExtractionInput {
  stage: Stage;
  text: string;
  source: 'text' | 'voice';
  preferenceTypes: string[];
  seatRows?: string[];
  seenMentions: Map<string, string>;
}

interface PreferenceExtractionEvent {
  type: 'preference.extracted';
  payload: {
    stage: Stage;
    source: 'text' | 'voice';
    preferenceId: string;
    basePreferenceId: string;
    priority: PreferencePriority;
    action: PreferenceExtractionAction;
    utterance: string;
    matchedPhrases: string[];
  };
}

interface ConflictSignalInput {
  stage: Stage;
  source: InteractionLogSource;
  toolName?: string;
  reason?: string;
  messageText?: string;
  targetStage?: Stage | null;
}

export interface DerivedLogEvent {
  type: string;
  payload: Record<string, unknown>;
}

const STAGE_ORDER: Stage[] = ['movie', 'theater', 'date', 'time', 'seat', 'confirm'];
const CONFLICT_SIGNAL_PATTERN =
  /\b(conflict|dead[\s-]?end|no (?:valid|viable|compatible|available)|cannot satisfy|can't satisfy|does not satisfy|won't work|would not work|blocked|incompatible|no adjacent|no seats together|fails?)\b/i;
const BACKTRACK_SIGNAL_PATTERN =
  /\b(backtrack|go back|return to|try another|switch to|start over|previous stage)\b/i;

function getStageIndex(stage: Stage | null | undefined): number {
  if (!stage) return -1;
  return STAGE_ORDER.indexOf(stage);
}

export function getWorkflowDirection(fromStage: Stage | null, toStage: Stage): WorkflowDirection {
  if (!fromStage) return 'initial';
  const fromIndex = getStageIndex(fromStage);
  const toIndex = getStageIndex(toStage);
  if (fromIndex === toIndex) return 'same';
  return toIndex > fromIndex ? 'forward' : 'backward';
}

export function buildPreferenceExtractionEvents(
  input: PreferenceExtractionInput
): PreferenceExtractionEvent[] {
  const mentions = extractPreferenceMentions(input.text, input.preferenceTypes, {
    seatRows: input.seatRows,
  });

  return mentions.map((mention) => ({
    type: 'preference.extracted',
    payload: {
      stage: input.stage,
      source: input.source,
      preferenceId: mention.preferenceId,
      basePreferenceId: mention.basePreferenceId,
      priority: mention.priority,
      action: resolvePreferenceAction(mention, input.text, input.seenMentions),
      utterance: input.text.trim(),
      matchedPhrases: mention.matchedPhrases,
    },
  }));
}

function resolvePreferenceAction(
  mention: ExtractedPreferenceMention,
  text: string,
  seenMentions: Map<string, string>
): PreferenceExtractionAction {
  const normalizedText = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const previous = seenMentions.get(mention.preferenceId);
  seenMentions.set(mention.preferenceId, normalizedText);

  if (!previous) return 'new';
  return previous === normalizedText ? 'restate' : 'update';
}

export function buildConflictSignalEvents(input: ConflictSignalInput): DerivedLogEvent[] {
  const reason = input.reason?.trim() ?? '';
  const messageText = input.messageText?.trim() ?? '';
  const searchText = `${reason} ${messageText}`.trim();
  const events: DerivedLogEvent[] = [];

  const isConflictSignal = CONFLICT_SIGNAL_PATTERN.test(searchText);
  const isBacktrackSignal =
    input.toolName === 'prev' ||
    BACKTRACK_SIGNAL_PATTERN.test(searchText);

  if (isConflictSignal) {
    const basePayload = {
      stage: input.stage,
      source: input.source,
      ...(input.toolName ? { toolName: input.toolName } : {}),
      ...(reason ? { reason } : {}),
      ...(messageText ? { messageText } : {}),
    };
    events.push({
      type: 'conflict.detected',
      payload: {
        ...basePayload,
        detector: 'heuristic',
      },
    });
    events.push({
      type: 'conflict.disclosed',
      payload: {
        ...basePayload,
        channel: messageText ? 'agent-message' : 'tool-reason',
      },
    });
  }

  if (isBacktrackSignal) {
    events.push({
      type: 'backtrack.suggested',
      payload: {
        stage: input.stage,
        source: input.source,
        ...(input.toolName ? { toolName: input.toolName } : {}),
        ...(input.targetStage ? { targetStage: input.targetStage } : {}),
        ...(reason ? { reason } : {}),
        ...(messageText ? { messageText } : {}),
      },
    });
  }

  return events;
}
