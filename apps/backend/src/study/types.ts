import type { db as defaultDb } from '../db';

export type StudyDb = typeof defaultDb;

export type StudyModeId =
  | 'baseline'
  | 'basic-tuning'
  | 'basic-tuning-voice-off'
  | 'basic-tuning-voice-on'
  | 'new-baseline'
  | 'adaptive-tuning'
  | 'full-tuning'
  | 'full-tuning-voice-off'
  | 'full-tuning-voice-on'
  | 'demo';

export interface StudyModeConfig {
  agentEnabled: boolean;
  guiAdaptationEnabled: boolean;
  cpMemoryWindow: number;
  voiceModeAvailable: boolean;
}

export interface ScenarioSeedFilters {
  includeMovieIds?: string[];
  includeTheaterIds?: string[];
}

export interface ScenarioStepBriefs {
  movie?: string;
  theater?: string;
  date?: string;
  time?: string;
  seat?: string;
  confirm?: string;
}

export interface ScenarioDefinition {
  id: string;
  title: string;
  background?: string;
  story: string;
  stepBriefs?: ScenarioStepBriefs;
  narratorPreferenceTypes: string[];
  seatRows?: string[];
  templateDbFile: string;
  seedDataFile?: string;
  seedFilters?: ScenarioSeedFilters;
}

export interface StudySessionRecord {
  sessionId: string;
  relaySessionId: string;
  participantId: string;
  loggingParticipantId?: string;
  interactionLogFile?: string;
  conditionLabel: string;
  scenarioId: string;
  studyMode: StudyModeId;
  dbPath: string;
  status: 'active' | 'finished' | 'expired';
  createdAt: string;
  expiresAt: string;
  finishedAt?: string;
  /**
   * Marks a session that was created with a user-provided OpenAI key. Only the
   * flag is persisted -- the key itself is memory-only (see `sessionApiKeys` in
   * sessionService) and must never reach this record. After a backend restart
   * the key is gone, so a flagged session is expired instead of being resumed on
   * the operator's credentials.
   */
  usesSessionApiKey?: boolean;
}

export interface StudySessionTokenPayload {
  sessionId: string;
  relaySessionId: string;
  exp: number;
  iat: number;
}

export interface StudySessionContext {
  record: StudySessionRecord;
  scenario: ScenarioDefinition;
  studyModeConfig: StudyModeConfig;
  db: StudyDb;
}
