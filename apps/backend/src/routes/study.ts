import type { FastifyInstance } from 'fastify';
import {
  createStudySession,
  finishSessionByToken,
  getSessionContextByToken,
  listScenarios,
} from '../study/sessionService';
import { getStudyModeConfig, isStudyModeId, DEFAULT_STUDY_MODE } from '../study/modes';
import { appendInteractionLog, hasInteractionLogging } from '../study/interactionLogService';

function getStudyTokenFromHeader(headers: Record<string, unknown>): string | null {
  const raw = headers['x-study-session-token'];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string' && raw[0].trim()) {
    return raw[0].trim();
  }
  return null;
}

export async function studyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/study/scenarios', async () => {
    return {
      scenarios: listScenarios().map((scenario) => ({
        id: scenario.id,
        title: scenario.title,
        story: scenario.story,
        narratorPreferenceTypes: scenario.narratorPreferenceTypes,
      })),
    };
  });

  fastify.post('/study/sessions', async (request, reply) => {
    const body = (request.body ?? {}) as {
      scenarioId?: unknown;
      studyMode?: unknown;
      participantId?: unknown;
      loggingParticipantId?: unknown;
    };
    const scenarioId = typeof body.scenarioId === 'string' ? body.scenarioId.trim() : '';
    const studyModeInput = typeof body.studyMode === 'string' ? body.studyMode.trim() : undefined;
    const participantId =
      typeof body.participantId === 'string' ? body.participantId.trim() : undefined;
    const loggingParticipantId =
      typeof body.loggingParticipantId === 'string'
        ? body.loggingParticipantId.trim()
        : undefined;

    if (!scenarioId) {
      return reply.code(400).send({ error: 'scenarioId is required' });
    }
    if (studyModeInput && !isStudyModeId(studyModeInput)) {
      return reply.code(400).send({ error: 'Invalid studyMode' });
    }

    try {
      const created = createStudySession({
        scenarioId,
        studyMode: studyModeInput,
        participantId,
        loggingParticipantId,
      });
      return {
        sessionId: created.record.sessionId,
        relaySessionId: created.record.relaySessionId,
        participantId: created.record.participantId,
        loggingParticipantId: created.record.loggingParticipantId ?? null,
        interactionLogFile: created.record.interactionLogFile ?? null,
        studyToken: created.studyToken,
        expiresAt: created.record.expiresAt,
        studyMode: created.record.studyMode,
        studyModeConfig: created.studyModeConfig,
        scenario: {
          id: created.scenario.id,
          title: created.scenario.title,
          story: created.scenario.story,
          narratorPreferenceTypes: created.scenario.narratorPreferenceTypes,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create study session';
      return reply.code(400).send({ error: message });
    }
  });

  fastify.get('/study/sessions/me', async (request, reply) => {
    const token = getStudyTokenFromHeader(request.headers as Record<string, unknown>);
    if (!token) {
      return reply.code(401).send({ error: 'Missing x-study-session-token header' });
    }
    const context = getSessionContextByToken(token);
    if (!context) {
      return reply.code(401).send({ error: 'Invalid or expired study session' });
    }

    return {
      sessionId: context.record.sessionId,
      relaySessionId: context.record.relaySessionId,
      participantId: context.record.participantId,
      loggingParticipantId: context.record.loggingParticipantId ?? null,
      interactionLogFile: context.record.interactionLogFile ?? null,
      scenario: {
        id: context.scenario.id,
        title: context.scenario.title,
        story: context.scenario.story,
        narratorPreferenceTypes: context.scenario.narratorPreferenceTypes,
      },
      story: context.scenario.story,
      narratorPreferenceTypes: context.scenario.narratorPreferenceTypes,
      studyMode: context.record.studyMode,
      studyModeConfig: getStudyModeConfig(context.record.studyMode ?? DEFAULT_STUDY_MODE),
      expiresAt: context.record.expiresAt,
      status: context.record.status,
    };
  });

  fastify.post('/study/sessions/finish', async (request, reply) => {
    const token = getStudyTokenFromHeader(request.headers as Record<string, unknown>);
    if (!token) {
      return reply.code(401).send({ error: 'Missing x-study-session-token header' });
    }
    const record = finishSessionByToken(token);
    if (!record) {
      return reply.code(401).send({ error: 'Invalid or expired study session' });
    }
    return {
      sessionId: record.sessionId,
      status: record.status,
      finishedAt: record.finishedAt ?? null,
      interactionLogFile: record.interactionLogFile ?? null,
    };
  });

  fastify.post('/study/logs/events', async (request, reply) => {
    const token = getStudyTokenFromHeader(request.headers as Record<string, unknown>);
    if (!token) {
      return reply.code(401).send({ error: 'Missing x-study-session-token header' });
    }

    const context = getSessionContextByToken(token);
    if (!context) {
      return reply.code(401).send({ error: 'Invalid or expired study session' });
    }

    if (!hasInteractionLogging(context.record)) {
      return {
        enabled: false,
        logged: 0,
        interactionLogFile: null,
      };
    }

    const body = (request.body ?? {}) as {
      events?: unknown;
    };
    const rawEvents = body.events;
    if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
      return reply.code(400).send({ error: 'events must be a non-empty array' });
    }

    let logged = 0;
    for (const rawEvent of rawEvents) {
      if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) {
        return reply.code(400).send({ error: 'Each event must be an object' });
      }
      const event = rawEvent as {
        type?: unknown;
        payload?: unknown;
        clientTimestamp?: unknown;
      };
      const type = typeof event.type === 'string' ? event.type.trim() : '';
      if (!type) {
        return reply.code(400).send({ error: 'Each event requires a non-empty string type' });
      }

      appendInteractionLog(context.record, {
        type,
        payload: event.payload ?? null,
        clientTimestamp:
          typeof event.clientTimestamp === 'string' && event.clientTimestamp.trim()
            ? event.clientTimestamp.trim()
            : undefined,
      });
      logged += 1;
    }

    return {
      enabled: true,
      logged,
      interactionLogFile: context.record.interactionLogFile ?? null,
    };
  });
}
