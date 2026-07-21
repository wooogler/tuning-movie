import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { toShortScenarioSetFileLabel } from './scenarioFileLabels';
import { getStudyConditionCode, normalizeStudyMode } from './modes';

export interface PerTrialSurveySubmissionInput {
  participantId: string;
  studyMode: string;
  conditionLabel: string;
  scenarioId?: string;
  setLabel?: string;
  responses: Record<string, number>;
  submittedAt?: string;
}

interface PersistedPerTrialSurveySubmission extends PerTrialSurveySubmissionInput {
  submissionId: string;
  submittedAt: string;
}

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../../');
const PER_TRIAL_QUESTION_RANGES: Record<string, readonly [number, number]> = {
  C1: [1, 7],
  C2: [1, 7],
  C3: [1, 7],
  U1: [0, 4],
  U2: [0, 4],
  U3: [0, 4],
  U4: [0, 4],
  U5: [0, 4],
  PU1: [1, 7],
  PU2: [1, 7],
  PU3: [1, 7],
  PU4: [1, 7],
};

function sanitizeFileToken(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || fallback;
}

function formatFileTimestamp(iso: string): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const getPart = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${getPart('year')}${getPart('month')}${getPart('day')}-${getPart('hour')}${getPart('minute')}${getPart('second')}`;
}

function resolveSurveyFilePath(record: PersistedPerTrialSurveySubmission): string {
  const safeParticipantId = sanitizeFileToken(record.participantId, 'participant');
  const safeCondition = sanitizeFileToken(
    getStudyConditionCode(normalizeStudyMode(record.studyMode)),
    'condition'
  );
  const safeScenarioOrSet = sanitizeFileToken(
    toShortScenarioSetFileLabel(record.scenarioId) || record.setLabel || 'per-trial',
    'per-trial'
  );
  const safeTimestamp = formatFileTimestamp(record.submittedAt);
  const fileName = `${safeParticipantId}-${safeCondition}-${safeScenarioOrSet}-${safeTimestamp}.jsonl`;
  return path.resolve(WORKSPACE_ROOT, 'logs/survey/per-trial', fileName);
}

export function appendPerTrialSurveySubmission(
  input: PerTrialSurveySubmissionInput
): PersistedPerTrialSurveySubmission {
  const participantId = input.participantId.trim();
  if (!participantId) {
    throw new Error('participantId is required');
  }

  const responseEntries = Object.entries(input.responses);
  if (responseEntries.length === 0) {
    throw new Error('responses must not be empty');
  }

  const normalizedResponses = Object.fromEntries(
    responseEntries.map(([key, value]) => {
      const expectedRange = PER_TRIAL_QUESTION_RANGES[key];
      if (!expectedRange) {
        throw new Error(`Unknown survey question: ${key}`);
      }

      const [min, max] = expectedRange;
      if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`Invalid response value for ${key}`);
      }
      return [key, value];
    })
  );

  const record: PersistedPerTrialSurveySubmission = {
    submissionId: `pts_${randomUUID().replace(/-/g, '')}`,
    participantId,
    studyMode: input.studyMode.trim(),
    conditionLabel: input.conditionLabel.trim(),
    ...(input.scenarioId?.trim() ? { scenarioId: input.scenarioId.trim() } : {}),
    ...(input.setLabel?.trim() ? { setLabel: input.setLabel.trim() } : {}),
    responses: normalizedResponses,
    submittedAt: input.submittedAt?.trim() || new Date().toISOString(),
  };

  const filePath = resolveSurveyFilePath(record);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf-8');
  return record;
}
