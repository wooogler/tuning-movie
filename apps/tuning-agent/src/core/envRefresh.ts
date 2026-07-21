import fs from 'fs';
import path from 'path';

const ENV_KEYS = [
  'AGENT_ENABLE_OPENAI',
  'AGENT_OPENAI_MODEL',
  'AGENT_OPENAI_API_MODE',
] as const;

/**
 * Re-reads selected OpenAI agent settings from the root .env file so runtime
 * config changes can take effect without restarting the agent process.
 */
export function refreshModelEnvVars(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../../../.env'),
  ];

  let envPath: string | undefined;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      envPath = p;
      break;
    }
  }
  if (!envPath) return;

  const content = fs.readFileSync(envPath, 'utf-8');
  for (const key of ENV_KEYS) {
    const match = content.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, 'm'));
    if (match) {
      process.env[key] = match[1].trim();
    }
  }
}
