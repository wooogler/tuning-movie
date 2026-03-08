import { refreshModelEnvVars } from '../core/envRefresh';
import {
  buildActiveConflictId,
  buildConflictScope,
  buildPreferenceId,
  normalizeActiveConflicts,
  normalizePreferenceList,
} from '../core/cpMemory';
import type { ActiveConflict, ConflictStage, Preference } from '../types';

interface PreferenceExtractionInput {
  userMessage: string;
  currentStage: string;
  state: Record<string, unknown> | null;
  uiSpec: unknown;
  recentHistory: unknown[];
  existingPreferences: Preference[];
}

interface PreferenceExtractionOutput {
  preferences: Array<{
    description: string;
    strength: 'hard' | 'soft';
  }>;
}

interface ActiveConflictDerivationInput {
  currentStage: string;
  preferences: Preference[];
  state: Record<string, unknown> | null;
  uiSpec: unknown;
}

interface ActiveConflictDerivationOutput {
  activeConflicts: Array<{
    preferenceIds: string[];
    severity: 'blocking' | 'soft';
    reason: string;
  }>;
}

interface LlmTraceEvent {
  component: 'extractor';
  type: 'request' | 'response.raw' | 'response.parsed' | 'error';
  payload: unknown;
}

type LlmTraceListener = (event: LlmTraceEvent) => void;
type ExtractionKind = 'preferences' | 'active_conflicts';

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

const PREFERENCE_SYSTEM_PROMPT =
  'You maintain the structured user preference memory for an interactive booking agent.\n' +
  'Inputs include userMessage, currentStage, state, uiSpec, recentHistory, and existingPreferences.\n' +
  'Return the full updated preference list for the current turn.\n' +
  'Rules:\n' +
  '- Preferences must come from user intent, not from system availability.\n' +
  '- Use recentHistory to distinguish durable user preferences from in-the-moment procedural replies.\n' +
  '- Preserve existing preference wording when the meaning remains unchanged so the system can keep stable ids.\n' +
  '- Remove obsolete preferences by omitting them from the returned list.\n' +
  '- Ignore trivial acknowledgements, assistant suggestions, and system state that the user did not ask for.\n' +
  '- Do not store procedural, exploratory, or temporary action requests as preferences.\n' +
  '- Do not convert branch-local instructions into durable preferences. Examples: "check 4pm", "try this one", "go back", "clear that filter", "show another option", "check seats".\n' +
  '- Do not create a new preference when the user is only answering an assistant confirmation question about the next step to inspect.\n' +
  '- Treat option-specific trial confirmations as temporary unless the user clearly states an enduring desire or rule (for example "I want the 4:00 PM showtime" as a standing choice).\n' +
  '- When the latest user message is procedural or temporary, prefer keeping existingPreferences unchanged unless the user also states a durable preference.\n' +
  '- Use strength="hard" for requirements/constraints the user clearly insists on.\n' +
  '- Use strength="soft" for softer wishes, preferences, or nice-to-haves.\n' +
  '- Keep each description as a short standalone sentence.\n' +
  '- Do not include ids in the output.\n' +
  'Return JSON only matching this schema: { "preferences": Array<{ "description": string, "strength": "hard" | "soft" }> }';

const ACTIVE_CONFLICT_SYSTEM_PROMPT =
  'You derive the current active conflicts for an interactive booking agent.\n' +
  'Inputs include currentStage, preferences, state, and raw uiSpec.\n' +
  'Return only conflicts that are active right now for the current branch.\n' +
  'Rules:\n' +
  '- Read the preferences first. Evaluate them one by one against the current state and raw uiSpec.\n' +
  '- Before declaring a conflict, check whether at least one currently available option still satisfies the preference.\n' +
  '- If any currently available option satisfies a preference, do not create a conflict for that preference.\n' +
  '- Use existential satisfaction, not universal satisfaction: a preference is satisfied when at least one currently available option works, even if other matching options are unavailable.\n' +
  '- Do not treat "some matching options are unavailable" as a conflict when another currently available matching option still exists.\n' +
  '- Judge conflicts against the set of currently viable options, not against whether every matching option remains available.\n' +
  '- Only create a conflict when the current branch has no viable option that can satisfy the preference now.\n' +
  '- A conflict exists only when one or more provided preferences cannot currently be satisfied from the current UI/state.\n' +
  '- If no conflict is active right now, return an empty list.\n' +
  '- Never carry over stale or historical conflicts.\n' +
  '- If the situation is uncertain or not yet evaluable, do not create a conflict.\n' +
  '- Use only preferenceIds that already exist in the provided preferences input.\n' +
  '- Use severity="blocking" for hard blockers that prevent progress on the current branch.\n' +
  '- Use severity="soft" when the branch is viable but misses a soft preference.\n' +
  '- Keep reason concise, factual, and grounded in the current UI/state.\n' +
  '- Do not include scope or ids in the output.\n' +
  'Return JSON only matching this schema: { "activeConflicts": Array<{ "preferenceIds": string[], "severity": "blocking" | "soft", "reason": string }> }';

export function getExtractorSystemPrompt(): string {
  return [
    'Preference Extraction Prompt:',
    PREFERENCE_SYSTEM_PROMPT,
    '',
    'Active Conflict Derivation Prompt:',
    ACTIVE_CONFLICT_SYSTEM_PROMPT,
  ].join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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

function toConflictStage(value: string): ConflictStage | null {
  switch (value) {
    case 'movie':
    case 'theater':
    case 'date':
    case 'time':
    case 'seat':
    case 'confirm':
      return value;
    default:
      return null;
  }
}

function normalizeDescription(value: unknown): string | null {
  const text = readTrimmedString(value);
  if (!text) return null;
  return text.replace(/\s+/g, ' ');
}

function normalizePreferenceStrength(value: unknown): Preference['strength'] {
  return value === 'soft' ? 'soft' : 'hard';
}

function materializePreferences(raw: PreferenceExtractionOutput): Preference[] {
  const preferences: Preference[] = [];
  for (const rawPreference of raw.preferences) {
    const description = normalizeDescription(rawPreference.description);
    if (!description) continue;
    const strength = normalizePreferenceStrength(rawPreference.strength);
    preferences.push({
      id: buildPreferenceId(description, strength),
      description,
      strength,
    });
  }
  return normalizePreferenceList(preferences);
}

function materializeActiveConflicts(
  raw: ActiveConflictDerivationOutput,
  input: ActiveConflictDerivationInput
): ActiveConflict[] {
  const stage = toConflictStage(input.currentStage);
  if (!stage) return [];

  const knownPreferenceIds = new Set(input.preferences.map((item) => item.id));
  const scope = buildConflictScope(stage, input.state);
  const conflicts: ActiveConflict[] = [];

  for (const rawConflict of raw.activeConflicts) {
    const reason = normalizeDescription(rawConflict.reason);
    if (!reason) continue;
    const preferenceIds = Array.from(
      new Set(
        rawConflict.preferenceIds
          .map((item) => item.trim())
          .filter((item) => item.length > 0 && knownPreferenceIds.has(item))
      )
    );
    if (preferenceIds.length === 0) continue;
    const severity = rawConflict.severity === 'soft' ? 'soft' : 'blocking';
    const baseConflict = {
      preferenceIds,
      scope,
      severity,
      reason,
    } satisfies Omit<ActiveConflict, 'id'>;
    conflicts.push({
      ...baseConflict,
      id: buildActiveConflictId(baseConflict),
    });
  }

  return normalizeActiveConflicts(conflicts);
}

function toPreferenceExtractionOutput(value: Record<string, unknown>): PreferenceExtractionOutput | null {
  const rawPreferences = Array.isArray(value.preferences) ? value.preferences : null;
  if (!rawPreferences) return null;

  const preferences: PreferenceExtractionOutput['preferences'] = [];
  for (const entry of rawPreferences) {
    if (!isRecord(entry)) continue;
    const description = normalizeDescription(entry.description);
    if (!description) continue;
    preferences.push({
      description,
      strength: normalizePreferenceStrength(entry.strength),
    });
  }

  return { preferences };
}

function toActiveConflictDerivationOutput(
  value: Record<string, unknown>
): ActiveConflictDerivationOutput | null {
  const rawConflicts = Array.isArray(value.activeConflicts) ? value.activeConflicts : null;
  if (!rawConflicts) return null;

  const activeConflicts: ActiveConflictDerivationOutput['activeConflicts'] = [];
  for (const entry of rawConflicts) {
    if (!isRecord(entry)) continue;
    const preferenceIds = Array.isArray(entry.preferenceIds)
      ? entry.preferenceIds.filter((item): item is string => typeof item === 'string')
      : [];
    const reason = normalizeDescription(entry.reason);
    if (preferenceIds.length === 0 || !reason) continue;
    activeConflicts.push({
      preferenceIds,
      severity: entry.severity === 'soft' ? 'soft' : 'blocking',
      reason,
    });
  }

  return { activeConflicts };
}

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
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

function getGeminiModel(): string {
  return process.env.AGENT_GEMINI_MODEL || 'gemini-2.5-flash';
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

async function callOpenAIJson(
  kind: ExtractionKind,
  systemPrompt: string,
  input: unknown,
  schema: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  if (process.env.AGENT_ENABLE_OPENAI === 'false') return null;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = getOpenAIModel();
  const temperature = resolveOpenAITemperature();
  const baseBody = {
    model,
    input: [
      {
        role: 'system',
        content: `${systemPrompt}\n- Return JSON only via schema.`,
      },
      { role: 'user', content: JSON.stringify(input) },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: `${kind}_result`,
        strict: false,
        schema,
      },
    },
  };
  const body = typeof temperature === 'number' ? { ...baseBody, temperature } : baseBody;

  if (DEBUG_LLM) {
    console.log(`[tuning-agent][extractor:${kind}:openai] request:`, JSON.stringify(input));
  }
  emitLlmTrace('request', {
    kind,
    provider: 'openai',
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
      emitLlmTrace('request', {
        kind,
        provider: 'openai',
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
      emitLlmTrace('error', { kind, provider: 'openai', status: response.status, errorText });
      throw new Error(`OpenAI extractor failed (${response.status}): ${errorText}`);
    }
  }

  const payload = (await response.json()) as unknown;
  const outputText = parseOpenAIOutputText(payload);
  emitLlmTrace('response.raw', { kind, provider: 'openai', outputText });
  if (!outputText) return null;

  const parsed = parseJsonObject(outputText);
  emitLlmTrace('response.parsed', { kind, provider: 'openai', parsed });
  return parsed;
}

async function callGeminiJson(
  kind: ExtractionKind,
  systemPrompt: string,
  input: unknown
): Promise<Record<string, unknown> | null> {
  if (process.env.AGENT_ENABLE_GEMINI === 'false') return null;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = getGeminiModel();
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
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
    console.log(`[tuning-agent][extractor:${kind}:gemini] request:`, JSON.stringify(input));
  }
  emitLlmTrace('request', { kind, provider: 'gemini', model, input });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    emitLlmTrace('error', { kind, provider: 'gemini', status: response.status, errorText });
    throw new Error(`Gemini extractor failed (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as unknown;
  const outputText = extractGeminiText(payload);
  emitLlmTrace('response.raw', { kind, provider: 'gemini', outputText });
  if (!outputText) return null;

  const parsed = parseJsonObject(outputText);
  emitLlmTrace('response.parsed', { kind, provider: 'gemini', parsed });
  return parsed;
}

async function callStructuredExtractor(
  kind: ExtractionKind,
  systemPrompt: string,
  input: unknown,
  schema: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  refreshModelEnvVars();

  const geminiEnabled =
    process.env.AGENT_ENABLE_GEMINI !== 'false' && Boolean(process.env.GEMINI_API_KEY);
  const openaiEnabled =
    process.env.AGENT_ENABLE_OPENAI !== 'false' && Boolean(process.env.OPENAI_API_KEY);

  if (!geminiEnabled && !openaiEnabled) {
    throw new Error('EXTRACTION_PROVIDER_UNAVAILABLE');
  }

  return geminiEnabled
    ? await callGeminiJson(kind, systemPrompt, input)
    : await callOpenAIJson(kind, systemPrompt, input, schema);
}

export interface PreferenceExtractionContext {
  userMessage: string;
  currentStage: string;
  state: Record<string, unknown> | null;
  uiSpec: unknown;
  recentHistory: unknown[];
  existingPreferences: Preference[];
}

export interface ActiveConflictDerivationContext {
  currentStage: string;
  state: Record<string, unknown> | null;
  uiSpec: unknown;
  preferences: Preference[];
}

export async function extractStructuredPreferences(
  ctx: PreferenceExtractionContext
): Promise<Preference[]> {
  const input: PreferenceExtractionInput = {
    userMessage: ctx.userMessage,
    currentStage: ctx.currentStage,
    state: ctx.state,
    uiSpec: ctx.uiSpec,
    recentHistory: ctx.recentHistory,
    existingPreferences: ctx.existingPreferences,
  };

  const schema = {
    type: 'object',
    properties: {
      preferences: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            strength: { type: 'string', enum: ['hard', 'soft'] },
          },
          required: ['description', 'strength'],
          additionalProperties: false,
        },
      },
    },
    required: ['preferences'],
    additionalProperties: false,
  };

  const parsed = await callStructuredExtractor('preferences', PREFERENCE_SYSTEM_PROMPT, input, schema);
  if (!parsed) {
    throw new Error('PREFERENCE_EXTRACTION_INVALID_OUTPUT');
  }

  const output = toPreferenceExtractionOutput(parsed);
  if (!output) {
    throw new Error('PREFERENCE_EXTRACTION_INVALID_OUTPUT');
  }

  return materializePreferences(output);
}

export async function deriveActiveConflicts(
  ctx: ActiveConflictDerivationContext
): Promise<ActiveConflict[]> {
  const input: ActiveConflictDerivationInput = {
    currentStage: ctx.currentStage,
    preferences: ctx.preferences,
    state: ctx.state,
    uiSpec: ctx.uiSpec,
  };

  const schema = {
    type: 'object',
    properties: {
      activeConflicts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            preferenceIds: { type: 'array', items: { type: 'string' } },
            severity: { type: 'string', enum: ['blocking', 'soft'] },
            reason: { type: 'string' },
          },
          required: ['preferenceIds', 'severity', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['activeConflicts'],
    additionalProperties: false,
  };

  const parsed = await callStructuredExtractor(
    'active_conflicts',
    ACTIVE_CONFLICT_SYSTEM_PROMPT,
    input,
    schema
  );
  if (!parsed) {
    throw new Error('ACTIVE_CONFLICT_DERIVATION_INVALID_OUTPUT');
  }

  const output = toActiveConflictDerivationOutput(parsed);
  if (!output) {
    throw new Error('ACTIVE_CONFLICT_DERIVATION_INVALID_OUTPUT');
  }

  return materializeActiveConflicts(output, input);
}
