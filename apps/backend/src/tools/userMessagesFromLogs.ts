import fs from 'fs';
import path from 'path';

interface InteractionLogEntry {
  timestamp?: string;
  sessionId?: string;
  sessionParticipantId?: string;
  participantId?: string | null;
  scenarioId?: string;
  studyMode?: string;
  type?: string;
  payload?: unknown;
}

interface UserMessage {
  timestamp: string | null;
  stage: string | null;
  text: string;
}

interface CliOptions {
  inputPath?: string;
  outputPath?: string;
}

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..', '..');
const DEFAULT_INPUT_PATH = path.join(BACKEND_ROOT, 'logs', 'study');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveInputPath(rawInput?: string): string {
  if (!rawInput) {
    return DEFAULT_INPUT_PATH;
  }

  const cleanedInput = rawInput.replace(/^@+/, '').trim();
  const candidates = [
    path.resolve(process.cwd(), cleanedInput),
    path.resolve(BACKEND_ROOT, cleanedInput),
    path.resolve(REPO_ROOT, cleanedInput),
  ];

  if (cleanedInput.startsWith('apps/backend/')) {
    candidates.push(path.resolve(REPO_ROOT, cleanedInput));
  }

  if (cleanedInput.startsWith('logs/')) {
    candidates.push(path.resolve(BACKEND_ROOT, cleanedInput));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function listInputFiles(inputPath: string): string[] {
  const stats = fs.statSync(inputPath);
  if (stats.isFile()) {
    return inputPath.endsWith('.jsonl') ? [inputPath] : [];
  }

  if (!stats.isDirectory()) {
    return [];
  }

  return fs
    .readdirSync(inputPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => path.join(inputPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--out' || arg === '-o') {
      const nextArg = argv[index + 1];
      if (!nextArg || nextArg.startsWith('-')) {
        throw new Error('Missing value for --out');
      }
      options.outputPath = nextArg;
      index += 1;
      continue;
    }

    if (!options.inputPath) {
      options.inputPath = arg;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function extractUserMessage(entry: InteractionLogEntry): UserMessage | null {
  if (entry.type !== 'chat.user_input.submitted') {
    return null;
  }

  if (!isRecord(entry.payload)) {
    return null;
  }

  const text = asNonEmptyString(entry.payload.text);
  if (!text) {
    return null;
  }

  return {
    timestamp: asNonEmptyString(entry.timestamp),
    stage: asNonEmptyString(entry.payload.stage),
    text,
  };
}

function readUserMessages(filePath: string): {
  header: Record<string, string | null>;
  messages: UserMessage[];
} {
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
  const messages: UserMessage[] = [];
  const header: Record<string, string | null> = {
    sessionId: null,
    participantId: null,
    scenarioId: null,
    studyMode: null,
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (!isRecord(parsed)) {
      continue;
    }

    const entry = parsed as InteractionLogEntry;
    header.sessionId ??= asNonEmptyString(entry.sessionId);
    header.participantId ??=
      asNonEmptyString(entry.participantId) ?? asNonEmptyString(entry.sessionParticipantId);
    header.scenarioId ??= asNonEmptyString(entry.scenarioId);
    header.studyMode ??= asNonEmptyString(entry.studyMode);

    const message = extractUserMessage(entry);
    if (message) {
      messages.push(message);
    }
  }

  return { header, messages };
}

function printFileOutput(filePath: string): void {
  process.stdout.write(renderFileOutput(filePath));
}

function renderFileOutput(filePath: string): string {
  const relativePath = path.relative(BACKEND_ROOT, filePath);
  const displayPath =
    relativePath && !relativePath.startsWith('..') ? relativePath : filePath;
  const { header, messages } = readUserMessages(filePath);
  const lines: string[] = [];

  lines.push(`FILE ${displayPath}`);
  lines.push(
    `session=${header.sessionId ?? '-'} participant=${header.participantId ?? '-'} scenario=${header.scenarioId ?? '-'} mode=${header.studyMode ?? '-'}`
  );

  if (messages.length === 0) {
    lines.push('(no user messages)');
    lines.push('');
    return `${lines.join('\n')}\n`;
  }

  messages.forEach((message, index) => {
    const timestamp = message.timestamp ?? '-';
    const stage = message.stage ?? '-';
    lines.push(`${index + 1}. [${timestamp}] (${stage}) ${message.text}`);
  });
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function renderOutput(files: string[]): string {
  return files.map((filePath) => renderFileOutput(filePath)).join('');
}

function getDefaultOutputPath(filePath: string): string {
  return filePath.replace(/\.jsonl$/i, '.txt');
}

function writeOutputFile(rawOutputPath: string, content: string): string {
  const resolvedPath = path.resolve(process.cwd(), rawOutputPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, content, 'utf-8');
  return resolvedPath;
}

function writeDefaultOutputFiles(files: string[]): string[] {
  return files.map((filePath) => {
    const outputPath = getDefaultOutputPath(filePath);
    fs.writeFileSync(outputPath, renderFileOutput(filePath), 'utf-8');
    return outputPath;
  });
}

function main(): void {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const inputPath = resolveInputPath(options.inputPath);

  if (!fs.existsSync(inputPath)) {
    console.error(`Input path not found: ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  const files = listInputFiles(inputPath);
  if (files.length === 0) {
    console.error(`No .jsonl files found at: ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  const output = renderOutput(files);
  process.stdout.write(output);

  if (options.outputPath) {
    const savedPath = writeOutputFile(options.outputPath, output);
    console.error(`Saved output to ${savedPath}`);
    return;
  }

  const savedPaths = writeDefaultOutputFiles(files);
  if (savedPaths.length === 1) {
    console.error(`Saved output to ${savedPaths[0]}`);
    return;
  }

  console.error(`Saved ${savedPaths.length} txt files next to the source logs.`);
}

main();
