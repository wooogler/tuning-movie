import fs from 'node:fs';
import path from 'node:path';

interface StudyInteractionLogEventInput {
  type: string;
  payload: unknown;
  clientTimestamp?: string;
}

export interface StudyLlmTraceLogWriter {
  enabled: boolean;
  append: (event: StudyInteractionLogEventInput) => void;
}

function readNonEmptyEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function createDisabledWriter(): StudyLlmTraceLogWriter {
  return {
    enabled: false,
    append: () => {},
  };
}

function buildLlmTraceLogFilePath(interactionLogFile: string): string {
  const parsed = path.parse(interactionLogFile);
  const extension = parsed.ext || '.jsonl';
  const fileName = `${parsed.name}.llm-trace${extension}`;
  return path.resolve(process.cwd(), 'logs', 'trace', fileName);
}

export function createStudyLlmTraceLogWriterFromEnv(): StudyLlmTraceLogWriter {
  const sessionId = readNonEmptyEnv('AGENT_RUNTIME_SESSION_ID');
  const relaySessionId = readNonEmptyEnv('AGENT_SESSION_ID');
  const interactionLogFile = readNonEmptyEnv('AGENT_INTERACTION_LOG_FILE');

  if (!sessionId || !relaySessionId || !interactionLogFile) {
    return createDisabledWriter();
  }

  const filePath = buildLlmTraceLogFilePath(interactionLogFile);
  const loggingParticipantId = readNonEmptyEnv('AGENT_LOGGING_PARTICIPANT_ID');
  const sessionParticipantId = readNonEmptyEnv('AGENT_PARTICIPANT_ID');
  const scenarioId = readNonEmptyEnv('AGENT_STUDY_ID');
  const studyMode = readNonEmptyEnv('AGENT_STUDY_MODE');

  return {
    enabled: true,
    append: (event) => {
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const entry = {
          timestamp: new Date().toISOString(),
          ...(event.clientTimestamp ? { clientTimestamp: event.clientTimestamp } : {}),
          sessionId,
          relaySessionId,
          participantId: loggingParticipantId,
          sessionParticipantId,
          scenarioId,
          studyMode,
          type: event.type,
          payload: event.payload,
        };
        fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf-8');
      } catch (error) {
        console.error('Failed to append LLM trace log from agent:', error);
      }
    },
  };
}
