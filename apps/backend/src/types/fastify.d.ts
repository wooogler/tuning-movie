import 'fastify';
import type { ScenarioDefinition, StudyModeConfig, StudySessionRecord, StudyDb } from '../study/types';

declare module 'fastify' {
  interface FastifyRequest {
    study?: {
      token: string;
      record: StudySessionRecord;
      scenario: ScenarioDefinition;
      studyModeConfig: StudyModeConfig;
      db: StudyDb;
    };
  }
}
