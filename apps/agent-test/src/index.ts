import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';

const PROTOCOL_VERSION = 'mvp-0.2';
const DEFAULT_HTTP_PORT = 3400;
const DEFAULT_RELAY_URL = 'ws://localhost:3000/agent/ws';
const DEFAULT_SESSION_ID = 'default';
const DEFAULT_REQUEST_TIMEOUT_MS = 12000;

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
  private connected = false;
  private joined = false;

  private reqSeq = 0;
  private eventSeq = 0;
  private pending = new Map<string, PendingRequest>();
  private events: AgentEvent[] = [];

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

  private applyRelayInboundState(envelope: RelayEnvelope): void {
    switch (envelope.type) {
      case 'relay.joined':
        this.joined = true;
        this.broadcastState();
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
          toolSchema: previous?.toolSchema ?? [],
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
          toolSchema: previous?.toolSchema ?? [],
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

  private async sendRelayRequest(
    type: string,
    payload: Record<string, unknown>,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
  ): Promise<Record<string, unknown>> {
    const requestId = this.nextRequestId();

    this.sendRelayEnvelope({
      type,
      id: requestId,
      payload,
    });

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
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent Test Remote</title>
    <style>
      :root {
        --bg: #050b16;
        --panel: #0f172a;
        --line: #334155;
        --text: #dbeafe;
        --muted: #94a3b8;
        --accent: #22d3ee;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        background: radial-gradient(circle at 25% -10%, #082f49 0%, #020617 55%, #010409 100%);
        color: var(--text);
      }
      .wrap {
        max-width: 1080px;
        margin: 0 auto;
        padding: 20px;
      }
      h1 { margin: 0 0 8px; font-size: 24px; }
      .sub { color: var(--muted); margin-bottom: 16px; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
        gap: 14px;
      }
      .card {
        background: color-mix(in srgb, var(--panel), black 20%);
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 14px;
      }
      .card h2 { margin: 0 0 10px; font-size: 15px; }
      label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
      input, textarea, select, button {
        width: 100%;
        border: 1px solid #475569;
        border-radius: 8px;
        background: #0b1220;
        color: var(--text);
        padding: 9px;
        margin-bottom: 8px;
      }
      textarea {
        min-height: 100px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      button {
        cursor: pointer;
        background: color-mix(in srgb, #06b6d4, black 35%);
        border-color: #0e7490;
        font-weight: 600;
      }
      button:hover { filter: brightness(1.08); }
      .row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .mono {
        border: 1px solid #334155;
        border-radius: 10px;
        background: #020617;
        padding: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        color: #cbd5e1;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 300px;
        overflow: auto;
      }
      .full { margin-top: 14px; }
      .pill {
        display: inline-block;
        border: 1px solid #155e75;
        color: #67e8f9;
        background: #082f49;
        border-radius: 999px;
        padding: 3px 9px;
        font-size: 11px;
        margin-bottom: 10px;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Agent Test Remote</h1>
      <div class="sub">WebSocket remote controller for external-agent protocol testing.</div>
      <div class="pill" id="conn">control ws: connecting...</div>

      <div class="grid">
        <section class="card">
          <h2>Session Control</h2>
          <div class="row">
            <button id="btnReconnect">Relay Reconnect</button>
            <button id="btnSnapshot">Snapshot Get</button>
          </div>
          <div class="row">
            <button id="btnStart">Session Start</button>
            <button id="btnEnd">Session End</button>
          </div>
          <div id="status" class="mono"></div>
        </section>

        <section class="card">
          <h2>Tool Call</h2>
          <label for="toolName">Tool</label>
          <select id="toolName"></select>
          <label for="toolReason">Reason</label>
          <input id="toolReason" value="Manual tool call from agent-test remote" />
          <label for="toolParams">Params (JSON)</label>
          <textarea id="toolParams">{}</textarea>
          <button id="btnTool">Run tool.call</button>
          <div id="toolResult" class="mono"></div>
        </section>

        <section class="card">
          <h2>Agent Message</h2>
          <label for="agentText">Text</label>
          <textarea id="agentText" placeholder="I will select a date to narrow showtimes."></textarea>
          <button id="btnMessage">Run agent.message</button>
          <div id="msgResult" class="mono"></div>
        </section>
      </div>

      <section class="card full">
        <h2>Snapshot</h2>
        <div id="snapshot" class="mono"></div>
      </section>

      <section class="card full">
        <h2>Events</h2>
        <div id="events" class="mono"></div>
      </section>
    </div>

    <script>
      const $ = (id) => document.getElementById(id);
      const connEl = $('conn');
      const statusEl = $('status');
      const snapshotEl = $('snapshot');
      const eventsEl = $('events');
      const toolResultEl = $('toolResult');
      const msgResultEl = $('msgResult');
      const toolNameEl = $('toolName');

      let ws = null;
      let seq = 0;
      let status = {};
      let snapshot = null;
      let eventList = [];

      function nextId(prefix = 'c') {
        seq += 1;
        return prefix + '-' + String(seq).padStart(4, '0');
      }

      function renderStatus() {
        statusEl.textContent = JSON.stringify(status, null, 2);
      }

      function renderSnapshot() {
        snapshotEl.textContent = JSON.stringify(snapshot, null, 2);
        const tools = Array.isArray(snapshot && snapshot.toolSchema) ? snapshot.toolSchema : [];
        const selected = toolNameEl.value;
        toolNameEl.innerHTML = '';

        for (const tool of tools) {
          const name = typeof tool.name === 'string' ? tool.name : '';
          if (!name) continue;
          const option = document.createElement('option');
          option.value = name;
          option.textContent = name;
          toolNameEl.appendChild(option);
        }

        if (selected) {
          toolNameEl.value = selected;
        }
        if (!toolNameEl.value && toolNameEl.options.length > 0) {
          toolNameEl.value = toolNameEl.options[0].value;
        }
      }

      function renderEvents() {
        eventsEl.textContent = JSON.stringify(eventList.slice(-80), null, 2);
      }

      function send(type, payload) {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error('control ws is not connected');
        }
        const id = nextId();
        ws.send(JSON.stringify({ type, id, payload }));
        return id;
      }

      function updateConn(label, ok) {
        connEl.textContent = label;
        connEl.style.borderColor = ok ? '#0e7490' : '#7f1d1d';
        connEl.style.color = ok ? '#67e8f9' : '#fca5a5';
        connEl.style.background = ok ? '#082f49' : '#3f0b0b';
      }

      function connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(protocol + '://' + window.location.host + '/control/ws');

        ws.onopen = () => {
          updateConn('control ws: connected', true);
        };

        ws.onclose = () => {
          updateConn('control ws: disconnected (reconnecting...)', false);
          setTimeout(connect, 1000);
        };

        ws.onerror = () => {
          updateConn('control ws: error', false);
        };

        ws.onmessage = (event) => {
          let msg;
          try {
            msg = JSON.parse(event.data);
          } catch {
            return;
          }

          if (msg.type === 'control.ready') {
            status = msg.payload && msg.payload.status ? msg.payload.status : {};
            snapshot = msg.payload ? msg.payload.snapshot : null;
            eventList = msg.payload && Array.isArray(msg.payload.events) ? msg.payload.events : [];
            renderStatus();
            renderSnapshot();
            renderEvents();
            return;
          }

          if (msg.type === 'control.state') {
            status = msg.payload && msg.payload.status ? msg.payload.status : status;
            if (msg.payload && Object.prototype.hasOwnProperty.call(msg.payload, 'snapshot')) {
              snapshot = msg.payload.snapshot;
              renderSnapshot();
            }
            renderStatus();
            return;
          }

          if (msg.type === 'control.snapshot') {
            snapshot = msg.payload ? msg.payload.snapshot : null;
            renderSnapshot();
            return;
          }

          if (msg.type === 'control.event') {
            const eventItem = msg.payload ? msg.payload.event : null;
            if (eventItem) {
              eventList.push(eventItem);
              if (eventList.length > 300) eventList = eventList.slice(-300);
              renderEvents();
            }
            return;
          }

          if (msg.type === 'control.result') {
            const text = JSON.stringify(msg.payload || {}, null, 2);
            toolResultEl.textContent = text;
            msgResultEl.textContent = text;
            return;
          }

          if (msg.type === 'control.error') {
            const text = JSON.stringify(msg.payload || {}, null, 2);
            toolResultEl.textContent = text;
            msgResultEl.textContent = text;
          }
        };
      }

      $('btnReconnect').addEventListener('click', () => {
        try {
          send('relay.reconnect', {});
        } catch (err) {
          toolResultEl.textContent = String(err);
        }
      });

      $('btnSnapshot').addEventListener('click', () => {
        try {
          send('snapshot.get', {});
        } catch (err) {
          toolResultEl.textContent = String(err);
        }
      });

      $('btnStart').addEventListener('click', () => {
        try {
          send('session.start', { studyId: 'manual', participantId: 'manual' });
        } catch (err) {
          toolResultEl.textContent = String(err);
        }
      });

      $('btnEnd').addEventListener('click', () => {
        try {
          send('session.end', { reason: 'manual-stop' });
        } catch (err) {
          toolResultEl.textContent = String(err);
        }
      });

      $('btnTool').addEventListener('click', () => {
        const toolName = toolNameEl.value;
        const reason = $('toolReason').value;
        let params = {};

        try {
          params = JSON.parse($('toolParams').value || '{}');
        } catch (err) {
          toolResultEl.textContent = 'Invalid JSON: ' + err;
          return;
        }

        try {
          send('tool.call', { toolName, reason, params });
        } catch (err) {
          toolResultEl.textContent = String(err);
        }
      });

      $('btnMessage').addEventListener('click', () => {
        const text = $('agentText').value;
        try {
          send('agent.message', { text });
        } catch (err) {
          msgResultEl.textContent = String(err);
        }
      });

      connect();
    </script>
  </body>
</html>`;
  }
}

const server = new AgentTestServer();

server.start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start agent-test server:', error);
  process.exit(1);
});
