import http from 'node:http';
import type { ActionOutcome, PerceivedContext, PlannedAction } from '../types';

interface MonitorOptions {
  port: number;
  relayUrl: string;
  sessionId: string;
}

interface MonitorEvent {
  index: number;
  timestamp: string;
  type: string;
  payload: unknown;
}

interface MonitorState {
  startedAt: string;
  relayUrl: string;
  sessionId: string;
  phase: string;
  relayConnected: boolean;
  waitingForHost: boolean;
  sessionReady: boolean;
  actionInFlight: boolean;
  contextStage: string | null;
  lastUserMessage: string | null;
  lastTrigger: string | null;
  lastPlan: PlannedAction | null;
  lastOutcome: ActionOutcome | null;
  actionCount: number;
  pendingUserMessages: number;
}

const MAX_EVENTS = 300;

function nowIso(): string {
  return new Date().toISOString();
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function sseData(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${toJson(data)}\n\n`;
}

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(toJson(body));
}

export class AgentMonitorServer {
  private readonly port: number;
  private readonly clients = new Set<http.ServerResponse>();
  private readonly events: MonitorEvent[] = [];
  private sequence = 0;
  private server: http.Server | null = null;
  private state: MonitorState;

  constructor(options: MonitorOptions) {
    this.port = options.port;
    this.state = {
      startedAt: nowIso(),
      relayUrl: options.relayUrl,
      sessionId: options.sessionId,
      phase: 'booting',
      relayConnected: false,
      waitingForHost: false,
      sessionReady: false,
      actionInFlight: false,
      contextStage: null,
      lastUserMessage: null,
      lastTrigger: null,
      lastPlan: null,
      lastOutcome: null,
      actionCount: 0,
      pendingUserMessages: 0,
    };
  }

  async start(): Promise<void> {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      const method = req.method ?? 'GET';
      const requestUrl = req.url ?? '/';
      const pathname = requestUrl.split('?')[0] || '/';

      if (pathname === '/health') {
        sendJson(res, 200, { status: 'ok' });
        return;
      }

      if (pathname === '/state') {
        sendJson(res, 200, { state: this.state, events: this.events });
        return;
      }

      if (pathname === '/events') {
        res.statusCode = 200;
        res.setHeader('content-type', 'text/event-stream; charset=utf-8');
        res.setHeader('cache-control', 'no-cache, no-transform');
        res.setHeader('connection', 'keep-alive');
        res.write(sseData('snapshot', { state: this.state, events: this.events }));
        this.clients.add(res);

        req.on('close', () => {
          this.clients.delete(res);
        });
        return;
      }

      if (pathname === '/events/clear') {
        if (method !== 'POST') {
          sendJson(res, 405, {
            error: 'method_not_allowed',
            message: 'Use POST /events/clear.',
          });
          return;
        }
        this.clearEvents();
        sendJson(res, 200, { ok: true, eventsCleared: true });
        return;
      }

      if (pathname === '/') {
        sendJson(res, 200, {
          service: 'tuning-agent-monitor-api',
          status: 'ok',
          ui: 'Use apps/agent-monitor dashboard (default http://localhost:3501).',
          endpoints: ['/health', '/state', '/events', 'POST /events/clear'],
        });
        return;
      }

      sendJson(res, 404, {
        error: 'not_found',
        message: 'Use /health, /state, or /events.',
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(this.port, '0.0.0.0', () => resolve());
    });
  }

  close(): void {
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();
    this.server?.close();
    this.server = null;
  }

  updateState(partial: Partial<MonitorState>): void {
    this.state = { ...this.state, ...partial };
    this.broadcast('state', { state: this.state });
  }

  updateContext(context: PerceivedContext | null): void {
    if (!context) return;
    this.updateState({
      contextStage: context.stage ?? null,
      lastUserMessage: context.lastUserMessage?.text ?? null,
    });
  }

  setLastPlan(action: PlannedAction | null, trigger: string): void {
    if (!action) return;
    this.updateState({
      lastPlan: action,
      lastTrigger: trigger,
    });
  }

  setLastOutcome(outcome: ActionOutcome): void {
    this.updateState({
      lastOutcome: outcome,
      actionCount: this.state.actionCount + 1,
    });
  }

  pushEvent(type: string, payload: unknown): void {
    const event: MonitorEvent = {
      index: ++this.sequence,
      timestamp: nowIso(),
      type,
      payload,
    };
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
    this.broadcast('event', { event });
  }

  private clearEvents(): void {
    this.events.length = 0;
    this.sequence = 0;
    this.broadcast('snapshot', { state: this.state, events: this.events });
  }

  private broadcast(event: string, data: unknown): void {
    const chunk = sseData(event, data);
    for (const client of this.clients) {
      if (client.writableEnded || client.destroyed) {
        this.clients.delete(client);
        continue;
      }
      client.write(chunk);
    }
  }
}
