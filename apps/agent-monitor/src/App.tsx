import { useEffect, useMemo, useState } from 'react';

type MonitorEvent = {
  index: number;
  timestamp: string;
  type: string;
  payload: unknown;
};

type MonitorState = {
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
  lastPlan: unknown;
  lastOutcome: unknown;
  actionCount: number;
  pendingUserMessages: number;
};

type SnapshotPayload = {
  state: MonitorState;
  events: MonitorEvent[];
};

type StatePayload = {
  state: MonitorState;
};

type EventPayload = {
  event: MonitorEvent;
};

type LlmInteraction = {
  id: number;
  timestamp: string;
  request: unknown;
  raw: unknown;
  parsed: unknown;
  error: unknown;
};

const API_BASE = import.meta.env.VITE_MONITOR_API_BASE || '/monitor-api';
const MAX_EVENTS = 500;

function fmt(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function copyText(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    const json = JSON.stringify(value, null, 2);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

function shortTime(value: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString();
}

function buildLlmInteractions(events: MonitorEvent[]): LlmInteraction[] {
  const interactions: LlmInteraction[] = [];
  let current: LlmInteraction | null = null;

  for (const event of events) {
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

export default function App() {
  const [tab, setTab] = useState<'agent' | 'llm'>('llm');
  const [monitorState, setMonitorState] = useState<MonitorState | null>(null);
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    let closed = false;
    const eventsUrl = `${API_BASE}/events`;

    async function bootstrap() {
      try {
        const res = await fetch(`${API_BASE}/state`);
        if (!res.ok) throw new Error(`state fetch failed (${res.status})`);
        const payload = (await res.json()) as SnapshotPayload;
        if (closed) return;
        setMonitorState(payload.state);
        setEvents(payload.events ?? []);
      } catch (error) {
        if (closed) return;
        setConnection('error');
        setErrorText(error instanceof Error ? error.message : String(error));
        return;
      }

      const es = new EventSource(eventsUrl);

      es.addEventListener('open', () => {
        if (closed) return;
        setConnection('live');
        setErrorText(null);
      });

      es.addEventListener('error', () => {
        if (closed) return;
        setConnection('error');
        setErrorText('event stream disconnected');
      });

      es.addEventListener('snapshot', (event) => {
        if (closed) return;
        const payload = JSON.parse(event.data) as SnapshotPayload;
        setMonitorState(payload.state);
        setEvents(payload.events ?? []);
      });

      es.addEventListener('state', (event) => {
        if (closed) return;
        const payload = JSON.parse(event.data) as StatePayload;
        setMonitorState(payload.state);
      });

      es.addEventListener('event', (event) => {
        if (closed) return;
        const payload = JSON.parse(event.data) as EventPayload;
        setEvents((prev) => [...prev, payload.event].slice(-MAX_EVENTS));
      });

      return () => es.close();
    }

    const cleanupPromise = bootstrap();
    return () => {
      closed = true;
      void cleanupPromise?.then((cleanup) => cleanup?.());
    };
  }, []);

  const llmInteractions = useMemo(() => buildLlmInteractions(events), [events]);
  const recentEvents = useMemo(() => events.slice().reverse().slice(0, 160), [events]);

  async function clearMonitorEvents() {
    if (isClearing) return;
    const confirmed = window.confirm('Clear all monitor events and LLM trace?');
    if (!confirmed) return;

    setIsClearing(true);
    try {
      const res = await fetch(`${API_BASE}/events/clear`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(`clear failed (${res.status})`);
      }
      setErrorText(null);
      setEvents([]);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 pb-10 pt-6">
      <header className="mb-5 rounded-2xl border border-ink-700/70 bg-ink-900/60 p-4 backdrop-blur">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Tuning Agent Monitor</h1>
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="text-mist-300">stream:</span>
            <span
              className={`rounded-full px-2 py-1 ${
                connection === 'live'
                  ? 'bg-ok-500/15 text-ok-500'
                  : connection === 'connecting'
                    ? 'bg-warn-500/15 text-warn-500'
                    : 'bg-danger-500/15 text-danger-500'
              }`}
            >
              {connection}
            </span>
          </div>
        </div>
        <div className="text-xs text-mist-300">
          {errorText ? errorText : 'Live data from /state and /events.'}
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex gap-2">
          <button
            className={`rounded-lg border px-3 py-1.5 ${
              tab === 'llm'
                ? 'border-mist-500 bg-mist-700/20 text-mist-100'
                : 'border-ink-700 bg-ink-900/50 text-mist-300'
            }`}
            onClick={() => setTab('llm')}
            type="button"
          >
            LLM Trace
          </button>
          <button
            className={`rounded-lg border px-3 py-1.5 ${
              tab === 'agent'
                ? 'border-mist-500 bg-mist-700/20 text-mist-100'
                : 'border-ink-700 bg-ink-900/50 text-mist-300'
            }`}
            onClick={() => setTab('agent')}
            type="button"
          >
            Agent
          </button>
        </div>
        <button
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            isClearing
              ? 'cursor-not-allowed border-ink-700 bg-ink-900/50 text-mist-400'
              : 'border-danger-500/60 bg-danger-500/10 text-danger-500 hover:bg-danger-500/20'
          }`}
          disabled={isClearing}
          onClick={() => void clearMonitorEvents()}
          type="button"
        >
          {isClearing ? 'Clearing...' : 'Clear'}
        </button>
      </div>

      {tab === 'agent' ? (
        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Phase" value={monitorState?.phase ?? '-'} />
            <StatCard label="Stage" value={monitorState?.contextStage ?? '-'} />
            <StatCard label="Session Ready" value={String(Boolean(monitorState?.sessionReady))} />
            <StatCard label="Action In Flight" value={String(Boolean(monitorState?.actionInFlight))} />
          </div>

          <JsonCard
            title="Runtime"
            value={{
              startedAt: monitorState?.startedAt,
              relayUrl: monitorState?.relayUrl,
              sessionId: monitorState?.sessionId,
              relayConnected: monitorState?.relayConnected,
              waitingForHost: monitorState?.waitingForHost,
              sessionReady: monitorState?.sessionReady,
              lastUserMessage: monitorState?.lastUserMessage,
              lastTrigger: monitorState?.lastTrigger,
              actionCount: monitorState?.actionCount,
              pendingUserMessages: monitorState?.pendingUserMessages,
            }}
          />
          <JsonCard title="Last Plan" value={monitorState?.lastPlan ?? null} />
          <JsonCard title="Last Outcome" value={monitorState?.lastOutcome ?? null} />

          <section className="rounded-2xl border border-ink-700/70 bg-ink-900/50 p-4">
            <h2 className="mb-3 text-sm font-semibold text-mist-200">Events</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-xs">
                <thead>
                  <tr className="text-left text-mist-300">
                    <th className="border-b border-ink-700 px-2 py-2">time</th>
                    <th className="border-b border-ink-700 px-2 py-2">type</th>
                    <th className="border-b border-ink-700 px-2 py-2">payload</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((event) => (
                    <tr key={event.index}>
                      <td className="border-b border-ink-800 px-2 py-2 align-top text-mist-300">
                        {shortTime(event.timestamp)}
                      </td>
                      <td className="border-b border-ink-800 px-2 py-2 align-top text-mist-200">{event.type}</td>
                      <td className="border-b border-ink-800 px-2 py-2 align-top">
                        <pre className="max-h-44 overflow-auto rounded-md border border-ink-700 bg-ink-950/70 p-2 font-mono text-[11px] text-mist-100">
                          {fmt(event.payload)}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="text-xs text-mist-300">One card per planner interaction (request → response/error).</div>
          {llmInteractions.length === 0 ? (
            <section className="rounded-2xl border border-ink-700/70 bg-ink-900/50 p-4 text-sm text-mist-300">
              No LLM interactions yet.
            </section>
          ) : (
            llmInteractions.map((item) => {
              const status = item.error ? 'error' : item.parsed ? 'completed' : 'pending';
              return (
                <article key={item.id} className="rounded-2xl border border-ink-700/70 bg-ink-900/50 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-mist-300">
                      #{item.id} · {shortTime(item.timestamp)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 font-semibold ${
                        status === 'completed'
                          ? 'bg-ok-500/15 text-ok-500'
                          : status === 'pending'
                            ? 'bg-warn-500/15 text-warn-500'
                            : 'bg-danger-500/15 text-danger-500'
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <TraceBlock title="Request" value={item.request} copyable />
                    <TraceBlock title="Response" value={item.parsed} copyable />
                  </div>
                  {item.error !== null && item.error !== undefined ? (
                    <div className="mt-3">
                      <TraceBlock title="Error" value={item.error} />
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-xl border border-ink-700/70 bg-ink-900/55 p-3">
      <div className="text-[11px] uppercase tracking-wide text-mist-300">{label}</div>
      <div className="mt-2 text-sm font-semibold text-mist-100">{value}</div>
    </section>
  );
}

function JsonCard({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="rounded-2xl border border-ink-700/70 bg-ink-900/50 p-4">
      <h2 className="mb-3 text-sm font-semibold text-mist-200">{title}</h2>
      <pre className="max-h-80 overflow-auto rounded-md border border-ink-700 bg-ink-950/70 p-3 font-mono text-[11px] text-mist-100">
        {fmt(value)}
      </pre>
    </section>
  );
}

function TraceBlock({
  title,
  value,
  copyable = false,
}: {
  title: string;
  value: unknown;
  copyable?: boolean;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 1200);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(copyText(value));
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-mist-300">{title}</div>
        {copyable ? (
          <button
            className={`rounded border px-2 py-0.5 text-[11px] ${
              copyState === 'copied'
                ? 'border-ok-500/60 bg-ok-500/15 text-ok-500'
                : copyState === 'error'
                  ? 'border-danger-500/60 bg-danger-500/15 text-danger-500'
                  : 'border-ink-600 bg-ink-900/60 text-mist-200 hover:border-mist-500'
            }`}
            onClick={() => void handleCopy()}
            type="button"
          >
            {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Failed' : 'Copy'}
          </button>
        ) : null}
      </div>
      <pre className="max-h-72 overflow-auto rounded-md border border-ink-700 bg-ink-950/70 p-2 font-mono text-[11px] text-mist-100">
        {fmt(value)}
      </pre>
    </section>
  );
}
