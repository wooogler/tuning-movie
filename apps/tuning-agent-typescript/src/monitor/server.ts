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

function html(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Tuning Agent Monitor</title>
    <style>
      :root {
        --bg: #0b1220;
        --panel: #121b2e;
        --text: #e9eefb;
        --muted: #9bb0d3;
        --accent: #48c0ff;
        --ok: #35d08d;
        --warn: #ffcc66;
      }
      body {
        margin: 0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        background: radial-gradient(1200px 700px at 10% -10%, #203155 0%, var(--bg) 45%);
        color: var(--text);
      }
      .wrap {
        max-width: 1200px;
        margin: 20px auto;
        padding: 0 16px;
      }
      .row {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }
      .card {
        background: linear-gradient(160deg, #16243f, var(--panel));
        border: 1px solid #283b61;
        border-radius: 10px;
        padding: 12px;
      }
      .k { color: var(--muted); font-size: 12px; }
      .v { margin-top: 6px; font-size: 14px; word-break: break-word; }
      .good { color: var(--ok); }
      .warn { color: var(--warn); }
      h1 { font-size: 18px; margin: 0 0 12px 0; }
      h2 { font-size: 14px; margin: 14px 0 8px 0; color: var(--accent); }
      pre {
        background: #0f1a31;
        border: 1px solid #27395d;
        border-radius: 10px;
        padding: 10px;
        overflow: auto;
        max-height: 220px;
        margin: 0;
        white-space: pre-wrap;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      th, td {
        border-bottom: 1px solid #243659;
        padding: 6px;
        text-align: left;
        vertical-align: top;
      }
      .small { font-size: 12px; color: var(--muted); }
      .tabs {
        display: flex;
        gap: 8px;
        margin: 12px 0 10px;
      }
      .tab {
        background: #12213e;
        color: var(--text);
        border: 1px solid #2b3f66;
        border-radius: 8px;
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
      }
      .tab.active {
        border-color: #4da6ff;
        box-shadow: 0 0 0 1px #4da6ff33 inset;
        background: #18305a;
      }
      .panel { display: none; }
      .panel.active { display: block; }
      .interaction-list {
        display: grid;
        gap: 12px;
      }
      .interaction-card {
        background: linear-gradient(160deg, #16243f, var(--panel));
        border: 1px solid #283b61;
        border-radius: 10px;
        padding: 12px;
      }
      .interaction-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
        font-size: 12px;
        color: var(--muted);
      }
      .interaction-status {
        font-weight: 600;
        color: var(--accent);
      }
      .llm-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .llm-grid pre {
        max-height: 260px;
      }
      .empty {
        color: var(--muted);
        font-size: 13px;
      }
      @media (max-width: 900px) {
        .row { grid-template-columns: 1fr 1fr; }
        .llm-grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 560px) {
        .row { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Tuning Agent Monitor</h1>
      <div class="small">Live status via SSE (<code>/events</code>)</div>
      <div class="tabs">
        <button class="tab active" data-tab="agent">Agent</button>
        <button class="tab" data-tab="llm">LLM Trace</button>
      </div>

      <section class="panel active" data-panel="agent">
        <div class="row" style="margin-top:12px">
          <div class="card"><div class="k">Phase</div><div class="v" id="phase">-</div></div>
          <div class="card"><div class="k">Stage</div><div class="v" id="stage">-</div></div>
          <div class="card"><div class="k">Session Ready</div><div class="v" id="ready">-</div></div>
          <div class="card"><div class="k">Action In Flight</div><div class="v" id="inflight">-</div></div>
        </div>

        <h2>Runtime</h2>
        <pre id="runtime">-</pre>

        <h2>Last Plan</h2>
        <pre id="plan">-</pre>

        <h2>Last Outcome</h2>
        <pre id="outcome">-</pre>

        <h2>Events</h2>
        <table>
          <thead>
            <tr><th style="width:130px">time</th><th style="width:180px">type</th><th>payload</th></tr>
          </thead>
          <tbody id="events"></tbody>
        </table>
      </section>

      <section class="panel" data-panel="llm">
        <h2>LLM Interactions</h2>
        <div class="small">One card per planner interaction (request → response/error).</div>
        <div id="llmInteractions" class="interaction-list" style="margin-top:10px"></div>
      </section>
    </div>

    <script>
      const state = { monitor: null, events: [], tab: 'agent' };

      function fmt(v) {
        try { return JSON.stringify(v, null, 2); } catch { return String(v); }
      }

      function escapeHtml(value) {
        return String(value).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
      }

      function fmtSafe(v) {
        return escapeHtml(fmt(v));
      }

      function shortTime(iso) {
        if (!iso) return '-';
        const d = new Date(iso);
        return d.toLocaleTimeString();
      }

      function setTab(tab) {
        state.tab = tab;
        const tabs = document.querySelectorAll('.tab');
        for (const node of tabs) {
          node.classList.toggle('active', node.getAttribute('data-tab') === tab);
        }
        const panels = document.querySelectorAll('.panel');
        for (const panel of panels) {
          panel.classList.toggle('active', panel.getAttribute('data-panel') === tab);
        }
      }

      function bindTabs() {
        const tabs = document.querySelectorAll('.tab');
        for (const tab of tabs) {
          tab.addEventListener('click', () => {
            const next = tab.getAttribute('data-tab') || 'agent';
            setTab(next);
          });
        }
      }

      function buildLlmInteractions(events) {
        const interactions = [];
        let current = null;

        for (const event of events) {
          if (!event || typeof event.type !== 'string') continue;
          if (!event.type.startsWith('llm.')) continue;

          if (event.type === 'llm.request') {
            if (current) interactions.push(current);
            current = {
              id: event.index,
              timestamp: event.timestamp,
              request: event.payload,
              raw: null,
              parsed: null,
              error: null,
            };
            continue;
          }

          if (!current) {
            current = {
              id: event.index,
              timestamp: event.timestamp,
              request: null,
              raw: null,
              parsed: null,
              error: null,
            };
          }

          if (event.type === 'llm.response.raw') {
            current.raw = event.payload;
          } else if (event.type === 'llm.response.parsed') {
            current.parsed = event.payload;
            interactions.push(current);
            current = null;
          } else if (event.type === 'llm.error') {
            current.error = event.payload;
            interactions.push(current);
            current = null;
          }
        }

        if (current) interactions.push(current);
        return interactions;
      }

      function updateCards(monitor) {
        document.getElementById('phase').textContent = monitor.phase || '-';
        document.getElementById('stage').textContent = monitor.contextStage || '-';
        const ready = document.getElementById('ready');
        ready.textContent = String(Boolean(monitor.sessionReady));
        ready.className = 'v ' + (monitor.sessionReady ? 'good' : 'warn');
        const inflight = document.getElementById('inflight');
        inflight.textContent = String(Boolean(monitor.actionInFlight));
        inflight.className = 'v ' + (monitor.actionInFlight ? 'warn' : 'good');
      }

      function renderLlmInteractions() {
        const root = document.getElementById('llmInteractions');
        const interactions = buildLlmInteractions(state.events).slice().reverse();
        if (!interactions.length) {
          root.innerHTML = '<div class="empty">No LLM interactions yet.</div>';
          return;
        }

        root.innerHTML = '';
        for (const item of interactions) {
          const status = item.error ? 'error' : item.parsed ? 'completed' : 'pending';
          const card = document.createElement('div');
          card.className = 'interaction-card';
          card.innerHTML =
            '<div class="interaction-head">' +
              '<div>#' + String(item.id) + ' · ' + shortTime(item.timestamp) + '</div>' +
              '<div class="interaction-status">' + status + '</div>' +
            '</div>' +
            '<div class="llm-grid">' +
              '<div><div class="k">Request</div><pre>' + fmtSafe(item.request) + '</pre></div>' +
              '<div><div class="k">Raw Output</div><pre>' + fmtSafe(item.raw) + '</pre></div>' +
              '<div><div class="k">Parsed Output</div><pre>' + fmtSafe(item.parsed) + '</pre></div>' +
              '<div><div class="k">Error</div><pre>' + fmtSafe(item.error) + '</pre></div>' +
            '</div>';
          root.appendChild(card);
        }
      }

      function render() {
        if (!state.monitor) return;
        updateCards(state.monitor);
        document.getElementById('runtime').textContent = fmt({
          startedAt: state.monitor.startedAt,
          relayUrl: state.monitor.relayUrl,
          sessionId: state.monitor.sessionId,
          relayConnected: state.monitor.relayConnected,
          waitingForHost: state.monitor.waitingForHost,
          sessionReady: state.monitor.sessionReady,
          lastUserMessage: state.monitor.lastUserMessage,
          lastTrigger: state.monitor.lastTrigger,
          actionCount: state.monitor.actionCount,
          pendingUserMessages: state.monitor.pendingUserMessages,
        });
        document.getElementById('plan').textContent = fmt(state.monitor.lastPlan);
        document.getElementById('outcome').textContent = fmt(state.monitor.lastOutcome);
        renderLlmInteractions();

        const body = document.getElementById('events');
        body.innerHTML = '';
        for (const event of state.events.slice().reverse()) {
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' + shortTime(event.timestamp) + '</td>' +
            '<td>' + String(event.type) + '</td>' +
            '<td><pre style="margin:0;max-height:120px">' + fmtSafe(event.payload) + '</pre></td>';
          body.appendChild(tr);
        }
      }

      async function bootstrap() {
        bindTabs();
        setTab('agent');
        const res = await fetch('/state');
        const snapshot = await res.json();
        state.monitor = snapshot.state;
        state.events = snapshot.events || [];
        render();

        const es = new EventSource('/events');
        es.addEventListener('snapshot', (ev) => {
          const data = JSON.parse(ev.data);
          state.monitor = data.state;
          state.events = data.events || [];
          render();
        });
        es.addEventListener('state', (ev) => {
          const data = JSON.parse(ev.data);
          state.monitor = data.state;
          render();
        });
        es.addEventListener('event', (ev) => {
          const data = JSON.parse(ev.data);
          state.events = [...state.events, data.event].slice(-300);
          render();
        });
      }

      bootstrap().catch((error) => {
        document.getElementById('runtime').textContent = 'bootstrap failed: ' + String(error);
      });
    </script>
  </body>
</html>`;
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
      const url = req.url ?? '/';

      if (url === '/health') {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (url === '/state') {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ state: this.state, events: this.events }));
        return;
      }

      if (url === '/events') {
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

      res.statusCode = 200;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(html());
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

  private broadcast(event: string, data: unknown): void {
    const chunk = sseData(event, data);
    for (const client of this.clients) {
      client.write(chunk);
    }
  }
}
