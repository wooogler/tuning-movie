import type { StudyModeConfig, StudyModeId } from '../pages/studyOptions';

export interface StudyScenarioSummary {
  id: string;
  title: string;
}

export interface StudySessionState {
  sessionId: string;
  relaySessionId: string;
  participantId: string;
  studyToken: string;
  expiresAt: string;
  studyMode: StudyModeId;
  studyModeConfig: StudyModeConfig;
  scenario: StudyScenarioSummary;
}

const STUDY_SESSION_STORAGE_KEY = 'tuning-movie-study-session';

export function getStoredStudySession(): StudySessionState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STUDY_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudySessionState>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.sessionId !== 'string' ||
      typeof parsed.relaySessionId !== 'string' ||
      typeof parsed.participantId !== 'string' ||
      typeof parsed.studyToken !== 'string' ||
      typeof parsed.expiresAt !== 'string' ||
      typeof parsed.studyMode !== 'string' ||
      !parsed.studyModeConfig ||
      typeof parsed.studyModeConfig !== 'object' ||
      !parsed.scenario ||
      typeof parsed.scenario !== 'object' ||
      typeof parsed.scenario.id !== 'string' ||
      typeof parsed.scenario.title !== 'string'
    ) {
      return null;
    }
    return parsed as StudySessionState;
  } catch {
    return null;
  }
}

export function setStoredStudySession(session: StudySessionState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STUDY_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage failures.
  }
}

export function clearStoredStudySession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STUDY_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
