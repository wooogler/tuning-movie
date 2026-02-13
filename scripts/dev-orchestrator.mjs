import { spawn } from 'node:child_process';
import process from 'node:process';

const mode = process.argv[2] ?? 'all';

const COMMANDS_BY_MODE = {
  system: [
    { label: 'backend', script: 'dev:backend' },
    { label: 'frontend', script: 'dev:frontend' },
  ],
  all: [
    { label: 'backend', script: 'dev:backend' },
    { label: 'frontend', script: 'dev:frontend' },
    { label: 'agent-test', script: 'dev:agent-test' },
  ],
};

if (!Object.prototype.hasOwnProperty.call(COMMANDS_BY_MODE, mode)) {
  console.error(`[orchestrator] Unknown mode: ${mode}`);
  console.error('[orchestrator] Allowed modes: system, all');
  process.exit(1);
}

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

function terminateAll(signal = 'SIGTERM') {
  if (isShuttingDown) return;
  isShuttingDown = true;

  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  }
}

for (const { label, script } of definitions) {
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
}

process.on('SIGINT', () => terminateAll('SIGINT'));
process.on('SIGTERM', () => terminateAll('SIGTERM'));

