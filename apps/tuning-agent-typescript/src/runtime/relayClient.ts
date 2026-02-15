import WebSocket from 'ws';
import { EventBus } from './eventBus';
import { PROTOCOL_VERSION, type RelayEnvelope } from '../types';

interface PendingRequest {
  resolve: (envelope: RelayEnvelope) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface RelayClientOptions {
  relayUrl: string;
  sessionId: string;
  requestTimeoutMs?: number;
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

export class RelayClient {
  readonly messages = new EventBus<RelayEnvelope>();

  private ws: WebSocket | null = null;
  private readonly relayUrl: string;
  private readonly sessionId: string;
  private readonly requestTimeoutMs: number;
  private requestSeq = 0;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(options: RelayClientOptions) {
    this.relayUrl = options.relayUrl;
    this.sessionId = options.sessionId;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10000;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.relayUrl);
      this.ws = ws;

      ws.on('open', () => {
        void this.join()
          .then(() => resolve())
          .catch(reject);
      });

      ws.on('message', (raw: unknown) => {
        const text = parseText(raw);
        let envelope: RelayEnvelope;

        try {
          envelope = JSON.parse(text) as RelayEnvelope;
        } catch {
          return;
        }

        if (envelope.replyTo && this.pending.has(envelope.replyTo)) {
          const entry = this.pending.get(envelope.replyTo);
          if (entry) {
            clearTimeout(entry.timer);
            this.pending.delete(envelope.replyTo);
            if (envelope.type === 'error') {
              const payload = envelope.payload ?? {};
              const code = typeof payload.code === 'string' ? payload.code : 'RELAY_ERROR';
              const message = typeof payload.message === 'string' ? payload.message : 'Unknown relay error';
              entry.reject(new Error(`${code}: ${message}`));
            } else {
              entry.resolve(envelope);
            }
          }
        }

        void this.messages.emit(envelope);
      });

      ws.on('close', () => {
        for (const [id, entry] of this.pending.entries()) {
          clearTimeout(entry.timer);
          entry.reject(new Error(`socket closed while waiting for ${id}`));
          this.pending.delete(id);
        }
      });

      ws.on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  private join(): Promise<RelayEnvelope> {
    return this.request('relay.join', {
      role: 'agent',
      sessionId: this.sessionId,
    });
  }

  async request(type: string, payload: Record<string, unknown>): Promise<RelayEnvelope> {
    const id = `req-${Date.now()}-${++this.requestSeq}`;
    const envelope: RelayEnvelope = {
      v: PROTOCOL_VERSION,
      type,
      id,
      payload,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout waiting reply for ${type}`));
      }, this.requestTimeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      try {
        this.sendEnvelope(envelope);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  send(type: string, payload: Record<string, unknown>): void {
    const envelope: RelayEnvelope = {
      v: PROTOCOL_VERSION,
      type,
      id: `msg-${Date.now()}-${++this.requestSeq}`,
      payload,
    };
    this.sendEnvelope(envelope);
  }

  close(): void {
    if (!this.ws) return;
    this.ws.close();
    this.ws = null;
  }

  private sendEnvelope(envelope: RelayEnvelope): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('relay socket is not open');
    }
    this.ws.send(JSON.stringify(envelope));
  }
}
