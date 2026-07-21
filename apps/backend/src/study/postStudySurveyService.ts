import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../../');

export interface PostStudySurveySubmissionInput {
  participantId: string;
  rankings: Record<string, number>;
  rankingReason: string;
  responses: Record<string, number>;
  submittedAt?: string;
}

interface PersistedPostStudySurveySubmission extends PostStudySurveySubmissionInput {
  submissionId: string;
  submittedAt: string;
}

const CONDITION_KEYS = ['C1', 'C2', 'C3', 'C4'] as const;
const LIKERT_KEYS = ['P3', 'P4'] as const;

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

function resolveSurveyFilePath(record: PersistedPostStudySurveySubmission): string {
  const safeParticipantId = sanitizeFileToken(record.participantId, 'participant');
  const safeTimestamp = formatFileTimestamp(record.submittedAt);
  const fileName = `${safeParticipantId}-${safeTimestamp}.jsonl`;
  return path.resolve(WORKSPACE_ROOT, 'logs/survey/post-study', fileName);
}

export function appendPostStudySurveySubmission(
  input: PostStudySurveySubmissionInput
): PersistedPostStudySurveySubmission {
  const participantId = input.participantId.trim();
  if (!participantId) {
    throw new Error('participantId is required');
  }

  const rankingEntries = CONDITION_KEYS.map((key) => [key, input.rankings[key]] as const);
  const rankingValues = rankingEntries.map(([, value]) => value);
  const isValidRankingSet =
    rankingValues.length === CONDITION_KEYS.length &&
    rankingValues.every((value) => Number.isInteger(value) && value >= 1 && value <= 4) &&
    new Set(rankingValues).size === CONDITION_KEYS.length;
  if (!isValidRankingSet) {
    throw new Error('rankings must assign each condition a unique rank from 1 to 4');
  }

  const rankingReason = input.rankingReason.trim();
  if (!rankingReason) {
    throw new Error('rankingReason is required');
  }

  const responseEntries = LIKERT_KEYS.map((key) => [key, input.responses[key]] as const);
  const normalizedResponses = Object.fromEntries(
    responseEntries.map(([key, value]) => {
      if (!Number.isInteger(value) || value < 1 || value > 7) {
        throw new Error(`Invalid response value for ${key}`);
      }
      return [key, value];
    })
  );

  const record: PersistedPostStudySurveySubmission = {
    submissionId: `pss_${randomUUID().replace(/-/g, '')}`,
    participantId,
    rankings: Object.fromEntries(rankingEntries),
    rankingReason,
    responses: normalizedResponses,
    submittedAt: input.submittedAt?.trim() || new Date().toISOString(),
  };

  const filePath = resolveSurveyFilePath(record);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf-8');
  return record;
}
