import fs from 'fs';
import path from 'path';
import type { StudySessionRecord } from './types';
import { toShortScenarioFileLabel } from './scenarioFileLabels';

export interface StudyInteractionLogEventInput {
  type: string;
  payload: unknown;
  clientTimestamp?: string;
}

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../../');
const LOG_ROOT_DIR = path.resolve(WORKSPACE_ROOT, 'logs');
const INTERACTION_LOG_DIR = path.resolve(LOG_ROOT_DIR, 'interaction');
const LLM_TRACE_LOG_DIR = path.resolve(LOG_ROOT_DIR, 'trace');

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

function resolveLogFilePath(relativeFile: string): string {
  return path.resolve(WORKSPACE_ROOT, relativeFile);
}

function getLogParticipantId(record: StudySessionRecord): string | null {
  if (typeof record.loggingParticipantId !== 'string') return null;
  const value = record.loggingParticipantId.trim();
  return value || null;
}

function getRelativeLogFile(record: StudySessionRecord): string | null {
  if (typeof record.interactionLogFile !== 'string') return null;
  const value = record.interactionLogFile.trim();
  return value || null;
}

function buildLlmTraceRelativeFile(relativeFile: string): string {
  const parsed = path.posix.parse(relativeFile);
  const extension = parsed.ext || '.jsonl';
  return path.posix.join('logs', 'trace', `${parsed.name}.llm-trace${extension}`);
}

export function createInteractionLogFileName(
  participantId: string | null | undefined,
  conditionLabel: string | null | undefined,
  scenarioId: string | null | undefined,
  createdAt: string
): string {
  const safeTimestamp = formatFileTimestamp(createdAt);
  const safePid =
    typeof participantId === 'string' && participantId.trim()
      ? sanitizeFileToken(participantId, 'participant')
      : null;
  const safeCondition =
    typeof conditionLabel === 'string' && conditionLabel.trim()
      ? sanitizeFileToken(conditionLabel, 'condition')
      : 'condition';
  const safeScenario =
    sanitizeFileToken(toShortScenarioFileLabel(scenarioId) || scenarioId || 'scenario', 'scenario');
  return safePid
    ? `${safePid}-${safeCondition}-${safeScenario}-${safeTimestamp}.jsonl`
    : `${safeCondition}-${safeScenario}-${safeTimestamp}.jsonl`;
}

export function createInteractionLogFilePath(
  participantId: string | null | undefined,
  conditionLabel: string | null | undefined,
  scenarioId: string | null | undefined,
  createdAt: string
): string {
  const fileName = createInteractionLogFileName(
    participantId,
    conditionLabel,
    scenarioId,
    createdAt
  );
  return path.posix.join('logs', 'interaction', fileName);
}

export function hasInteractionLogging(record: StudySessionRecord): boolean {
  return Boolean(getRelativeLogFile(record));
}

export function appendInteractionLog(
  record: StudySessionRecord,
  event: StudyInteractionLogEventInput
): string | null {
  const relativeFile = getRelativeLogFile(record);
  if (!relativeFile) {
    return null;
  }
  const loggingParticipantId = getLogParticipantId(record);

  const filePath = resolveLogFilePath(relativeFile);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const entry = {
    timestamp: new Date().toISOString(),
    ...(event.clientTimestamp ? { clientTimestamp: event.clientTimestamp } : {}),
    sessionId: record.sessionId,
    relaySessionId: record.relaySessionId,
    participantId: loggingParticipantId,
    sessionParticipantId: record.participantId,
    conditionLabel: record.conditionLabel,
    scenarioId: record.scenarioId,
    studyMode: record.studyMode,
    type: event.type,
    payload: event.payload,
  };

  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf-8');
  return relativeFile;
}

export function appendInteractionLogSafe(
  record: StudySessionRecord,
  event: StudyInteractionLogEventInput
): string | null {
  try {
    return appendInteractionLog(record, event);
  } catch (error) {
    console.error('Failed to append interaction log:', error);
    return null;
  }
}

export function readInteractionLogFile(
  record: StudySessionRecord
): { fileName: string; content: Buffer } | null {
  const relativeFile = getRelativeLogFile(record);
  if (!relativeFile) {
    return null;
  }

  const filePath = resolveLogFilePath(relativeFile);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return {
    fileName: path.posix.basename(relativeFile),
    content: fs.readFileSync(filePath),
  };
}

export function readLlmTraceLogFile(
  record: StudySessionRecord
): { fileName: string; content: Buffer } | null {
  const relativeFile = getRelativeLogFile(record);
  if (!relativeFile) {
    return null;
  }

  const llmTraceRelativeFile = buildLlmTraceRelativeFile(relativeFile);
  const filePath = resolveLogFilePath(llmTraceRelativeFile);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return {
    fileName: path.posix.basename(llmTraceRelativeFile),
    content: fs.readFileSync(filePath),
  };
}

export function deleteInteractionLogArtifacts(record: StudySessionRecord): void {
  const relativeFile = getRelativeLogFile(record);
  if (!relativeFile) {
    return;
  }

  const interactionFilePath = resolveLogFilePath(relativeFile);
  const llmTraceRelativeFile = buildLlmTraceRelativeFile(relativeFile);
  const llmTraceFilePath = resolveLogFilePath(llmTraceRelativeFile);

  if (fs.existsSync(interactionFilePath)) {
    fs.rmSync(interactionFilePath, { force: true });
  }
  if (fs.existsSync(llmTraceFilePath)) {
    fs.rmSync(llmTraceFilePath, { force: true });
  }
}

export function hasCompletedBookingLog(record: StudySessionRecord): boolean {
  const relativeFile = getRelativeLogFile(record);
  if (!relativeFile) {
    return false;
  }

  const filePath = resolveLogFilePath(relativeFile);
  if (!fs.existsSync(filePath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.includes('"type":"booking.completed"') || content.includes('"type":"study.session.finished"');
  } catch {
    return false;
  }
}

export function ensureInteractionLogDir(): void {
  fs.mkdirSync(INTERACTION_LOG_DIR, { recursive: true });
  fs.mkdirSync(LLM_TRACE_LOG_DIR, { recursive: true });
}
