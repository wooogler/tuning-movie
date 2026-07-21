import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getSessionApiKeyByToken, getSessionContextByToken } from '../study/sessionService';
import { isDemoStudyMode } from '../study/modes';

const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const DEFAULT_STT_MODEL = process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe';
const DEFAULT_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const DEFAULT_TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'alloy';
const DEFAULT_TTS_FORMAT = process.env.OPENAI_TTS_FORMAT || 'wav';
const DEFAULT_TTS_SPEED = (() => {
  const parsed = Number.parseFloat(process.env.OPENAI_TTS_SPEED || '1.5');
  if (!Number.isFinite(parsed)) return 1.5;
  return Math.min(4, Math.max(0.25, parsed));
})();
const SUPPORTED_STT_LANGUAGES = new Set(['en']);
const STUDY_SESSION_TOKEN_HEADER = 'x-study-session-token';
const INLINE_API_KEY_HEADER = 'x-openai-api-key';
// /speech/synthesize-preview is unauthenticated; keep its payload tiny.
const PREVIEW_BODY_LIMIT_BYTES = 8 * 1024;
const PREVIEW_MAX_TEXT_LENGTH = 600;
// Opt-in escape hatch for a private lab deployment where the operator key is the
// only key and participants never type one: it lets the pre-session speaker test
// run on OPENAI_API_KEY. Must stay false on any public demo deployment -- the
// route is unauthenticated, so enabling it makes the operator key spendable by
// anyone who can reach the server.
const PREVIEW_ALLOWS_ENV_KEY = process.env.SPEECH_PREVIEW_ALLOW_ENV_KEY?.trim() === 'true';

function getEnvOpenAiApiKey(): string | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return apiKey ? apiKey : null;
}

function readHeader(request: FastifyRequest, name: string): string | null {
  const raw = request.headers[name];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string' && raw[0].trim()) {
    return raw[0].trim();
  }
  return null;
}

/**
 * Resolves a user-provided OpenAI key for this request: first the key bound to
 * the study session (public demo visitors register it at session creation), then
 * an inline `x-openai-api-key` header. Never logged, never echoed.
 */
function resolveUserApiKey(request: FastifyRequest): string | null {
  const studyToken = readHeader(request, STUDY_SESSION_TOKEN_HEADER);
  if (studyToken) {
    const sessionKey = getSessionApiKeyByToken(studyToken);
    if (sessionKey && sessionKey.trim()) return sessionKey.trim();
  }
  return readHeader(request, INLINE_API_KEY_HEADER);
}

/**
 * True when this request belongs to a public demo session. Demo visitors bring
 * their own key by contract, so the operator key must never back their calls.
 */
function isDemoSessionRequest(request: FastifyRequest): boolean {
  const studyToken = readHeader(request, STUDY_SESSION_TOKEN_HEADER);
  if (!studyToken) return false;
  const context = getSessionContextByToken(studyToken);
  return context ? isDemoStudyMode(context.record.studyMode) : false;
}

function resolveApiKeyWithEnvFallback(request: FastifyRequest): string | null {
  const userApiKey = resolveUserApiKey(request);
  if (userApiKey) return userApiKey;
  if (isDemoSessionRequest(request)) return null;
  return getEnvOpenAiApiKey();
}

function isOpenAiAuthFailure(response: Response): boolean {
  return response.status === 401 || response.status === 403;
}

function trimToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeSttLanguage(value: unknown): 'en' | null {
  const trimmed = trimToNull(value)?.toLowerCase();
  if (!trimmed) return null;
  if (SUPPORTED_STT_LANGUAGES.has(trimmed)) {
    return trimmed as 'en';
  }
  return null;
}

function normalizeAudioBase64(value: string): string {
  const separatorIndex = value.indexOf(',');
  if (value.startsWith('data:') && separatorIndex >= 0) {
    return value.slice(separatorIndex + 1);
  }
  return value;
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('mp4')) return 'mp4';
  if (normalized.includes('wav')) return 'wav';
  return 'webm';
}

function contentTypeFromFormat(format: string): string {
  switch (format.toLowerCase()) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'opus':
      return 'audio/opus';
    case 'aac':
      return 'audio/aac';
    case 'flac':
      return 'audio/flac';
    case 'pcm':
      return 'audio/pcm';
    default:
      return 'application/octet-stream';
  }
}

// OpenAI echoes the offending key back in some error bodies; never relay that.
function redactApiKeys(message: string): string {
  return message.replace(/sk-[A-Za-z0-9_-]{4,}/g, 'sk-***');
}

async function readOpenAiError(response: Response): Promise<string> {
  const fallback = `OpenAI request failed with HTTP ${response.status}`;
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: unknown } }
      | null;
    const message = payload?.error?.message;
    return typeof message === 'string' && message.trim()
      ? redactApiKeys(message.trim())
      : fallback;
  }

  const text = await response.text().catch(() => '');
  return text.trim() ? redactApiKeys(text.trim()) : fallback;
}

async function readTranscriptionText(response: Response): Promise<string | null> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = (await response.json().catch(() => null)) as { text?: unknown } | null;
    return typeof payload?.text === 'string' && payload.text.trim() ? payload.text.trim() : null;
  }

  const text = await response.text().catch(() => '');
  return text.trim() ? text.trim() : null;
}

async function synthesizeSpeechWithOpenAi(text: string, apiKey: string): Promise<Response> {
  return fetch(OPENAI_SPEECH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_TTS_MODEL,
      voice: DEFAULT_TTS_VOICE,
      input: text,
      response_format: DEFAULT_TTS_FORMAT,
      speed: DEFAULT_TTS_SPEED,
    }),
  });
}

export async function speechRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/speech/transcribe', async (request, reply) => {
    const apiKey = resolveApiKeyWithEnvFallback(request);
    if (!apiKey) {
      return reply.code(503).send({ error: 'OPENAI_API_KEY_MISSING' });
    }

    const body = (request.body ?? {}) as {
      audioBase64?: unknown;
      mimeType?: unknown;
      language?: unknown;
      prompt?: unknown;
    };
    const audioBase64 = trimToNull(body.audioBase64);
    const mimeType = trimToNull(body.mimeType) ?? 'audio/webm';
    const language = normalizeSttLanguage(body.language);
    const prompt = trimToNull(body.prompt);

    if (!audioBase64) {
      return reply.code(400).send({ error: 'audioBase64 is required' });
    }
    if (!language) {
      return reply.code(400).send({ error: 'language must be: en' });
    }

    let audioBuffer: Buffer;
    try {
      audioBuffer = Buffer.from(normalizeAudioBase64(audioBase64), 'base64');
    } catch {
      return reply.code(400).send({ error: 'audioBase64 must be valid base64 audio data' });
    }

    if (audioBuffer.byteLength === 0) {
      return reply.code(400).send({ error: 'audioBase64 decoded to an empty payload' });
    }

    const fileName = `utterance.${extensionFromMimeType(mimeType)}`;
    const payload = new FormData();
    payload.append('model', DEFAULT_STT_MODEL);
    payload.append('language', language);
    if (prompt) {
      payload.append('prompt', prompt);
    }
    payload.append('file', new Blob([audioBuffer], { type: mimeType }), fileName);

    const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: payload,
    });

    if (!response.ok) {
      const message = await readOpenAiError(response);
      if (isOpenAiAuthFailure(response)) {
        return reply.code(401).send({
          error: 'OPENAI_AUTH_FAILED',
          message,
        });
      }
      return reply.code(502).send({
        error: 'OPENAI_STT_FAILED',
        message,
      });
    }

    const text = await readTranscriptionText(response);
    if (!text) {
      return reply.code(502).send({
        error: 'OPENAI_STT_EMPTY',
        message: 'OpenAI returned an empty transcription.',
      });
    }

    return { text, language };
  });

  fastify.post('/speech/synthesize', async (request, reply) => {
    const apiKey = resolveApiKeyWithEnvFallback(request);
    if (!apiKey) {
      return reply.code(503).send({ error: 'OPENAI_API_KEY_MISSING' });
    }

    const body = (request.body ?? {}) as {
      text?: unknown;
    };
    const text = trimToNull(body.text);
    if (!text) {
      return reply.code(400).send({ error: 'text is required' });
    }

    const response = await synthesizeSpeechWithOpenAi(text, apiKey);

    if (!response.ok) {
      const message = await readOpenAiError(response);
      if (isOpenAiAuthFailure(response)) {
        return reply.code(401).send({
          error: 'OPENAI_AUTH_FAILED',
          message,
        });
      }
      return reply.code(502).send({
        error: 'OPENAI_TTS_FAILED',
        message,
      });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    reply.header('content-type', contentTypeFromFormat(DEFAULT_TTS_FORMAT));
    reply.header('cache-control', 'no-store');
    return reply.send(audioBuffer);
  });

  // Unauthenticated public path: it runs on a caller-supplied key only. Falling
  // back to process.env.OPENAI_API_KEY here would let any anonymous visitor
  // drain the operator's key, so that fallback exists only behind the explicit
  // SPEECH_PREVIEW_ALLOW_ENV_KEY opt-in for private lab deployments.
  fastify.post(
    '/speech/synthesize-preview',
    { bodyLimit: PREVIEW_BODY_LIMIT_BYTES },
    async (request, reply) => {
      const apiKey =
        resolveUserApiKey(request) ?? (PREVIEW_ALLOWS_ENV_KEY ? getEnvOpenAiApiKey() : null);
      if (!apiKey) {
        return reply.code(503).send({ error: 'OPENAI_API_KEY_MISSING' });
      }

      const body = (request.body ?? {}) as {
        text?: unknown;
      };
      const text = trimToNull(body.text);
      if (!text) {
        return reply.code(400).send({ error: 'text is required' });
      }
      if (text.length > PREVIEW_MAX_TEXT_LENGTH) {
        return reply
          .code(400)
          .send({ error: `text must be ${PREVIEW_MAX_TEXT_LENGTH} characters or fewer` });
      }

      const response = await synthesizeSpeechWithOpenAi(text, apiKey);

      if (!response.ok) {
        const message = await readOpenAiError(response);
        if (isOpenAiAuthFailure(response)) {
          return reply.code(401).send({
            error: 'OPENAI_AUTH_FAILED',
            message,
          });
        }
        return reply.code(502).send({
          error: 'OPENAI_TTS_FAILED',
          message,
        });
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      reply.header('content-type', contentTypeFromFormat(DEFAULT_TTS_FORMAT));
      reply.header('cache-control', 'no-store');
      return reply.send(audioBuffer);
    }
  );
}
