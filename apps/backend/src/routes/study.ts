import type { FastifyInstance } from 'fastify';
import {
  createStudySession,
  finishSessionByToken,
  getSessionContextByToken,
  listScenarios,
} from '../study/sessionService';
import { getStudyModeConfig, isStudyModeId, DEFAULT_STUDY_MODE } from '../study/modes';

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
    };
    const scenarioId = typeof body.scenarioId === 'string' ? body.scenarioId.trim() : '';
    const studyModeInput = typeof body.studyMode === 'string' ? body.studyMode.trim() : undefined;
    const participantId =
      typeof body.participantId === 'string' ? body.participantId.trim() : undefined;

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
      });
      return {
        sessionId: created.record.sessionId,
        relaySessionId: created.record.relaySessionId,
        participantId: created.record.participantId,
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
    };
  });
}
