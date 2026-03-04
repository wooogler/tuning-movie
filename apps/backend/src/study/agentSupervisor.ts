import fs from 'fs';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import type { StudyModeConfig } from './types';

interface AgentProcessHandle {
  child: ChildProcess;
  relaySessionId: string;
}

const handles = new Map<string, AgentProcessHandle>();
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
const AGENT_ENTRYPOINT = path.resolve(WORKSPACE_ROOT, 'apps/tuning-agent/src/index.ts');

function resolveTsxBinary(): string {
  const name = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const candidates = [
    path.resolve(WORKSPACE_ROOT, 'apps/backend/node_modules/.bin', name),
    path.resolve(WORKSPACE_ROOT, 'node_modules/.bin', name),
    path.resolve(process.cwd(), 'node_modules/.bin', name),
    path.resolve(process.cwd(), '../../node_modules/.bin', name),
    name,
  ];
  for (const candidate of candidates) {
    if (candidate === name || fs.existsSync(candidate)) return candidate;
  }
  return name;
}

function prefixedWrite(prefix: string, chunk: Buffer | string): void {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    process.stdout.write(`${prefix} ${line}\n`);
  }
}

function resolveSupervisorAgentMonitorPort(): string {
  const override = process.env.AGENT_MONITOR_PORT_OVERRIDE?.trim();
  if (override) return override;
  // Study sessions can run concurrently, so avoid a fixed monitor port.
  return '0';
}

export function startAgentForSession(
  params: {
    sessionId: string;
    relaySessionId: string;
    scenarioId: string;
    participantId: string;
    modeConfig: StudyModeConfig;
  }
): void {
  const { sessionId, relaySessionId, scenarioId, participantId, modeConfig } = params;
  if (!modeConfig.agentEnabled) return;

  stopAgentForSession(sessionId);

  if (!fs.existsSync(AGENT_ENTRYPOINT)) {
    process.stderr.write(`[agent-supervisor] Agent entrypoint not found: ${AGENT_ENTRYPOINT}\n`);
    return;
  }

  const tsxBinary = resolveTsxBinary();
  const child = spawn(tsxBinary, [AGENT_ENTRYPOINT], {
    cwd: WORKSPACE_ROOT,
    env: {
      ...process.env,
      AGENT_SESSION_ID: relaySessionId,
      AGENT_STUDY_ID: scenarioId,
      AGENT_PARTICIPANT_ID: participantId,
      AGENT_ENABLE_GUI_ADAPTATION: modeConfig.guiAdaptationEnabled ? 'true' : 'false',
      AGENT_DEFAULT_CP_MEMORY_LIMIT: String(modeConfig.cpMemoryWindow),
      AGENT_MONITOR_PORT: resolveSupervisorAgentMonitorPort(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const prefix = `[agent-supervisor:${relaySessionId}]`;
  child.stdout?.on('data', (chunk) => prefixedWrite(prefix, chunk));
  child.stderr?.on('data', (chunk) => prefixedWrite(prefix, chunk));

  child.on('exit', () => {
    const handle = handles.get(sessionId);
    if (handle?.child === child) {
      handles.delete(sessionId);
    }
  });

  handles.set(sessionId, { child, relaySessionId });
}

export function stopAgentForSession(sessionId: string): void {
  const handle = handles.get(sessionId);
  if (!handle) return;
  handles.delete(sessionId);
  if (handle.child.exitCode === null && handle.child.signalCode === null) {
    handle.child.kill('SIGTERM');
  }
}

export function stopAllSessionAgents(): void {
  for (const sessionId of Array.from(handles.keys())) {
    stopAgentForSession(sessionId);
  }
}
