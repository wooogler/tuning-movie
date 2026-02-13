import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import { PANEL_HTML } from './panelHtml';

const PROTOCOL_VERSION = 'mvp-0.2';
const DEFAULT_HTTP_PORT = 3400;
const DEFAULT_RELAY_URL = 'ws://localhost:3000/agent/ws';
const DEFAULT_SESSION_ID = 'default';
const DEFAULT_REQUEST_TIMEOUT_MS = 12000;
const SNAPSHOT_POLL_INTERVAL_MS = 2000;

type EventDirection = 'in' | 'out' | 'internal';

interface RelayEnvelope {
  v?: string;
  type: string;
  id?: string;
  replyTo?: string;
  payload?: Record<string, unknown>;
}

interface ControlEnvelope {
  type: string;
  id?: string;
  replyTo?: string;
  payload?: Record<string, unknown>;
}

interface RuntimeSnapshot {
  sessionId: string;
  uiSpec: unknown | null;
  messageHistory: unknown[];
  toolSchema: unknown[];
}

interface AgentEvent {
  index: number;
  timestamp: string;
  direction: EventDirection;
  type: string;
  id?: string;
  replyTo?: string;
  payload: unknown;
}

interface PendingRequest {
  requestType: string;
  resolve: (message: RelayEnvelope) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

class RelayRequestError extends Error {
  envelope: RelayEnvelope;

  constructor(envelope: RelayEnvelope) {
    const payload = envelope.payload ?? {};
    const code = typeof payload.code === 'string' ? payload.code : 'RELAY_ERROR';
    const message =
      typeof payload.message === 'string' ? payload.message : 'Relay request failed with unknown error';
    super(`${code}: ${message}`);
    this.envelope = envelope;
    this.name = 'RelayRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  return {};
}

function wsStateName(readyState: number | undefined): string {
  switch (readyState) {
    case WebSocket.CONNECTING:
      return 'CONNECTING';
    case WebSocket.OPEN:
      return 'OPEN';
    case WebSocket.CLOSING:
      return 'CLOSING';
    case WebSocket.CLOSED:
      return 'CLOSED';
    default:
      return 'UNKNOWN';
  }
}

function parseText(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf-8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf-8');
  if (Array.isArray(raw)) {
    const chunks = raw.filter((part): part is Buffer => Buffer.isBuffer(part));
    return Buffer.concat(chunks).toString('utf-8');
  }
  return String(raw);
}

class AgentTestServer {
  private readonly app = Fastify({ logger: true });
  private readonly relayUrl: string;
  private readonly sessionId: string;
  private readonly httpPort: number;

  private relayWs: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private snapshotPollTimer: NodeJS.Timeout | null = null;
  private connected = false;
  private joined = false;

  private reqSeq = 0;
  private eventSeq = 0;
  private pending = new Map<string, PendingRequest>();
  private events: AgentEvent[] = [];
  private snapshotSyncInFlight = false;
  private snapshotRetryTimer: NodeJS.Timeout | null = null;

  private snapshot: RuntimeSnapshot | null = null;
  private lastUserMessage: { text: string; stage?: string; timestamp: string } | null = null;

  private controlSockets = new Set<WebSocket>();

  constructor() {
    this.relayUrl = process.env.AGENT_RELAY_URL || DEFAULT_RELAY_URL;
    this.sessionId = process.env.AGENT_SESSION_ID || DEFAULT_SESSION_ID;
    this.httpPort = Number(process.env.AGENT_TEST_PORT || DEFAULT_HTTP_PORT);
  }

  async start(): Promise<void> {
    await this.app.register(websocket);
    this.registerRoutes();
    this.connectRelay();

    await this.app.listen({ host: '0.0.0.0', port: this.httpPort });
    this.app.log.info(`agent-test server listening on http://localhost:${this.httpPort}`);
    this.app.log.info(`relay target: ${this.relayUrl} (sessionId=${this.sessionId})`);

    process.on('SIGINT', async () => {
      await this.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.shutdown();
      process.exit(0);
    });
  }

  private async shutdown(): Promise<void> {
    this.pushEvent('internal', 'server.shutdown', {
      pendingCount: this.pending.size,
      controlSockets: this.controlSockets.size,
    });

    for (const [id, entry] of this.pending.entries()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(`Server is shutting down. Request canceled: ${id}`));
      this.pending.delete(id);
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopSnapshotPolling();
    if (this.snapshotRetryTimer) {
      clearTimeout(this.snapshotRetryTimer);
      this.snapshotRetryTimer = null;
    }

    for (const socket of this.controlSockets) {
      socket.close();
    }
    this.controlSockets.clear();

    if (this.relayWs) {
      this.relayWs.removeAllListeners();
      this.relayWs.close();
      this.relayWs = null;
    }

    await this.app.close();
  }

  private registerRoutes(): void {
    this.app.get('/', async (_request, reply) => {
      reply.type('text/html').send(this.renderPanelHtml());
    });

    this.app.get('/health', async () => {
      return { status: 'ok' };
    });

    this.app.get('/control/ws', { websocket: true }, (socket: WebSocket) => {
      this.controlSockets.add(socket);
      this.sendControl(socket, {
        type: 'control.ready',
        payload: {
          status: this.getStatus(),
          snapshot: this.snapshot,
          events: this.events.slice(-40),
        },
      });
      if (this.connected && this.joined && this.snapshot === null) {
        this.requestSnapshotSync('control.ready');
      }

      socket.on('message', (raw: unknown) => {
        const text = parseText(raw);
        let message: ControlEnvelope;

        try {
          message = JSON.parse(text) as ControlEnvelope;
        } catch {
          this.sendControl(socket, {
            type: 'control.error',
            payload: {
              code: 'INVALID_MESSAGE',
              message: 'Control message must be valid JSON',
            },
          });
          return;
        }

        this.handleControlMessage(socket, message).catch((error) => {
          this.sendControl(socket, {
            type: 'control.error',
            replyTo: message.id,
            payload: {
              code: 'CONTROL_EXECUTION_FAILED',
              message: error instanceof Error ? error.message : 'Control execution failed',
            },
          });
        });
      });

      socket.on('close', () => {
        this.controlSockets.delete(socket);
      });

      socket.on('error', () => {
        this.controlSockets.delete(socket);
      });
    });
  }

  private async handleControlMessage(socket: WebSocket, message: ControlEnvelope): Promise<void> {
    if (!message || typeof message.type !== 'string') {
      this.sendControl(socket, {
        type: 'control.error',
        replyTo: message?.id,
        payload: {
          code: 'INVALID_MESSAGE',
          message: 'Control message requires a string type',
        },
      });
      return;
    }

    const payload = toJsonObject(message.payload);

    switch (message.type) {
      case 'state.get':
        this.sendControl(socket, {
          type: 'control.state',
          replyTo: message.id,
          payload: {
            status: this.getStatus(),
            snapshot: this.snapshot,
          },
        });
        return;

      case 'relay.reconnect':
        this.connectRelay({ force: true });
        this.sendControl(socket, {
          type: 'control.result',
          replyTo: message.id,
          payload: { ok: true },
        });
        return;

      case 'session.start': {
        const result = await this.sendRelayRequestOrControlError(socket, message.id, 'session.start', payload);
        if (result) {
          this.sendControl(socket, {
            type: 'control.result',
            replyTo: message.id,
            payload: result,
          });
        }
        return;
      }

      case 'snapshot.get': {
        const result = await this.sendRelayRequestOrControlError(socket, message.id, 'snapshot.get', {});
        if (result) {
          this.sendControl(socket, {
            type: 'control.result',
            replyTo: message.id,
            payload: result,
          });
        }
        return;
      }

      case 'tool.call': {
        const toolName = payload.toolName;
        if (typeof toolName !== 'string' || !toolName.trim()) {
          this.sendControl(socket, {
            type: 'control.error',
            replyTo: message.id,
            payload: {
              code: 'INVALID_PARAMS',
              message: 'tool.call requires non-empty payload.toolName',
            },
          });
          return;
        }

        const params = isRecord(payload.params) ? payload.params : {};
        const reason =
          typeof payload.reason === 'string' && payload.reason.trim()
            ? payload.reason.trim()
            : 'Manual tool call from agent-test panel';

        const result = await this.sendRelayRequestOrControlError(socket, message.id, 'tool.call', {
          toolName: toolName.trim(),
          params,
          reason,
        });

        if (result) {
          this.sendControl(socket, {
            type: 'control.result',
            replyTo: message.id,
            payload: result,
          });
        }
        return;
      }

      case 'agent.message': {
        const text = payload.text;
        if (typeof text !== 'string' || !text.trim()) {
          this.sendControl(socket, {
            type: 'control.error',
            replyTo: message.id,
            payload: {
              code: 'INVALID_PARAMS',
              message: 'agent.message requires non-empty payload.text',
            },
          });
          return;
        }

        if (!this.connected || !this.joined) {
          this.sendControl(socket, {
            type: 'control.error',
            replyTo: message.id,
            payload: {
              code: 'SESSION_NOT_ACTIVE',
              message: 'Relay is not joined yet',
            },
          });
          return;
        }

        const id = this.nextRequestId();
        this.sendRelayEnvelope({
          type: 'agent.message',
          id,
          payload: { text: text.trim() },
        });

        this.sendControl(socket, {
          type: 'control.result',
          replyTo: message.id,
          payload: {
            ok: true,
            requestId: id,
            accepted: true,
          },
        });
        return;
      }

      case 'session.end': {
        const reason =
          typeof payload.reason === 'string' && payload.reason.trim() ? payload.reason.trim() : 'manual-stop';

        const result = await this.sendRelayRequestOrControlError(socket, message.id, 'session.end', {
          reason,
        });

        if (result) {
          this.sendControl(socket, {
            type: 'control.result',
            replyTo: message.id,
            payload: result,
          });
        }
        return;
      }

      default:
        this.sendControl(socket, {
          type: 'control.error',
          replyTo: message.id,
          payload: {
            code: 'INVALID_MESSAGE',
            message: `Unknown control message type: ${message.type}`,
          },
        });
    }
  }

  private async sendRelayRequestOrControlError(
    socket: WebSocket,
    replyTo: string | undefined,
    type: string,
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    if (!this.connected || !this.joined) {
      this.sendControl(socket, {
        type: 'control.error',
        replyTo,
        payload: {
          code: 'SESSION_NOT_ACTIVE',
          message: 'Relay is not joined yet',
        },
      });
      return null;
    }

    try {
      const result = await this.sendRelayRequest(type, payload);
      return result;
    } catch (error) {
      if (error instanceof RelayRequestError) {
        this.sendControl(socket, {
          type: 'control.error',
          replyTo,
          payload: {
            code:
              typeof error.envelope.payload?.code === 'string'
                ? error.envelope.payload.code
                : 'RELAY_ERROR',
            message:
              typeof error.envelope.payload?.message === 'string'
                ? error.envelope.payload.message
                : error.message,
            envelope: error.envelope,
          },
        });
        return null;
      }

      this.sendControl(socket, {
        type: 'control.error',
        replyTo,
        payload: {
          code: 'CONTROL_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown control error',
        },
      });
      return null;
    }
  }

  private connectRelay(options?: { force?: boolean }): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.relayWs && !options?.force && this.relayWs.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.relayWs) {
      this.relayWs.removeAllListeners();
      this.relayWs.close();
      this.relayWs = null;
    }

    this.pushEvent('internal', 'relay.connecting', {
      relayUrl: this.relayUrl,
      sessionId: this.sessionId,
      force: Boolean(options?.force),
    });
    this.broadcastState();

    const ws = new WebSocket(this.relayUrl);
    this.relayWs = ws;

    ws.on('open', () => {
      this.connected = true;
      this.joined = false;
      this.startSnapshotPolling();

      this.pushEvent('internal', 'relay.open', {});
      this.broadcastState();

      this.sendRelayEnvelope({
        type: 'relay.join',
        id: this.nextRequestId('join'),
        payload: {
          role: 'agent',
          sessionId: this.sessionId,
        },
      });
    });

    ws.on('message', (raw: unknown) => {
      this.handleRelayInbound(raw);
    });

    ws.on('close', () => {
      this.connected = false;
      this.joined = false;
      this.stopSnapshotPolling();
      this.snapshotSyncInFlight = false;
      if (this.snapshotRetryTimer) {
        clearTimeout(this.snapshotRetryTimer);
        this.snapshotRetryTimer = null;
      }

      this.pushEvent('internal', 'relay.close', {
        reconnectInMs: 1200,
      });
      this.broadcastState();

      for (const [id, entry] of this.pending.entries()) {
        clearTimeout(entry.timer);
        entry.reject(new Error(`Relay disconnected before response: ${id}`));
      }
      this.pending.clear();

      this.reconnectTimer = setTimeout(() => {
        this.connectRelay();
      }, 1200);
    });

    ws.on('error', (error: Error) => {
      this.pushEvent('internal', 'relay.error', {
        message: error.message,
      });
      this.broadcastState();
    });
  }

  private startSnapshotPolling(): void {
    if (this.snapshotPollTimer) return;

    this.snapshotPollTimer = setInterval(() => {
      if (!this.connected || !this.joined) return;
      if (this.controlSockets.size === 0) return;

      const hasPendingSnapshot = Array.from(this.pending.values()).some(
        (entry) => entry.requestType === 'snapshot.get'
      );
      if (hasPendingSnapshot) return;

      this.requestSnapshotSync('snapshot.poll');
    }, SNAPSHOT_POLL_INTERVAL_MS);
  }

  private stopSnapshotPolling(): void {
    if (!this.snapshotPollTimer) return;
    clearInterval(this.snapshotPollTimer);
    this.snapshotPollTimer = null;
  }

  private handleRelayInbound(raw: unknown): void {
    const text = parseText(raw);

    let envelope: RelayEnvelope;
    try {
      envelope = JSON.parse(text) as RelayEnvelope;
    } catch {
      this.pushEvent('internal', 'relay.invalid-json', { text });
      return;
    }

    if (!envelope || typeof envelope.type !== 'string') {
      this.pushEvent('internal', 'relay.invalid-envelope', { envelope });
      return;
    }

    this.pushEvent('in', envelope.type, envelope.payload ?? {}, envelope);
    this.applyRelayInboundState(envelope);

    if (!envelope.replyTo) {
      this.tryResolvePendingWithoutReplyTo(envelope);
      return;
    }

    const pending = this.pending.get(envelope.replyTo);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(envelope.replyTo);

    if (envelope.type === 'error') {
      pending.reject(new RelayRequestError(envelope));
      return;
    }

    pending.resolve(envelope);
  }

  private tryResolvePendingWithoutReplyTo(envelope: RelayEnvelope): void {
    const expectedRequestTypeByResponseType: Record<string, string> = {
      'session.started': 'session.start',
      'snapshot.state': 'snapshot.get',
      'tool.result': 'tool.call',
      'session.ended': 'session.end',
    };

    const expectedRequestType = expectedRequestTypeByResponseType[envelope.type];
    if (!expectedRequestType) {
      return;
    }

    const pendingEntry = Array.from(this.pending.entries()).find(
      ([, entry]) => entry.requestType === expectedRequestType
    );
    if (!pendingEntry) {
      return;
    }

    const [requestId, pending] = pendingEntry;
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    pending.resolve({
      ...envelope,
      replyTo: requestId,
    });

    this.pushEvent('internal', 'relay.missing-replyTo-recovered', {
      responseType: envelope.type,
      recoveredReplyTo: requestId,
    });
  }

  private applyRelayInboundState(envelope: RelayEnvelope): void {
    switch (envelope.type) {
      case 'relay.joined':
        this.joined = true;
        this.broadcastState();
        if (this.snapshot === null) {
          this.requestSnapshotSync('relay.joined');
        }
        return;

      case 'snapshot.state': {
        const payload = toJsonObject(envelope.payload);
        this.snapshot = {
          sessionId:
            typeof payload.sessionId === 'string' && payload.sessionId.trim()
              ? payload.sessionId
              : this.sessionId,
          uiSpec: payload.uiSpec ?? null,
          messageHistory: Array.isArray(payload.messageHistory) ? payload.messageHistory : [],
          toolSchema: Array.isArray(payload.toolSchema) ? payload.toolSchema : [],
        };
        if (this.snapshotRetryTimer) {
          clearTimeout(this.snapshotRetryTimer);
          this.snapshotRetryTimer = null;
        }
        this.broadcastSnapshot();
        this.broadcastState();
        return;
      }

      case 'tool.result': {
        const payload = toJsonObject(envelope.payload);
        const previous = this.snapshot;
        this.snapshot = {
          sessionId: previous?.sessionId ?? this.sessionId,
          uiSpec: payload.uiSpec ?? previous?.uiSpec ?? null,
          messageHistory: Array.isArray(payload.messageHistory)
            ? payload.messageHistory
            : previous?.messageHistory ?? [],
          toolSchema: Array.isArray(payload.toolSchema)
            ? payload.toolSchema
            : previous?.toolSchema ?? [],
        };
        this.broadcastSnapshot();
        return;
      }

      case 'state.updated': {
        const payload = toJsonObject(envelope.payload);
        const previous = this.snapshot;

        this.snapshot = {
          sessionId: previous?.sessionId ?? this.sessionId,
          uiSpec: payload.uiSpec ?? previous?.uiSpec ?? null,
          messageHistory: Array.isArray(payload.messageHistory)
            ? payload.messageHistory
            : previous?.messageHistory ?? [],
          toolSchema: Array.isArray(payload.toolSchema)
            ? payload.toolSchema
            : previous?.toolSchema ?? [],
        };
        this.broadcastSnapshot();
        return;
      }

      case 'user.message': {
        const payload = toJsonObject(envelope.payload);
        const text = typeof payload.text === 'string' ? payload.text : '';
        const stage = typeof payload.stage === 'string' ? payload.stage : undefined;
        this.lastUserMessage = {
          text,
          stage,
          timestamp: new Date().toISOString(),
        };
        this.broadcastState();
        return;
      }

      case 'session.ended':
        this.snapshot = null;
        this.broadcastSnapshot();
        this.broadcastState();
        return;

      default:
        return;
    }
  }

  private requestSnapshotSync(reason: string): void {
    if (!this.connected || !this.joined) return;
    if (this.snapshotSyncInFlight) return;

    this.snapshotSyncInFlight = true;
    this.sendRelayRequest('snapshot.get', {})
      .catch((error) => {
        this.pushEvent('internal', 'snapshot.sync.failed', {
          reason,
          message: error instanceof Error ? error.message : String(error),
        });
        this.broadcastState();
        this.scheduleSnapshotRetry(reason);
      })
      .finally(() => {
        this.snapshotSyncInFlight = false;
      });
  }

  private scheduleSnapshotRetry(reason: string): void {
    if (this.snapshot !== null) return;
    if (!this.connected || !this.joined) return;
    if (this.snapshotRetryTimer) return;

    this.snapshotRetryTimer = setTimeout(() => {
      this.snapshotRetryTimer = null;
      this.requestSnapshotSync(`retry:${reason}`);
    }, 1500);
  }

  private async sendRelayRequest(
    type: string,
    payload: Record<string, unknown>,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
  ): Promise<Record<string, unknown>> {
    const requestId = this.nextRequestId();

    const response = await new Promise<RelayEnvelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Request timeout (${type}, id=${requestId})`));
      }, timeoutMs);

      this.pending.set(requestId, {
        requestType: type,
        resolve,
        reject,
        timer,
      });

      try {
        this.sendRelayEnvelope({
          type,
          id: requestId,
          payload,
        });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });

    return {
      ok: true,
      requestId,
      response,
    };
  }

  private sendRelayEnvelope(envelope: RelayEnvelope): void {
    if (!this.relayWs || this.relayWs.readyState !== WebSocket.OPEN) {
      throw new Error('Relay websocket is not open');
    }

    const wire = {
      v: PROTOCOL_VERSION,
      ...envelope,
    };

    this.relayWs.send(JSON.stringify(wire));
    this.pushEvent('out', envelope.type, envelope.payload ?? {}, envelope);
  }

  private nextRequestId(prefix = 'req'): string {
    this.reqSeq += 1;
    return `${prefix}-${this.reqSeq.toString().padStart(4, '0')}`;
  }

  private pushEvent(
    direction: EventDirection,
    type: string,
    payload: unknown,
    envelope?: RelayEnvelope
  ): void {
    this.eventSeq += 1;
    const event: AgentEvent = {
      index: this.eventSeq,
      timestamp: new Date().toISOString(),
      direction,
      type,
      id: envelope?.id,
      replyTo: envelope?.replyTo,
      payload,
    };

    this.events.push(event);
    if (this.events.length > 500) {
      this.events = this.events.slice(-500);
    }

    this.broadcastControl({
      type: 'control.event',
      payload: { event },
    });
  }

  private getStatus(): Record<string, unknown> {
    return {
      relayUrl: this.relayUrl,
      sessionId: this.sessionId,
      connected: this.connected,
      joined: this.joined,
      socketState: wsStateName(this.relayWs?.readyState),
      pendingRequests: this.pending.size,
      hasSnapshot: this.snapshot !== null,
      controlClients: this.controlSockets.size,
      lastUserMessage: this.lastUserMessage,
    };
  }

  private sendControl(socket: WebSocket, message: ControlEnvelope): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  private broadcastControl(message: ControlEnvelope): void {
    for (const socket of this.controlSockets) {
      this.sendControl(socket, message);
    }
  }

  private broadcastState(): void {
    this.broadcastControl({
      type: 'control.state',
      payload: {
        status: this.getStatus(),
      },
    });
  }

  private broadcastSnapshot(): void {
    this.broadcastControl({
      type: 'control.snapshot',
      payload: {
        snapshot: this.snapshot,
      },
    });
  }

  private renderPanelHtml(): string {
    return PANEL_HTML;
  }
}

const server = new AgentTestServer();

server.start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start agent-test server:', error);
  process.exit(1);
});
