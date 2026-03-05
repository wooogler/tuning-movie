import fs from 'fs';
import path from 'path';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { spawnSync } from 'child_process';
import {
  createSessionDbFromTemplate,
  destroySessionDb,
  getSessionDbHandle,
} from './dbManager';
import {
  getScenarioById,
  getScenarioCatalog,
  getScenarioTemplatePath,
} from './scenarioCatalog';
import {
  getStudyModeConfig,
  isStudyModeId,
  normalizeStudyMode,
  DEFAULT_STUDY_MODE,
} from './modes';
import { startAgentForSession, stopAgentForSession } from './agentSupervisor';
import type {
  ScenarioDefinition,
  StudyModeId,
  StudySessionContext,
  StudySessionRecord,
  StudySessionTokenPayload,
} from './types';

interface CreateSessionInput {
  scenarioId: string;
  studyMode?: string;
  participantId?: string;
}

interface PersistedSessionFile {
  sessions: StudySessionRecord[];
}

interface CreateSessionResult {
  record: StudySessionRecord;
  scenario: ScenarioDefinition;
  studyModeConfig: ReturnType<typeof getStudyModeConfig>;
  studyToken: string;
}

const SESSION_TTL_MS = Number.parseInt(process.env.STUDY_SESSION_TTL_MS || '', 10) || 4 * 60 * 60 * 1000;
const TOKEN_SECRET =
  process.env.STUDY_SESSION_SECRET || process.env.AGENT_SESSION_ID || 'tuning-movie-study-secret';

const sessions = new Map<string, StudySessionRecord>();

function resolveBackendRootForSeeding(): string {
  const candidates = [
    path.resolve(process.cwd(), 'apps/backend'),
    process.cwd(),
    path.resolve(__dirname, '../..'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }
  return process.cwd();
}

function runScenarioTemplateSeed(): void {
  const backendRoot = resolveBackendRootForSeeding();
  const distSeedPath = path.resolve(backendRoot, 'dist/db/seedScenarios.js');
  const commandResult = fs.existsSync(distSeedPath)
    ? spawnSync(process.execPath, [distSeedPath], {
        cwd: backendRoot,
        env: process.env,
        stdio: 'inherit',
      })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'db:seed:scenarios'], {
        cwd: backendRoot,
        env: process.env,
        stdio: 'inherit',
      });

  if (commandResult.status !== 0) {
    throw new Error('Failed to generate scenario template DBs.');
  }
}

function ensureScenarioTemplateDb(scenario: ScenarioDefinition): string {
  const templateDbPath = getScenarioTemplatePath(scenario);
  if (fs.existsSync(templateDbPath)) {
    return templateDbPath;
  }

  console.warn(
    `[study] Scenario template DB missing. Regenerating templates: ${templateDbPath}`
  );
  runScenarioTemplateSeed();

  if (!fs.existsSync(templateDbPath)) {
    throw new Error(`Scenario template DB not found: ${templateDbPath}`);
  }
  return templateDbPath;
}

function shouldEnforceSingleActiveAgentSession(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function sessionsFileCandidates(): string[] {
  return [
    path.resolve(process.cwd(), 'apps/backend/.runtime/study-sessions.json'),
    path.resolve(process.cwd(), '.runtime/study-sessions.json'),
    path.resolve(__dirname, '../../.runtime/study-sessions.json'),
  ];
}

function resolveSessionsFilePath(): string {
  for (const candidate of sessionsFileCandidates()) {
    const parent = path.dirname(candidate);
    if (fs.existsSync(parent)) return candidate;
  }
  return sessionsFileCandidates()[0];
}

function ensureSessionsFileDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function now(): Date {
  return new Date();
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf-8');
}

function signPayload(encodedPayload: string): string {
  return createHmac('sha256', TOKEN_SECRET).update(encodedPayload).digest('base64url');
}

function safeEqualText(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf-8');
  const bBuf = Buffer.from(b, 'utf-8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function parseToken(token: string): StudySessionTokenPayload | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;
  const expected = signPayload(encodedPayload);
  if (!safeEqualText(signature, expected)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as StudySessionTokenPayload;
    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.sessionId !== 'string' ||
      typeof payload.relaySessionId !== 'string' ||
      typeof payload.exp !== 'number' ||
      typeof payload.iat !== 'number'
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function createToken(record: StudySessionRecord): string {
  const payload: StudySessionTokenPayload = {
    sessionId: record.sessionId,
    relaySessionId: record.relaySessionId,
    iat: Date.parse(record.createdAt),
    exp: Date.parse(record.expiresAt),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function parseStudyMode(input: string | undefined): StudyModeId {
  if (input && isStudyModeId(input)) return input;
  return normalizeStudyMode(input);
}

function loadPersistedSessions(): void {
  const filePath = resolveSessionsFilePath();
  if (!fs.existsSync(filePath)) return;

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PersistedSessionFile;
    const records = Array.isArray(parsed.sessions) ? parsed.sessions : [];
    for (const record of records) {
      if (!record || typeof record !== 'object') continue;
      if (record.status !== 'active') continue;
      const normalizedStudyMode = normalizeStudyMode(
        typeof record.studyMode === 'string' ? record.studyMode : undefined
      );
      sessions.set(record.sessionId, {
        ...record,
        studyMode: normalizedStudyMode,
      });
    }
  } catch {
    // Ignore malformed runtime files; service will rebuild state.
  }
}

function deactivateSession(
  record: StudySessionRecord,
  status: 'finished' | 'expired'
): void {
  sessions.set(record.sessionId, {
    ...record,
    status,
    finishedAt: now().toISOString(),
  });
  stopAgentForSession(record.sessionId);
  destroySessionDb(record.sessionId);
}

function deactivateOtherActiveAgentSessions(keepSessionId?: string): boolean {
  if (!shouldEnforceSingleActiveAgentSession()) return false;

  let changed = false;
  for (const record of sessions.values()) {
    if (record.status !== 'active') continue;
    if (keepSessionId && record.sessionId === keepSessionId) continue;
    const studyModeConfig = getStudyModeConfig(record.studyMode);
    if (!studyModeConfig.agentEnabled) continue;
    deactivateSession(record, 'expired');
    changed = true;
  }
  return changed;
}

function keepLatestActiveAgentSession(): boolean {
  if (!shouldEnforceSingleActiveAgentSession()) return false;

  const activeAgentSessions = Array.from(sessions.values())
    .filter((record) => {
      if (record.status !== 'active') return false;
      return getStudyModeConfig(record.studyMode).agentEnabled;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  if (activeAgentSessions.length <= 1) return false;
  const [, ...stale] = activeAgentSessions;
  let changed = false;
  for (const record of stale) {
    deactivateSession(record, 'expired');
    changed = true;
  }
  return changed;
}

function restartAgentsForActiveSessions(): void {
  for (const record of sessions.values()) {
    if (record.status !== 'active') continue;
    const scenario = getScenarioById(record.scenarioId);
    if (!scenario) continue;
    const studyModeConfig = getStudyModeConfig(record.studyMode);
    if (!studyModeConfig.agentEnabled) continue;
    startAgentForSession({
      sessionId: record.sessionId,
      relaySessionId: record.relaySessionId,
      scenarioId: scenario.id,
      participantId: record.participantId,
      studyMode: record.studyMode,
      modeConfig: studyModeConfig,
    });
  }
}

function persistSessions(): void {
  const filePath = resolveSessionsFilePath();
  ensureSessionsFileDir(filePath);
  const all = Array.from(sessions.values());
  const payload: PersistedSessionFile = { sessions: all };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

function markExpiredSessions(): boolean {
  let changed = false;
  const current = now().getTime();
  for (const [sessionId, record] of sessions.entries()) {
    if (record.status !== 'active') continue;
    if (Date.parse(record.expiresAt) > current) continue;
    const expired: StudySessionRecord = {
      ...record,
      status: 'expired',
      finishedAt: now().toISOString(),
    };
    sessions.set(sessionId, expired);
    stopAgentForSession(sessionId);
    destroySessionDb(sessionId);
    changed = true;
  }
  return changed;
}

function buildSessionContext(record: StudySessionRecord): StudySessionContext | null {
  if (record.status !== 'active') return null;
  const scenario = getScenarioById(record.scenarioId);
  if (!scenario) return null;
  const dbHandle = getSessionDbHandle(record.sessionId);
  if (!dbHandle) return null;
  return {
    record,
    scenario,
    studyModeConfig: getStudyModeConfig(record.studyMode),
    db: dbHandle.db,
  };
}

loadPersistedSessions();
let normalizedActiveSessions = false;
if (keepLatestActiveAgentSession()) {
  normalizedActiveSessions = true;
}
if (markExpiredSessions()) {
  normalizedActiveSessions = true;
}
if (normalizedActiveSessions) {
  persistSessions();
}
restartAgentsForActiveSessions();

export function listScenarios(): ScenarioDefinition[] {
  return getScenarioCatalog();
}

export function createStudySession(input: CreateSessionInput): CreateSessionResult {
  const scenario = getScenarioById(input.scenarioId);
  if (!scenario) {
    throw new Error(`Unknown scenario: ${input.scenarioId}`);
  }

  let changed = false;
  if (markExpiredSessions()) {
    changed = true;
  }

  const requestedStudyMode = parseStudyMode(input.studyMode);
  const requestedStudyModeConfig = getStudyModeConfig(requestedStudyMode);
  if (requestedStudyModeConfig.agentEnabled && deactivateOtherActiveAgentSessions()) {
    changed = true;
  }

  if (changed) {
    persistSessions();
  }

  const studyMode = requestedStudyMode;
  const studyModeConfig = requestedStudyModeConfig;

  const templateDbPath = ensureScenarioTemplateDb(scenario);
  const sessionId = `st_${randomUUID().replace(/-/g, '')}`;
  const relaySessionId = `relay_${sessionId}`;
  const createdAt = now().toISOString();
  const expiresAt = new Date(Date.parse(createdAt) + SESSION_TTL_MS).toISOString();
  const participantId =
    typeof input.participantId === 'string' && input.participantId.trim()
      ? input.participantId.trim()
      : `P-${sessionId.slice(-6)}`;

  const dbHandle = createSessionDbFromTemplate(sessionId, templateDbPath);
  const record: StudySessionRecord = {
    sessionId,
    relaySessionId,
    participantId,
    scenarioId: scenario.id,
    studyMode,
    dbPath: dbHandle.dbPath,
    status: 'active',
    createdAt,
    expiresAt,
  };
  sessions.set(sessionId, record);

  if (studyModeConfig.agentEnabled) {
    startAgentForSession({
      sessionId,
      relaySessionId,
      scenarioId: scenario.id,
      participantId,
      studyMode,
      modeConfig: studyModeConfig,
    });
  }

  persistSessions();
  const studyToken = createToken(record);
  return {
    record,
    scenario,
    studyModeConfig,
    studyToken,
  };
}

export function getSessionContextByToken(token: string): StudySessionContext | null {
  if (!token.trim()) return null;
  if (markExpiredSessions()) {
    persistSessions();
  }
  const payload = parseToken(token.trim());
  if (!payload) return null;

  const record = sessions.get(payload.sessionId);
  if (!record) return null;
  if (record.relaySessionId !== payload.relaySessionId) return null;
  if (record.status !== 'active') return null;
  if (Date.parse(record.expiresAt) <= now().getTime()) return null;

  return buildSessionContext(record);
}

export function getSessionContextById(sessionId: string): StudySessionContext | null {
  if (markExpiredSessions()) {
    persistSessions();
  }
  const record = sessions.get(sessionId);
  if (!record) return null;
  return buildSessionContext(record);
}

export function finishSessionByToken(token: string): StudySessionRecord | null {
  const context = getSessionContextByToken(token);
  if (!context) return null;

  const finished: StudySessionRecord = {
    ...context.record,
    status: 'finished',
    finishedAt: now().toISOString(),
  };
  sessions.set(context.record.sessionId, finished);
  stopAgentForSession(context.record.sessionId);
  destroySessionDb(context.record.sessionId);
  persistSessions();
  return finished;
}
