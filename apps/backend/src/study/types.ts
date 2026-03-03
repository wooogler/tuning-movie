import type { db as defaultDb } from '../db';

export type StudyDb = typeof defaultDb;

export type StudyModeId =
  | 'gui-only'
  | 'basic-tuning'
  | 'adaptive-tuning'
  | 'full-tuning';

export interface StudyModeConfig {
  agentEnabled: boolean;
  guiAdaptationEnabled: boolean;
  cpMemoryWindow: number;
  extractorConflictCandidateEnabled: boolean;
}

export interface ScenarioSeedFilters {
  includeMovieIds?: string[];
  includeTheaterIds?: string[];
}

export interface ScenarioDefinition {
  id: string;
  title: string;
  story: string;
  narratorPreferenceTypes: string[];
  templateDbFile: string;
  seedDataFile?: string;
  seedFilters?: ScenarioSeedFilters;
}

export interface StudySessionRecord {
  sessionId: string;
  relaySessionId: string;
  participantId: string;
  scenarioId: string;
  studyMode: StudyModeId;
  dbPath: string;
  status: 'active' | 'finished' | 'expired';
  createdAt: string;
  expiresAt: string;
  finishedAt?: string;
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
