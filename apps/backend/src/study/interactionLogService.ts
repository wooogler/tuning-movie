import fs from 'fs';
import path from 'path';
import type { StudySessionRecord } from './types';

export interface StudyInteractionLogEventInput {
  type: string;
  payload: unknown;
  clientTimestamp?: string;
}

const LOG_DIR = path.resolve(process.cwd(), 'logs/study');

function sanitizeFileToken(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || fallback;
}

function formatFileTimestamp(iso: string): string {
  return iso.replace(/[-:.]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function resolveLogFilePath(relativeFile: string): string {
  return path.resolve(process.cwd(), relativeFile);
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

export function createInteractionLogFileName(participantId: string, createdAt: string): string {
  const safePid = sanitizeFileToken(participantId, 'participant');
  const safeTimestamp = formatFileTimestamp(createdAt);
  return `${safePid}-${safeTimestamp}.jsonl`;
}

export function createInteractionLogFilePath(
  participantId: string,
  createdAt: string
): string {
  const fileName = createInteractionLogFileName(participantId, createdAt);
  return path.posix.join('logs', 'study', fileName);
}

export function hasInteractionLogging(record: StudySessionRecord): boolean {
  return Boolean(getLogParticipantId(record) && getRelativeLogFile(record));
}

export function appendInteractionLog(
  record: StudySessionRecord,
  event: StudyInteractionLogEventInput
): string | null {
  const participantId = getLogParticipantId(record);
  const relativeFile = getRelativeLogFile(record);
  if (!participantId || !relativeFile) {
    return null;
  }

  const filePath = resolveLogFilePath(relativeFile);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const entry = {
    timestamp: new Date().toISOString(),
    ...(event.clientTimestamp ? { clientTimestamp: event.clientTimestamp } : {}),
    sessionId: record.sessionId,
    relaySessionId: record.relaySessionId,
    participantId,
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

export function ensureInteractionLogDir(): void {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}
