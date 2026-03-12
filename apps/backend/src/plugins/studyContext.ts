import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getSessionContextByToken } from '../study/sessionService';

const PROTECTED_PREFIXES = ['/movies', '/theaters', '/showings', '/seats', '/bookings', '/speech'];

function isProtectedPath(url: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`));
}

function extractToken(request: FastifyRequest): string | null {
  const raw = request.headers['x-study-session-token'];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string' && raw[0].trim()) {
    return raw[0].trim();
  }
  return null;
}

function deny(reply: FastifyReply, message: string): void {
  void reply.code(401).send({
    error: 'STUDY_SESSION_UNAUTHORIZED',
    message,
  });
}

export async function studyContextPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', async (request, reply) => {
    if (!isProtectedPath(request.url)) return;

    const token = extractToken(request);
    if (!token) {
      deny(reply, 'Missing x-study-session-token header.');
      return;
    }

    const context = getSessionContextByToken(token);
    if (!context) {
      deny(reply, 'Study session is invalid, finished, or expired.');
      return;
    }

    request.study = {
      token,
      ...context,
    };
  });
}
