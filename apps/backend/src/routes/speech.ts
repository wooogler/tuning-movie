import type { FastifyInstance } from 'fastify';

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
const SUPPORTED_STT_LANGUAGES = new Set(['en', 'ko']);

function getOpenAiApiKey(): string | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return apiKey ? apiKey : null;
}

function trimToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeSttLanguage(value: unknown): 'en' | 'ko' | null {
  const trimmed = trimToNull(value)?.toLowerCase();
  if (!trimmed) return null;
  if (SUPPORTED_STT_LANGUAGES.has(trimmed)) {
    return trimmed as 'en' | 'ko';
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

async function readOpenAiError(response: Response): Promise<string> {
  const fallback = `OpenAI request failed with HTTP ${response.status}`;
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: unknown } }
      | null;
    const message = payload?.error?.message;
    return typeof message === 'string' && message.trim() ? message.trim() : fallback;
  }

  const text = await response.text().catch(() => '');
  return text.trim() ? text.trim() : fallback;
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

export async function speechRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/speech/transcribe', async (request, reply) => {
    const apiKey = getOpenAiApiKey();
    if (!apiKey) {
      return reply.code(503).send({ error: 'OPENAI_API_KEY_MISSING' });
    }

    const body = (request.body ?? {}) as {
      audioBase64?: unknown;
      mimeType?: unknown;
      language?: unknown;
    };
    const audioBase64 = trimToNull(body.audioBase64);
    const mimeType = trimToNull(body.mimeType) ?? 'audio/webm';
    const language = normalizeSttLanguage(body.language);

    if (!audioBase64) {
      return reply.code(400).send({ error: 'audioBase64 is required' });
    }
    if (!language) {
      return reply.code(400).send({ error: 'language must be one of: en, ko' });
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
    const apiKey = getOpenAiApiKey();
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

    const response = await fetch(OPENAI_SPEECH_URL, {
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

    if (!response.ok) {
      const message = await readOpenAiError(response);
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
}
