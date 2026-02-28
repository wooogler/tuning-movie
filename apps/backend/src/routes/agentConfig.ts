import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';

type ModelId = 'openai' | 'gemini';
const OPENAI_ENABLED_KEY = 'AGENT_ENABLE_OPENAI';
const GEMINI_ENABLED_KEY = 'AGENT_ENABLE_GEMINI';
const GUI_ADAPTATION_ENABLED_KEY = 'AGENT_ENABLE_GUI_ADAPTATION';

function getEnvFilePath(): string {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../../../.env'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

function readBooleanFromEnv(key: string, fallback: boolean): boolean {
  const envPath = getEnvFilePath();
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const keyPattern = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = content.match(new RegExp(`^${keyPattern}\\s*=\\s*(.*)$`, 'm'));
    const parsedFromFile = parseBoolean(match?.[1]);
    if (parsedFromFile !== null) return parsedFromFile;
  }

  const parsedFromProcess = parseBoolean(process.env[key]);
  if (parsedFromProcess !== null) return parsedFromProcess;

  return fallback;
}

function upsertEnvValue(content: string, key: string, value: string): string {
  const keyPattern = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const linePattern = new RegExp(`^${keyPattern}\\s*=\\s*.*$`, 'm');
  if (linePattern.test(content)) {
    return content.replace(linePattern, `${key}=${value}`);
  }

  const trimmed = content.replace(/\s*$/, '');
  if (!trimmed) {
    return `${key}=${value}\n`;
  }
  return `${trimmed}\n${key}=${value}\n`;
}

function setBooleanValuesInEnv(values: Array<{ key: string; enabled: boolean }>): void {
  const envPath = getEnvFilePath();
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

  for (const { key, enabled } of values) {
    const nextValue = enabled ? 'true' : 'false';
    content = upsertEnvValue(content, key, nextValue);
    process.env[key] = nextValue;
  }

  fs.writeFileSync(envPath, content, 'utf-8');
}

function readCurrentModel(): ModelId {
  const openaiEnabled = readBooleanFromEnv(OPENAI_ENABLED_KEY, true);
  const geminiEnabled = readBooleanFromEnv(GEMINI_ENABLED_KEY, false);

  return geminiEnabled ? 'gemini' : openaiEnabled ? 'openai' : 'openai';
}

function setModelInEnv(model: ModelId): void {
  setBooleanValuesInEnv([
    { key: OPENAI_ENABLED_KEY, enabled: model === 'openai' },
    { key: GEMINI_ENABLED_KEY, enabled: model === 'gemini' },
  ]);
}

function readGuiAdaptationEnabled(): boolean {
  return readBooleanFromEnv(GUI_ADAPTATION_ENABLED_KEY, true);
}

function setGuiAdaptationEnabled(enabled: boolean): void {
  setBooleanValuesInEnv([{ key: GUI_ADAPTATION_ENABLED_KEY, enabled }]);
}

export async function agentConfigRoutes(fastify: FastifyInstance) {
  fastify.get('/agent/config/model', async () => {
    return { model: readCurrentModel() };
  });

  fastify.put('/agent/config/model', async (request, reply) => {
    const { model } = (request.body ?? {}) as { model?: string };
    if (model !== 'openai' && model !== 'gemini') {
      return reply.code(400).send({ error: 'model must be "openai" or "gemini"' });
    }
    setModelInEnv(model);
    return { model };
  });

  fastify.get('/agent/config/gui-adaptation', async () => {
    return { enabled: readGuiAdaptationEnabled() };
  });

  fastify.put('/agent/config/gui-adaptation', async (request, reply) => {
    const { enabled } = (request.body ?? {}) as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      return reply.code(400).send({ error: 'enabled must be boolean' });
    }

    setGuiAdaptationEnabled(enabled);
    return { enabled };
  });
}
