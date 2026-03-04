import { refreshModelEnvVars } from '../core/envRefresh';

interface VisibleItemSummary {
  id: string;
  value: string;
  disabled?: boolean;
}

interface ExtractionInput {
  userMessage: string;
  currentStage: string;
  messageHistory: unknown[];
  visibleItems: VisibleItemSummary[];
  selectedItem: { id: string; value: string } | null;
  actionType: string;
  toolName: string;
  actionParams: Record<string, unknown>;
  outcomeOk: boolean;
  existingPreferences: string[];
  existingConstraints: string[];
  existingConflicts: string[];
}

interface ExtractionOutput {
  updatedPreferences: string[];
  updatedConstraints: string[];
  updatedConflicts: string[];
}

interface LlmTraceEvent {
  component: 'extractor';
  type: 'request' | 'response.raw' | 'response.parsed' | 'error';
  payload: unknown;
}

type LlmTraceListener = (event: LlmTraceEvent) => void;

const DEBUG_LLM = process.env.AGENT_LLM_DEBUG === 'true';

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

const monitorEnabled =
  parseBooleanEnv(process.env.AGENT_MONITOR_ENABLED) ?? process.env.NODE_ENV !== 'production';
const monitorLlmTraceOverride = parseBooleanEnv(process.env.AGENT_MONITOR_LLM_TRACE);
const MONITOR_LLM_TRACE_ENABLED = monitorEnabled && (monitorLlmTraceOverride ?? true);
const llmTraceListeners = new Set<LlmTraceListener>();

function emitLlmTrace(type: LlmTraceEvent['type'], payload: unknown): void {
  if (!MONITOR_LLM_TRACE_ENABLED) return;
  const event: LlmTraceEvent = { component: 'extractor', type, payload };
  for (const listener of llmTraceListeners) {
    listener(event);
  }
}

export function subscribeLlmTrace(listener: LlmTraceListener): () => void {
  llmTraceListeners.add(listener);
  return () => {
    llmTraceListeners.delete(listener);
  };
}

const EXTRACTION_SYSTEM_PROMPT =
  'You maintain three memory lists for an interactive agent turn.\n' +
  '- User\'s Preferences: what the user wants, from user intent.\n' +
  '- System\'s Constraints: objective availability or limitation facts from the system state.\n' +
  '- Conflicts: contradictions between preferences and constraints.\n' +
  '\n' +
  'Inputs include existingPreferences, existingConstraints, existingConflicts, userMessage, messageHistory, visibleItems, selectedItem, currentStage, action metadata, and outcomeOk.\n' +
  '\n' +
  'Update policy:\n' +
  '- Return the full updated list for all categories on every turn.\n' +
  '- Start from existing lists, then revise by this turn\'s evidence.\n' +
  '- If a previous item becomes obsolete, remove it by not including it in the updated list.\n' +
  '- If no change is needed, return existing lists as-is.\n' +
  '\n' +
  'Preference rules:\n' +
  '- Preferences must come from user intent, not inferred solely from system state.\n' +
  '- Ignore trivial acknowledgements that add no durable intent.\n' +
  '- Keep each item as a short standalone sentence.\n' +
  '\n' +
  'Constraint rules:\n' +
  '- Constraints must be objective system facts, not user desires.\n' +
  '- Prefer specific, durable facts over temporary UI states.\n' +
  '- Keep each item as a short standalone sentence.\n' +
  '\n' +
  'Conflict rules:\n' +
  '- Add a conflict only when a specific preference cannot currently be satisfied due to constraints.\n' +
  '- Keep each conflict explicit and actionable.\n' +
  '- Detect mismatches across any preference dimension (for example time/date, budget, brand, location, content attributes, seating).\n' +
  '- If current options cannot satisfy a stated preference, add a conflict even when other non-matching options exist.\n' +
  '- Use currentStage and visibleItems to decide what is currently satisfiable right now.\n' +
  '- Keep unresolved conflicts until either preferences change or constraints/options change.\n' +
  '- Write conflicts with both sides: desired preference + blocking constraint fact.\n' +
  '\n' +
  'Output rules:\n' +
  '- Do not include duplicates.\n' +
  '- Return JSON only matching this schema: { "updatedPreferences": string[], "updatedConstraints": string[], "updatedConflicts": string[] }';

export function getExtractorSystemPrompt(): string {
  return EXTRACTION_SYSTEM_PROMPT;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

const DAY_TOKEN_TO_UTC: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const UTC_DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function normalizeDayToken(token: string): string {
  return token.trim().toLowerCase().slice(0, 3);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getUtcWeekdayFromIsoDate(value: string): number | null {
  if (!isIsoDate(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCDay();
}

function getVisibleDateWeekdays(items: VisibleItemSummary[]): Set<number> {
  const weekdays = new Set<number>();
  for (const item of items) {
    const weekdayFromId = getUtcWeekdayFromIsoDate(item.id);
    if (weekdayFromId !== null) {
      weekdays.add(weekdayFromId);
      continue;
    }

    for (const match of item.value.matchAll(/\b(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/gi)) {
      const normalized = normalizeDayToken(match[0]);
      const mapped = DAY_TOKEN_TO_UTC[normalized];
      if (typeof mapped === 'number') {
        weekdays.add(mapped);
      }
    }
  }
  return weekdays;
}

function getVisibleIsoDates(items: VisibleItemSummary[]): Set<string> {
  const dates = new Set<string>();
  for (const item of items) {
    if (isIsoDate(item.id)) {
      dates.add(item.id);
    }
  }
  return dates;
}

function mergeUnique(base: string[], extras: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const item of [...base, ...extras]) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    merged.push(trimmed);
  }
  return merged;
}

interface TemporalPreferenceSignals {
  wantsWeekend: boolean;
  wantsWeekday: boolean;
  wantedDays: Set<number>;
  explicitDates: Set<string>;
}

function collectTemporalPreferenceSignals(preferences: string[], userMessage: string): TemporalPreferenceSignals {
  const corpus = `${preferences.join(' ')} ${userMessage}`.toLowerCase();
  const wantedDays = new Set<number>();
  for (const match of corpus.matchAll(/\b(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/g)) {
    const normalized = normalizeDayToken(match[0]);
    const mapped = DAY_TOKEN_TO_UTC[normalized];
    if (typeof mapped === 'number') {
      wantedDays.add(mapped);
    }
  }
  const explicitDates = new Set<string>(corpus.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []);
  return {
    wantsWeekend: /\bweekend\b/.test(corpus),
    wantsWeekday: /\bweekday\b/.test(corpus),
    wantedDays,
    explicitDates,
  };
}

function applyConflictHeuristics(
  input: ExtractionInput,
  output: ExtractionOutput
): ExtractionOutput {
  const conflictsToAdd: string[] = [];
  const preferences = output.updatedPreferences;

  if (input.currentStage === 'date') {
    const signals = collectTemporalPreferenceSignals(preferences, input.userMessage);
    const visibleWeekdays = getVisibleDateWeekdays(input.visibleItems);
    const visibleIsoDates = getVisibleIsoDates(input.visibleItems);

    if (signals.wantsWeekend) {
      const weekendAvailable = visibleWeekdays.has(0) || visibleWeekdays.has(6);
      if (!weekendAvailable) {
        conflictsToAdd.push(
          'The user prefers a weekend date, but the currently available date options do not include Saturday or Sunday.'
        );
      }
    }

    if (signals.wantsWeekday) {
      const weekdayAvailable = Array.from(visibleWeekdays).some((day) => day >= 1 && day <= 5);
      if (!weekdayAvailable) {
        conflictsToAdd.push(
          'The user prefers a weekday date, but the currently available date options include only weekend dates.'
        );
      }
    }

    if (signals.wantedDays.size > 0) {
      const hasRequestedDay = Array.from(signals.wantedDays).some((day) => visibleWeekdays.has(day));
      if (!hasRequestedDay) {
        const requestedDayLabels = Array.from(signals.wantedDays)
          .sort((a, b) => a - b)
          .map((day) => UTC_DAY_LABEL[day] ?? String(day))
          .join(', ');
        conflictsToAdd.push(
          `The user requested specific day(s) (${requestedDayLabels}), but none of the currently available date options match those day(s).`
        );
      }
    }

    if (signals.explicitDates.size > 0) {
      const hasRequestedDate = Array.from(signals.explicitDates).some((date) => visibleIsoDates.has(date));
      if (!hasRequestedDate) {
        const requestedDates = Array.from(signals.explicitDates).sort().join(', ');
        conflictsToAdd.push(
          `The user requested specific date(s) (${requestedDates}), but those date(s) are not currently available.`
        );
      }
    }
  }

  return {
    ...output,
    updatedConflicts: mergeUnique(output.updatedConflicts, conflictsToAdd),
  };
}

function toExtractionOutput(value: Record<string, unknown>): ExtractionOutput {
  const updatedPreferences = Array.isArray(value.updatedPreferences)
    ? (value.updatedPreferences as unknown[]).filter((item): item is string => typeof item === 'string')
    : [];
  const updatedConstraints = Array.isArray(value.updatedConstraints)
    ? (value.updatedConstraints as unknown[]).filter((item): item is string => typeof item === 'string')
    : [];
  const updatedConflicts = Array.isArray(value.updatedConflicts)
    ? (value.updatedConflicts as unknown[]).filter((item): item is string => typeof item === 'string')
    : [];
  return { updatedPreferences, updatedConstraints, updatedConflicts };
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_OPENAI_TEMPERATURE = 0;
const OPENAI_TEMPERATURE_OFF_SENTINELS = new Set(['default', 'none', 'omit', 'off']);

function resolveOpenAITemperature(): number | undefined {
  const raw = process.env.AGENT_OPENAI_TEMPERATURE;
  if (typeof raw !== 'string' || !raw.trim()) return DEFAULT_OPENAI_TEMPERATURE;

  const normalized = raw.trim().toLowerCase();
  if (OPENAI_TEMPERATURE_OFF_SENTINELS.has(normalized)) {
    return undefined;
  }

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_OPENAI_TEMPERATURE;
  return Math.min(2, Math.max(0, parsed));
}

function isUnsupportedTemperatureError(status: number, errorText: string): boolean {
  if (status !== 400) return false;
  const lowered = errorText.toLowerCase();
  return (
    lowered.includes('temperature') &&
    (lowered.includes('not supported') ||
      lowered.includes('unsupported') ||
      lowered.includes('only support') ||
      lowered.includes('invalid'))
  );
}

function getOpenAIModel(): string {
  return process.env.AGENT_OPENAI_MODEL || 'gpt-5.2';
}

function parseOpenAIOutputText(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;

  if (typeof record.output_text === 'string' && record.output_text.trim()) {
    return record.output_text.trim();
  }

  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const itemRecord = item as Record<string, unknown>;
    const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const partRecord = part as Record<string, unknown>;
      if (typeof partRecord.text === 'string' && partRecord.text.trim()) {
        return partRecord.text.trim();
      }
    }
  }
  return null;
}

async function extractWithOpenAI(input: ExtractionInput): Promise<ExtractionOutput | null> {
  if (process.env.AGENT_ENABLE_OPENAI === 'false') return null;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = getOpenAIModel();
  const temperature = resolveOpenAITemperature();
  const schemaProperties = {
    updatedPreferences: { type: 'array', items: { type: 'string' } },
    updatedConstraints: { type: 'array', items: { type: 'string' } },
    updatedConflicts: { type: 'array', items: { type: 'string' } },
  };
  const requiredKeys = ['updatedPreferences', 'updatedConstraints', 'updatedConflicts'];
  const baseBody = {
    model,
    input: [
      {
        role: 'system',
        content: EXTRACTION_SYSTEM_PROMPT + '\n- Return JSON only via schema.',
      },
      { role: 'user', content: JSON.stringify(input) },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'extraction_result',
        strict: false,
        schema: {
          type: 'object',
          properties: schemaProperties,
          required: requiredKeys,
          additionalProperties: false,
        },
      },
    },
  };
  const body =
    typeof temperature === 'number'
      ? { ...baseBody, temperature }
      : baseBody;

  if (DEBUG_LLM) {
    console.log('[tuning-agent][extractor:openai] request:', JSON.stringify(input));
  }
  emitLlmTrace('request', {
    model,
    input,
    temperature: typeof temperature === 'number' ? temperature : null,
  });

  let response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const firstErrorText = await response.text();
    const shouldRetryWithoutTemperature =
      typeof temperature === 'number' &&
      isUnsupportedTemperatureError(response.status, firstErrorText);

    if (shouldRetryWithoutTemperature) {
      if (DEBUG_LLM) {
        console.warn(
          '[tuning-agent][extractor:openai] temperature rejected; retrying without temperature'
        );
      }
      emitLlmTrace('request', {
        model,
        input,
        temperature: null,
        retryWithoutTemperature: true,
      });
      response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(baseBody),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      if (DEBUG_LLM) {
        console.error('[tuning-agent][extractor:openai] error:', errorText);
      }
      emitLlmTrace('error', { status: response.status, errorText });
      throw new Error(`OpenAI extractor failed (${response.status}): ${errorText}`);
    }
  }

  const payload = (await response.json()) as unknown;
  const outputText = parseOpenAIOutputText(payload);
  if (DEBUG_LLM) {
    console.log('[tuning-agent][extractor:openai] raw output:', outputText);
  }
  emitLlmTrace('response.raw', { outputText });
  if (!outputText) return null;

  const parsed = parseJsonObject(outputText);
  emitLlmTrace('response.parsed', { parsed });
  if (!parsed) return null;
  return toExtractionOutput(parsed);
}

// ── Gemini ──────────────────────────────────────────────────────────────────

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function getGeminiModel(): string {
  return process.env.AGENT_GEMINI_MODEL || 'gemini-2.5-flash';
}

function extractGeminiText(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;

  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const candidateRecord = candidate as Record<string, unknown>;
    const content = candidateRecord.content;
    if (!content || typeof content !== 'object') continue;
    const contentRecord = content as Record<string, unknown>;
    const parts = Array.isArray(contentRecord.parts) ? contentRecord.parts : [];
    for (const part of parts) {
      if (!part || typeof part !== 'object') continue;
      const partRecord = part as Record<string, unknown>;
      if (typeof partRecord.text === 'string' && partRecord.text.trim()) {
        return partRecord.text.trim();
      }
    }
  }
  return null;
}

async function extractWithGemini(input: ExtractionInput): Promise<ExtractionOutput | null> {
  if (process.env.AGENT_ENABLE_GEMINI === 'false') return null;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = getGeminiModel();
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: {
      parts: [
        {
          text: EXTRACTION_SYSTEM_PROMPT,
        },
      ],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: JSON.stringify(input) }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };

  if (DEBUG_LLM) {
    console.log('[tuning-agent][extractor:gemini] request:', JSON.stringify(input));
  }
  emitLlmTrace('request', { model, input });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (DEBUG_LLM) {
      console.error('[tuning-agent][extractor:gemini] error:', errorText);
    }
    emitLlmTrace('error', { status: response.status, errorText });
    throw new Error(`Gemini extractor failed (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as unknown;
  const outputText = extractGeminiText(payload);
  if (DEBUG_LLM) {
    console.log('[tuning-agent][extractor:gemini] raw output:', outputText);
  }
  emitLlmTrace('response.raw', { outputText });
  if (!outputText) return null;

  const parsed = parseJsonObject(outputText);
  emitLlmTrace('response.parsed', { parsed });
  if (!parsed) return null;
  return toExtractionOutput(parsed);
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface ExtractionContext {
  userMessage: string;
  currentStage: string;
  messageHistory: unknown[];
  visibleItems: VisibleItemSummary[];
  selectedItem: { id: string; value: string } | null;
  actionType: string;
  toolName: string;
  actionParams: Record<string, unknown>;
  outcomeOk: boolean;
  existingPreferences: string[];
  existingConstraints: string[];
  existingConflicts: string[];
}

export async function extractPreferencesAndConstraints(
  ctx: ExtractionContext
): Promise<ExtractionOutput> {
  refreshModelEnvVars();

  const geminiEnabled =
    process.env.AGENT_ENABLE_GEMINI !== 'false' && Boolean(process.env.GEMINI_API_KEY);
  const openaiEnabled =
    process.env.AGENT_ENABLE_OPENAI !== 'false' && Boolean(process.env.OPENAI_API_KEY);

  if (!geminiEnabled && !openaiEnabled) {
    throw new Error('EXTRACTION_PROVIDER_UNAVAILABLE');
  }

  const input: ExtractionInput = {
    userMessage: ctx.userMessage,
    currentStage: ctx.currentStage,
    messageHistory: ctx.messageHistory.slice(-15),
    visibleItems: ctx.visibleItems,
    selectedItem: ctx.selectedItem,
    actionType: ctx.actionType,
    toolName: ctx.toolName,
    actionParams: ctx.actionParams,
    outcomeOk: ctx.outcomeOk,
    existingPreferences: ctx.existingPreferences,
    existingConstraints: ctx.existingConstraints,
    existingConflicts: ctx.existingConflicts,
  };

  const result = geminiEnabled
    ? await extractWithGemini(input)
    : await extractWithOpenAI(input);

  if (!result) {
    throw new Error('EXTRACTION_INVALID_OUTPUT');
  }

  return applyConflictHeuristics(input, result);
}
