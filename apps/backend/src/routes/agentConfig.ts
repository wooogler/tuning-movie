import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';

type ModelId = 'openai' | 'gemini';

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

function readCurrentModel(): ModelId {
  const envPath = getEnvFilePath();
  if (!fs.existsSync(envPath)) return 'openai';

  const content = fs.readFileSync(envPath, 'utf-8');
  const openaiMatch = content.match(/^AGENT_ENABLE_OPENAI\s*=\s*(.*)$/m);
  const geminiMatch = content.match(/^AGENT_ENABLE_GEMINI\s*=\s*(.*)$/m);

  const openaiEnabled = openaiMatch ? openaiMatch[1].trim() === 'true' : false;
  const geminiEnabled = geminiMatch ? geminiMatch[1].trim() === 'true' : false;

  return geminiEnabled ? 'gemini' : openaiEnabled ? 'openai' : 'openai';
}

function setModelInEnv(model: ModelId): void {
  const envPath = getEnvFilePath();
  if (!fs.existsSync(envPath)) return;

  let content = fs.readFileSync(envPath, 'utf-8');

  const openaiValue = model === 'openai' ? 'true' : 'false';
  const geminiValue = model === 'gemini' ? 'true' : 'false';

  content = content.replace(
    /^(AGENT_ENABLE_OPENAI\s*=\s*).*$/m,
    `$1${openaiValue}`,
  );
  content = content.replace(
    /^(AGENT_ENABLE_GEMINI\s*=\s*).*$/m,
    `$1${geminiValue}`,
  );

  fs.writeFileSync(envPath, content, 'utf-8');

  // Also update process.env for this (backend) process
  process.env.AGENT_ENABLE_OPENAI = openaiValue;
  process.env.AGENT_ENABLE_GEMINI = geminiValue;
}

export async function agentConfigRoutes(fastify: FastifyInstance) {
  fastify.get('/agent/config/model', async () => {
    return { model: readCurrentModel() };
  });

  fastify.put('/agent/config/model', async (request, reply) => {
    const { model } = request.body as { model?: string };
    if (model !== 'openai' && model !== 'gemini') {
      return reply.code(400).send({ error: 'model must be "openai" or "gemini"' });
    }
    setModelInEnv(model);
    return { model };
  });
}
