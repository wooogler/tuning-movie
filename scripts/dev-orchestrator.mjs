import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import process from 'node:process';

const mode = process.argv[2] ?? 'all';

const COMMANDS_BY_MODE = {
  system: [
    { label: 'backend', script: 'dev:backend' },
    { label: 'frontend', script: 'dev:frontend' },
  ],
  system_agent: [
    { label: 'backend', script: 'dev:backend' },
    { label: 'frontend', script: 'dev:frontend' },
    { label: 'tuning-agent-typescript', script: 'dev:tuning-agent-typescript' },
  ],
  all: [
    { label: 'backend', script: 'dev:backend' },
    { label: 'frontend', script: 'dev:frontend' },
    { label: 'agent-test', script: 'dev:agent-test' },
  ],
};

if (!Object.prototype.hasOwnProperty.call(COMMANDS_BY_MODE, mode)) {
  console.error(`[orchestrator] Unknown mode: ${mode}`);
  console.error('[orchestrator] Allowed modes: system, system_agent, all');
  process.exit(1);
}

const BACKEND_HEALTH_URL = process.env.BACKEND_HEALTH_URL || 'http://localhost:3000/health';
const BACKEND_HEALTH_TIMEOUT_MS = Number(process.env.BACKEND_HEALTH_TIMEOUT_MS || 30000);
const BACKEND_HEALTH_INTERVAL_MS = Number(process.env.BACKEND_HEALTH_INTERVAL_MS || 400);
const SINGLE_CHECK_TIMEOUT_MS = 1500;

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const definitions = COMMANDS_BY_MODE[mode];
const children = [];
let isShuttingDown = false;
let firstErrorCode = 0;

function prefixWrite(label, chunk, stream) {
  const text = chunk.toString();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line && i === lines.length - 1) continue;
    stream.write(`[${label}] ${line}\n`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkHealthOnce(urlString, timeoutMs) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(urlString);
    } catch {
      resolve(false);
      return;
    }

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
      },
      (res) => {
        const ok = (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300;
        res.resume();
        resolve(ok);
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => resolve(false));
    req.end();
  });
}

function terminateAll(signal = 'SIGTERM') {
  if (isShuttingDown) return;
  isShuttingDown = true;

  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  }
}

function spawnService(definition) {
  const { label, script } = definition;

  const child = spawn(npmCmd, ['run', script], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  });

  child.stdout.on('data', (chunk) => prefixWrite(label, chunk, process.stdout));
  child.stderr.on('data', (chunk) => prefixWrite(label, chunk, process.stderr));

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[orchestrator] ${label} exited with signal ${signal}`);
    } else {
      console.log(`[orchestrator] ${label} exited with code ${code ?? 0}`);
      if (!isShuttingDown && (code ?? 0) !== 0 && firstErrorCode === 0) {
        firstErrorCode = code ?? 1;
      }
    }

    if (!isShuttingDown && (code ?? 0) !== 0) {
      terminateAll();
      return;
    }

    const allDone = children.every((c) => c.exitCode !== null || c.signalCode !== null);
    if (allDone) {
      process.exit(firstErrorCode);
    }
  });

  child.on('error', (error) => {
    console.error(`[orchestrator] Failed to start ${label}: ${error.message}`);
    if (firstErrorCode === 0) firstErrorCode = 1;
    terminateAll();
  });

  children.push(child);
  return child;
}

async function waitForBackendReady(backendChild) {
  const startedAt = Date.now();

  while (!isShuttingDown) {
    if (backendChild.exitCode !== null || backendChild.signalCode !== null) {
      return false;
    }

    const isHealthy = await checkHealthOnce(BACKEND_HEALTH_URL, SINGLE_CHECK_TIMEOUT_MS);
    if (isHealthy) {
      return true;
    }

    if (Date.now() - startedAt >= BACKEND_HEALTH_TIMEOUT_MS) {
      return false;
    }

    await sleep(BACKEND_HEALTH_INTERVAL_MS);
  }

  return false;
}

async function main() {
  const [backendDefinition, ...rest] = definitions;

  if (!backendDefinition || backendDefinition.label !== 'backend') {
    console.error('[orchestrator] Backend definition must be first.');
    process.exit(1);
  }

  const backendChild = spawnService(backendDefinition);

  console.log(`[orchestrator] Waiting for backend health: ${BACKEND_HEALTH_URL}`);
  const backendReady = await waitForBackendReady(backendChild);

  if (!backendReady) {
    if (!isShuttingDown) {
      console.error(
        `[orchestrator] Backend health check failed or timed out after ${BACKEND_HEALTH_TIMEOUT_MS}ms`
      );
      if (firstErrorCode === 0) firstErrorCode = 1;
      terminateAll();
    }
    return;
  }

  console.log('[orchestrator] Backend is healthy. Starting remaining services...');

  for (const definition of rest) {
    spawnService(definition);
  }
}

process.on('SIGINT', () => terminateAll('SIGINT'));
process.on('SIGTERM', () => terminateAll('SIGTERM'));

main().catch((error) => {
  console.error(`[orchestrator] Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  if (firstErrorCode === 0) firstErrorCode = 1;
  terminateAll();
});
