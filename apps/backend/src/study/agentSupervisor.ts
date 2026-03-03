import fs from 'fs';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import type { StudyModeConfig } from './types';

interface AgentProcessHandle {
  child: ChildProcess;
  relaySessionId: string;
}

const handles = new Map<string, AgentProcessHandle>();

function resolveTsxBinary(): string {
  const name = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const candidates = [
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

  const tsxBinary = resolveTsxBinary();
  const child = spawn(tsxBinary, ['apps/tuning-agent/src/index.ts'], {
    cwd: path.resolve(process.cwd()),
    env: {
      ...process.env,
      AGENT_SESSION_ID: relaySessionId,
      AGENT_STUDY_ID: scenarioId,
      AGENT_PARTICIPANT_ID: participantId,
      AGENT_ENABLE_GUI_ADAPTATION: modeConfig.guiAdaptationEnabled ? 'true' : 'false',
      AGENT_DEFAULT_CP_MEMORY_LIMIT: String(modeConfig.cpMemoryWindow),
      AGENT_DEFAULT_EXTRACTOR_CONFLICT_CANDIDATE_ENABLED:
        modeConfig.extractorConflictCandidateEnabled ? 'true' : 'false',
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
