import fs from 'fs';
import path from 'path';
import type { FastifyInstance } from 'fastify';

type Role = 'host' | 'agent';
type Direction = 'in' | 'out' | 'internal';

interface RelayEnvelope {
  v?: string;
  type: string;
  id?: string;
  replyTo?: string;
  payload?: Record<string, unknown>;
}

interface RelayClient {
  id: string;
  role: Role | null;
  sessionId: string | null;
  clientName: string | null;
  socket: RelaySocket;
}

interface RelaySocket {
  readyState: number;
  send: (data: string) => void;
  close: (code?: number) => void;
  on(event: 'message', handler: (raw: unknown) => void): void;
  on(event: 'close', handler: () => void): void;
  on(event: 'error', handler: (error: unknown) => void): void;
}

interface SessionState {
  host: RelayClient | null;
  agents: Set<RelayClient>;
  eventIndex: number;
}

const RELAY_VERSION = 'mvp-0.2';
const DEFAULT_SESSION_ID = 'default';
const LOG_DIR = path.resolve(process.cwd(), 'logs/study');
const ENABLE_RELAY_LOGS = process.env.AGENT_RELAY_LOG_ENABLED === 'true';

const AGENT_TO_HOST_TYPES = new Set([
  'session.start',
  'snapshot.get',
  'tool.call',
  'agent.message',
  'session.end',
]);

const HOST_TO_AGENT_TYPES = new Set([
  'session.started',
  'snapshot.state',
  'tool.result',
  'state.updated',
  'error',
  'session.ended',
  'user.message',
]);

const sessions = new Map<string, SessionState>();

function getOrCreateSession(sessionId: string): SessionState {
  const existing = sessions.get(sessionId);
  if (existing) return existing;

  const created: SessionState = {
    host: null,
    agents: new Set<RelayClient>(),
    eventIndex: 0,
  };
  sessions.set(sessionId, created);
  return created;
}

function toText(raw: unknown): string | null {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf-8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf-8');
  if (Array.isArray(raw)) {
    return Buffer.concat(raw.filter((item): item is Buffer => Buffer.isBuffer(item))).toString(
      'utf-8'
    );
  }
  return null;
}

function parseEnvelope(raw: unknown): RelayEnvelope | null {
  const text = toText(raw);
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as RelayEnvelope;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isSocketOpen(socket: RelaySocket): boolean {
  return socket.readyState === 1;
}

function sendEnvelope(socket: RelaySocket, envelope: RelayEnvelope): boolean {
  if (!isSocketOpen(socket)) return false;
  socket.send(JSON.stringify({ v: RELAY_VERSION, ...envelope }));
  return true;
}

function sendError(
  socket: RelaySocket,
  code: string,
  message: string,
  replyTo?: string
): void {
  sendEnvelope(socket, {
    type: 'error',
    replyTo,
    payload: { code, message },
  });
}

function appendSessionLog(
  sessionId: string,
  direction: Direction,
  type: string,
  payload: unknown
): void {
  if (!ENABLE_RELAY_LOGS) return;

  const session = getOrCreateSession(sessionId);
  const entry = {
    sessionId,
    eventIndex: session.eventIndex++,
    timestamp: new Date().toISOString(),
    direction,
    type,
    payload,
  };

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const filePath = path.join(LOG_DIR, `${sessionId}.jsonl`);
    fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf-8');
  } catch (error) {
    // Prototype logging must never crash relay traffic.
    console.error('Failed to append relay log:', error);
  }
}

function removeClient(client: RelayClient): void {
  if (!client.sessionId) return;
  const session = sessions.get(client.sessionId);
  if (!session) return;

  if (session.host?.id === client.id) {
    session.host = null;
  }
  session.agents.delete(client);

  if (!session.host && session.agents.size === 0) {
    sessions.delete(client.sessionId);
  }
}

function defaultAgentName(clientId: string): string {
  return `agent-${clientId.slice(-6)}`;
}

function resolveAgentName(payload: Record<string, unknown> | undefined, fallbackClientId: string): string {
  const raw = payload?.agentName ?? payload?.clientName ?? payload?.name;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return defaultAgentName(fallbackClientId);
}

function buildPresencePayload(sessionId: string): Record<string, unknown> {
  const session = sessions.get(sessionId);
  if (!session) {
    return {
      sessionId,
      agentCount: 0,
      agents: [],
    };
  }

  const agents = Array.from(session.agents)
    .filter((agent) => isSocketOpen(agent.socket))
    .map((agent) => ({
      id: agent.id,
      name: agent.clientName ?? defaultAgentName(agent.id),
    }));

  return {
    sessionId,
    agentCount: agents.length,
    agents,
  };
}

function notifyHostPresence(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session?.host || !isSocketOpen(session.host.socket)) return;
  const payload = buildPresencePayload(sessionId);
  sendEnvelope(session.host.socket, {
    type: 'relay.presence',
    payload,
  });
  appendSessionLog(sessionId, 'internal', 'relay.presence', payload);
}

function relayToHost(client: RelayClient, message: RelayEnvelope): void {
  const sessionId = client.sessionId;
  if (!sessionId) return;

  const session = getOrCreateSession(sessionId);
  const host = session.host;
  appendSessionLog(sessionId, 'in', message.type, message.payload ?? {});

  if (!host || !isSocketOpen(host.socket)) {
    sendError(client.socket, 'SESSION_NOT_ACTIVE', 'No active host connection for this session.', message.id);
    return;
  }

  sendEnvelope(host.socket, message);
  appendSessionLog(sessionId, 'out', message.type, message.payload ?? {});
}

function relayToAgents(client: RelayClient, message: RelayEnvelope): void {
  const sessionId = client.sessionId;
  if (!sessionId) return;

  const session = getOrCreateSession(sessionId);
  appendSessionLog(sessionId, 'in', message.type, message.payload ?? {});

  let delivered = 0;
  for (const agent of session.agents) {
    if (sendEnvelope(agent.socket, message)) {
      delivered += 1;
    }
  }

  appendSessionLog(sessionId, 'out', message.type, {
    delivered,
    payload: message.payload ?? {},
  });
}

export async function agentRelayRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/agent/ws', { websocket: true }, (socket: RelaySocket) => {
    const client: RelayClient = {
      id: `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: null,
      sessionId: null,
      clientName: null,
      socket,
    };

    sendEnvelope(client.socket, {
      type: 'relay.hello',
      payload: {
        message: 'Send relay.join with role=host|agent',
      },
    });

    client.socket.on('message', (raw: unknown) => {
      const message = parseEnvelope(raw);
      if (!message) {
        sendError(client.socket, 'INVALID_MESSAGE', 'Message must be valid JSON with a string "type".');
        return;
      }

      if (message.type === 'relay.join') {
        const role = message.payload?.role;
        const requestedSessionId = message.payload?.sessionId;
        const payload = message.payload;
        const sessionId =
          typeof requestedSessionId === 'string' && requestedSessionId.trim()
            ? requestedSessionId.trim()
            : DEFAULT_SESSION_ID;

        if (role !== 'host' && role !== 'agent') {
          sendError(client.socket, 'INVALID_MESSAGE', 'relay.join payload.role must be "host" or "agent".', message.id);
          return;
        }

        if (client.sessionId) {
          const previousSessionId = client.sessionId;
          const previousRole = client.role;
          removeClient(client);
          if (previousRole === 'agent') {
            notifyHostPresence(previousSessionId);
          }
        }

        client.role = role;
        client.sessionId = sessionId;
        client.clientName = role === 'agent' ? resolveAgentName(payload, client.id) : null;

        const session = getOrCreateSession(sessionId);

        if (role === 'host') {
          if (session.host && session.host.id !== client.id) {
            sendError(session.host.socket, 'SESSION_NOT_ACTIVE', 'Host connection replaced by a newer host.');
            session.host.socket.close(1000);
          }
          session.host = client;
        } else {
          session.agents.add(client);
        }

        appendSessionLog(sessionId, 'internal', 'relay.join', {
          clientId: client.id,
          role,
          clientName: client.clientName,
        });

        sendEnvelope(client.socket, {
          type: 'relay.joined',
          replyTo: message.id,
          payload: {
            role,
            sessionId,
            ...(role === 'agent' ? { clientName: client.clientName } : {}),
          },
        });
        notifyHostPresence(sessionId);
        return;
      }

      if (!client.role || !client.sessionId) {
        sendError(client.socket, 'SESSION_NOT_ACTIVE', 'You must send relay.join before other messages.', message.id);
        return;
      }

      if (client.role === 'agent') {
        if (!AGENT_TO_HOST_TYPES.has(message.type)) {
          sendError(client.socket, 'INVALID_MESSAGE', `Unsupported message type for agent role: ${message.type}`, message.id);
          return;
        }
        relayToHost(client, message);
        return;
      }

      if (!HOST_TO_AGENT_TYPES.has(message.type)) {
        sendError(client.socket, 'INVALID_MESSAGE', `Unsupported message type for host role: ${message.type}`, message.id);
        return;
      }
      relayToAgents(client, message);
    });

    client.socket.on('close', () => {
      const previousSessionId = client.sessionId;
      const previousRole = client.role;
      if (client.sessionId) {
        appendSessionLog(client.sessionId, 'internal', 'relay.disconnect', {
          clientId: client.id,
          role: client.role,
          clientName: client.clientName,
        });
      }
      removeClient(client);
      if (previousSessionId && previousRole === 'agent') {
        notifyHostPresence(previousSessionId);
      }
    });

    client.socket.on('error', (error: unknown) => {
      if (client.sessionId) {
        appendSessionLog(client.sessionId, 'internal', 'relay.error', {
          clientId: client.id,
          role: client.role,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
  });
}
