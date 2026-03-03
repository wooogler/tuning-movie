import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import type { StudyDb } from './types';

interface SessionDbHandle {
  db: StudyDb;
  sqlite: Database.Database;
  dbPath: string;
}

const handles = new Map<string, SessionDbHandle>();

function runtimeDbCandidates(): string[] {
  return [
    path.resolve(process.cwd(), 'apps/backend/.runtime/study-db'),
    path.resolve(process.cwd(), '.runtime/study-db'),
    path.resolve(__dirname, '../../.runtime/study-db'),
  ];
}

export function resolveRuntimeDbDir(): string {
  for (const candidate of runtimeDbCandidates()) {
    const parent = path.dirname(candidate);
    if (fs.existsSync(parent)) return candidate;
  }
  return runtimeDbCandidates()[0];
}

function ensureRuntimeDir(): string {
  const dir = resolveRuntimeDbDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function openDb(dbPath: string): SessionDbHandle {
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite, dbPath };
}

export function resolveSessionDbPath(sessionId: string): string {
  const dir = ensureRuntimeDir();
  return path.resolve(dir, `${sessionId}.db`);
}

export function createSessionDbFromTemplate(
  sessionId: string,
  templateDbPath: string
): SessionDbHandle {
  if (!fs.existsSync(templateDbPath)) {
    throw new Error(`Scenario template DB not found: ${templateDbPath}`);
  }

  destroySessionDb(sessionId);
  const sessionDbPath = resolveSessionDbPath(sessionId);
  fs.copyFileSync(templateDbPath, sessionDbPath);

  const handle = openDb(sessionDbPath);
  handles.set(sessionId, handle);
  return handle;
}

export function getSessionDbHandle(sessionId: string): SessionDbHandle | null {
  const existing = handles.get(sessionId);
  if (existing) return existing;

  const dbPath = resolveSessionDbPath(sessionId);
  if (!fs.existsSync(dbPath)) return null;

  const reopened = openDb(dbPath);
  handles.set(sessionId, reopened);
  return reopened;
}

export function closeSessionDb(sessionId: string): void {
  const handle = handles.get(sessionId);
  if (!handle) return;
  handles.delete(sessionId);
  try {
    handle.sqlite.close();
  } catch {
    // Ignore close failures during teardown.
  }
}

export function destroySessionDb(sessionId: string): void {
  const dbPath = resolveSessionDbPath(sessionId);
  closeSessionDb(sessionId);
  if (fs.existsSync(dbPath)) {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // Ignore delete failures; session cleanup is best-effort.
    }
  }
}
