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
  | 'full-tuning-voice-on';

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
