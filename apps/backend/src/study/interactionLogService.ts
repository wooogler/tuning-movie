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

export function createInteractionLogFileName(
  participantId: string | null | undefined,
  createdAt: string
): string {
  const safeTimestamp = formatFileTimestamp(createdAt);
  const safePid =
    typeof participantId === 'string' && participantId.trim()
      ? sanitizeFileToken(participantId, 'participant')
      : null;
  return safePid ? `${safePid}-${safeTimestamp}.jsonl` : `${safeTimestamp}.jsonl`;
}

export function createInteractionLogFilePath(
  participantId: string | null | undefined,
  createdAt: string
): string {
  const fileName = createInteractionLogFileName(participantId, createdAt);
  return path.posix.join('logs', 'study', fileName);
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

export function ensureInteractionLogDir(): void {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}
