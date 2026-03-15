import { refreshModelEnvVars } from '../core/envRefresh';
import { addEndTimeToItems, parseDurationMinutes } from '../core/timeUtils';
import {
  buildActiveConflictId,
  buildConflictScope,
  buildPreferenceId,
  normalizeActiveConflicts,
  normalizePreferenceList,
} from '../core/cpMemory';
import { CONFLICT_STAGES } from '../types';
import type { ActiveConflict, ConflictScope, ConflictStage, Preference } from '../types';

interface PreferenceExtractionInput {
  precedingAgentMessage: string | null;
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
    relevantStages: ConflictStage[];
  }>;
}

interface CompactDeadEnd {
  preferenceIds: string[];
  scope: ConflictScope;
  description: string;
}

interface ActiveConflictDerivationInput {
  currentStage: string;
  preferences: Preference[];
  state: Record<string, unknown> | null;
  uiSpec: unknown;
  deadEnds: CompactDeadEnd[];
}

interface ActiveConflictDerivationOutput {
  activeConflicts: Array<{
    preferenceIds: string[];
    description: string;
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
let llmTraceRequestSequence = 0;

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
  'You maintain the structured user preference memory for a booking agent.\n' +
  'Input: precedingAgentMessage, userMessage, currentStage, state, uiSpec, recentHistory, existingPreferences.\n' +
  'Return the full updated preference list for the current turn.\n' +
  '\n' +
  'Durable vs procedural — the core distinction:\n' +
  '- STORE only durable preferences: ongoing rules, constraints, or stable desires the user wants applied across branches.\n' +
  '- DO NOT STORE procedural actions: selecting a visible option, confirming a suggestion, exploring, navigating, or making a one-time commitment for the current step. These do not narrow or replace an existing preference.\n' +
  '- Read precedingAgentMessage to understand what the user is responding to. If the agent asked the user to choose between options, the user\'s reply is a procedural selection — not a new or narrowed preference. Keep the existing preference intact.\n' +
  '- When in doubt, keep existingPreferences unchanged.\n' +
  '\n' +
  'Reasoning steps:\n' +
  '1. What is the agent asking or presenting? Read precedingAgentMessage.\n' +
  '2. Is the user\'s reply a procedural action (selecting, confirming, navigating) or a durable preference? If procedural, return existingPreferences unchanged — stop here.\n' +
  '3. For each durable preference, determine strength:\n' +
  '   - "hard": the user can accept ONLY options that match. If no option matches, the user would want to be warned.\n' +
  '   - "soft": the user prefers matching options but would accept alternatives. Useful for ranking among viable options.\n' +
  '   If the user softens an existing hard preference, downgrade to soft. When genuinely ambiguous, default to "hard".\n' +
  '4. Assign relevantStages: the stage(s) where this preference applies. Use stageFieldGuides to determine which stage controls the relevant data field.\n' +
  '\n' +
  'Rules:\n' +
  '- Preferences come from user intent, not system availability.\n' +
  '- Preserve existing wording when meaning is unchanged (for stable IDs). Preserve relevantStages likewise.\n' +
  '- Remove obsolete preferences by omitting them.\n' +
  '- Keep descriptions as short standalone sentences. Do not include IDs.\n' +
  'Return JSON: { "preferences": Array<{ "description": string, "strength": "hard" | "soft", "relevantStages": string[] }> }';

const ACTIVE_CONFLICT_SYSTEM_PROMPT =
  'You derive active conflicts for a booking agent.\n' +
  'Input fields:\n' +
  '- currentStage: the booking step being decided now.\n' +
  '- currentSelectionId: ID of the option the user is currently on (null if none).\n' +
  '- preferences: hard/soft user constraints with relevantStages.\n' +
  '- priorSelections: earlier-stage choices (movie, theater, etc.).\n' +
  '- items: available options for the current stage. An item with a "deadEnds" array is blocked — all downstream paths for that option have failed. Each dead-end entry carries preferenceIds and a description.\n' +
  '- highlightedIds: IDs the UI is actively recommending.\n' +
  '- deadEnds (if present): dead-ends that could not be matched to a specific item but still apply broadly.\n' +
  '\n' +
  'Reasoning steps:\n' +
  '1. Identify which preferences are relevant to currentStage (check relevantStages). If no relevant hard preferences exist, return empty activeConflicts — stop here.\n' +
  '2. For each relevant hard preference, derive any computed values needed (e.g., end time = start time + duration), then check whether at least one available non-dead-ended item satisfies it.\n' +
  '3. Check all relevant hard preferences conjunctively: does at least one item satisfy ALL of them together? If yes, no conflict — skip to step 4.\n' +
  '4. Check currentSelectionId (skip if null): does it point to a dead-ended or blocked item? If so, report a conflict even if alternatives exist.\n' +
  '\n' +
  'When to report a conflict:\n' +
  '- No viable item: no remaining item satisfies all relevant hard preferences jointly.\n' +
  '- Current selection blocked: currentSelectionId is dead-ended or violates hard preferences.\n' +
  '- UI exclusively directing to violation: every highlightedId is blocked.\n' +
  '\n' +
  'Rules:\n' +
  '- Combine related preferenceIds into a single conflict entry.\n' +
  '- Use only preferenceIds that exist in the provided preferences.\n' +
  '- Do not carry over historical conflicts or create speculative ones.\n' +
  '- description: short summary of which preferences are violated and why.\n' +
  'Return JSON: { "activeConflicts": Array<{ "preferenceIds": string[], "description": string }> }';

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

function createLlmTraceRequestId(kind: ExtractionKind): string {
  llmTraceRequestSequence += 1;
  return `${kind}-${llmTraceRequestSequence}`;
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

function normalizeRelevantStages(
  value: unknown,
  fallback: readonly ConflictStage[] = CONFLICT_STAGES
): ConflictStage[] {
  const normalized: ConflictStage[] = [];
  const seen = new Set<ConflictStage>();
  const source = Array.isArray(value) ? value : fallback;
  for (const item of source) {
    if (typeof item !== 'string') continue;
    const stage = toConflictStage(item);
    if (!stage || seen.has(stage)) continue;
    seen.add(stage);
    normalized.push(stage);
  }
  return normalized.length > 0 ? normalized : CONFLICT_STAGES.slice();
}

function materializePreferences(
  raw: PreferenceExtractionOutput,
  existingPreferences: Preference[]
): Preference[] {
  const existingById = new Map(existingPreferences.map((item) => [item.id, item]));
  const preferences: Preference[] = [];
  for (const rawPreference of raw.preferences) {
    const description = normalizeDescription(rawPreference.description);
    if (!description) continue;
    const strength = normalizePreferenceStrength(rawPreference.strength);
    const id = buildPreferenceId(description);
    const existing = existingById.get(id);
    preferences.push({
      id,
      description,
      strength,
      relevantStages: normalizeRelevantStages(rawPreference.relevantStages, existing?.relevantStages),
    });
  }
  return normalizePreferenceList(preferences);
}

function deriveSeverity(
  preferenceIds: string[],
  preferences: Preference[]
): 'blocking' | 'soft' {
  const byId = new Map(preferences.map((item) => [item.id, item]));
  for (const id of preferenceIds) {
    const pref = byId.get(id);
    if (pref && pref.strength === 'hard') return 'blocking';
  }
  return 'soft';
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
    const preferenceIds = Array.from(
      new Set(
        rawConflict.preferenceIds
          .map((item) => item.trim())
          .filter((item) => item.length > 0 && knownPreferenceIds.has(item))
      )
    );
    if (preferenceIds.length === 0) continue;
    const description = normalizeDescription(rawConflict.description);
    if (!description) continue;
    const severity = deriveSeverity(preferenceIds, input.preferences);
    const baseConflict = {
      preferenceIds,
      description,
      scope,
      severity,
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
      relevantStages: normalizeRelevantStages(entry.relevantStages),
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
    const description = normalizeDescription(entry.description);
    if (preferenceIds.length === 0 || !description) continue;
    activeConflicts.push({
      preferenceIds,
      description,
    });
  }

  return { activeConflicts };
}

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_OPENAI_TEMPERATURE = 0;

function resolveOpenAIReasoning(
  kind: ExtractionKind,
): { effort: 'low' | 'medium'; summary?: 'auto' } | undefined {
  if (kind === 'preferences') return { effort: 'low' };
  if (kind === 'active_conflicts') return { effort: 'medium', summary: 'auto' };
  return undefined;
}

function resolveOpenAITemperature(): number | undefined {
  return DEFAULT_OPENAI_TEMPERATURE;
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

function parseReasoningSummary(body: unknown): string[] | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const output = Array.isArray(record.output) ? record.output : [];
  const summaries: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const itemRecord = item as Record<string, unknown>;
    if (itemRecord.type !== 'reasoning') continue;
    const summary = Array.isArray(itemRecord.summary) ? itemRecord.summary : [];
    for (const entry of summary) {
      if (!entry || typeof entry !== 'object') continue;
      const entryRecord = entry as Record<string, unknown>;
      if (typeof entryRecord.text === 'string' && entryRecord.text.trim()) {
        summaries.push(entryRecord.text.trim());
      }
    }
  }
  return summaries.length > 0 ? summaries : null;
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
  const reasoning = resolveOpenAIReasoning(kind);
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
  const body = {
    ...baseBody,
    ...(typeof temperature === 'number' ? { temperature } : {}),
    ...(reasoning ? { reasoning } : {}),
  };
  const traceRequestId = createLlmTraceRequestId(kind);

  if (DEBUG_LLM) {
    console.log(`[tuning-agent][extractor:${kind}:openai] request:`, JSON.stringify(input));
  }
  emitLlmTrace('request', {
    requestId: traceRequestId,
    method: 'POST',
    url: OPENAI_API_URL,
    headers: {
      'Content-Type': 'application/json',
    },
    body,
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
        requestId: traceRequestId,
        method: 'POST',
        url: OPENAI_API_URL,
        headers: {
          'Content-Type': 'application/json',
        },
        body: baseBody,
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
      emitLlmTrace('error', {
        requestId: traceRequestId,
        kind,
        provider: 'openai',
        status: response.status,
        errorText,
      });
      throw new Error(`OpenAI extractor failed (${response.status}): ${errorText}`);
    }
  }

  const payload = (await response.json()) as unknown;
  const outputText = parseOpenAIOutputText(payload);
  const reasoningSummary = parseReasoningSummary(payload);
  emitLlmTrace('response.raw', {
    requestId: traceRequestId,
    kind,
    provider: 'openai',
    outputText,
    reasoningSummary,
  });
  if (!outputText) return null;

  const parsed = parseJsonObject(outputText);
  emitLlmTrace('response.parsed', {
    requestId: traceRequestId,
    kind,
    provider: 'openai',
    parsed,
  });
  return parsed;
}

async function callStructuredExtractor(
  kind: ExtractionKind,
  systemPrompt: string,
  input: unknown,
  schema: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  refreshModelEnvVars();
  const openaiEnabled =
    process.env.AGENT_ENABLE_OPENAI !== 'false' && Boolean(process.env.OPENAI_API_KEY);

  if (!openaiEnabled) {
    throw new Error('EXTRACTION_PROVIDER_UNAVAILABLE');
  }

  return await callOpenAIJson(kind, systemPrompt, input, schema);
}

export interface PreferenceExtractionContext {
  userMessage: string;
  currentStage: string;
  state: Record<string, unknown> | null;
  uiSpec: unknown;
  recentHistory: unknown[];
  existingPreferences: Preference[];
  precedingAgentMessage?: string | null;
  stageMeta?: Array<{ stage: string; goal: string; fieldGuide: string }>;
}

export interface ActiveConflictDerivationContext {
  currentStage: string;
  state: Record<string, unknown> | null;
  uiSpec: unknown;
  preferences: Preference[];
  deadEnds: CompactDeadEnd[];
}

export async function extractStructuredPreferences(
  ctx: PreferenceExtractionContext
): Promise<Preference[]> {
  // Find the preceding agent message so the LLM can see what the user is responding to.
  let precedingAgentMessage = ctx.precedingAgentMessage ?? null;
  if (!precedingAgentMessage) {
    for (let i = ctx.recentHistory.length - 1; i >= 0; i--) {
      const entry = ctx.recentHistory[i];
      if (isRecord(entry) && entry.type === 'agent' && typeof entry.text === 'string' && entry.text.trim()) {
        precedingAgentMessage = entry.text.trim();
        break;
      }
    }
  }

  const input: PreferenceExtractionInput = {
    precedingAgentMessage,
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
            relevantStages: {
              type: 'array',
              items: { type: 'string', enum: CONFLICT_STAGES },
            },
          },
          required: ['description', 'strength', 'relevantStages'],
          additionalProperties: false,
        },
      },
    },
    required: ['preferences'],
    additionalProperties: false,
  };

  const systemPrompt = ctx.stageMeta
    ? PREFERENCE_SYSTEM_PROMPT +
      '\n\nstageFieldGuides:\n' +
      ctx.stageMeta
        .map((s) => `- ${s.stage}: ${s.fieldGuide}`)
        .join('\n')
    : PREFERENCE_SYSTEM_PROMPT;

  const parsed = await callStructuredExtractor('preferences', systemPrompt, input, schema);
  if (!parsed) {
    throw new Error('PREFERENCE_EXTRACTION_INVALID_OUTPUT');
  }

  const output = toPreferenceExtractionOutput(parsed);
  if (!output) {
    throw new Error('PREFERENCE_EXTRACTION_INVALID_OUTPUT');
  }

  return materializePreferences(output, ctx.existingPreferences);
}

// ── Active-conflict LLM payload builder ─────────────────────────

const STAGE_KEY_ALIASES: Record<string, string> = { time: 'showing', seat: 'seats' };

function stageToScopeKey(stage: string): string {
  return STAGE_KEY_ALIASES[stage] ?? stage;
}

function isDeadEndScopeCompatible(
  deadEnd: CompactDeadEnd,
  priorSelections: Record<string, unknown>,
  currentStage: string
): boolean {
  const scope = deadEnd.scope as unknown as Record<string, unknown>;
  const currentScopeKey = stageToScopeKey(currentStage);
  for (const [field, scopeValue] of Object.entries(scope)) {
    if (field === 'stage' || field === currentScopeKey) continue;
    if (typeof scopeValue !== 'string') continue;
    const selection = priorSelections[field];
    if (!selection || !isRecord(selection)) continue;
    let matched = false;
    for (const v of Object.values(selection)) {
      if (typeof v === 'string' && v === scopeValue) { matched = true; break; }
    }
    if (!matched) return false;
  }
  return true;
}

function doesDeadEndMatchItem(
  deadEnd: CompactDeadEnd,
  item: Record<string, unknown>,
  currentStage: string
): boolean {
  const scopeKey = stageToScopeKey(currentStage);
  const scopeValue = (deadEnd.scope as unknown as Record<string, unknown>)[scopeKey];
  if (typeof scopeValue !== 'string' || !scopeValue) return false;
  for (const value of Object.values(item)) {
    if (typeof value === 'string' && value === scopeValue) return true;
  }
  return false;
}

function isItemAvailable(item: Record<string, unknown>): boolean {
  if (item.available === false) return false;
  if (typeof item.status === 'string' && item.status !== 'available') return false;
  return true;
}

function extractHighlightedIds(uiSpec: unknown): string[] {
  if (!isRecord(uiSpec)) return [];
  const spec = uiSpec as Record<string, unknown>;
  const modification = isRecord(spec.modification) ? spec.modification : null;
  const highlight = modification && isRecord(modification.highlight) ? modification.highlight : null;
  if (!highlight || !Array.isArray(highlight.itemIds)) return [];
  return highlight.itemIds.filter((id): id is string => typeof id === 'string');
}

function extractRawItems(uiSpec: unknown): Record<string, unknown>[] {
  if (!isRecord(uiSpec)) return [];
  const items = (uiSpec as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];
  return items.filter((item): item is Record<string, unknown> => isRecord(item));
}

function buildConflictLlmPayload(
  input: ActiveConflictDerivationInput
): Record<string, unknown> {
  let currentSelectionId: string | null = null;
  if (input.state && isRecord(input.state.currentSelection)) {
    currentSelectionId = readTrimmedString(input.state.currentSelection.id);
  }

  const currentStageKey = stageToScopeKey(input.currentStage);
  const priorSelections: Record<string, unknown> = {};
  if (input.state) {
    for (const [key, value] of Object.entries(input.state)) {
      if (key === 'currentSelection' || key === currentStageKey) continue;
      if (isRecord(value)) {
        priorSelections[key] = value;
      }
    }
  }

  const highlightedIds = extractHighlightedIds(input.uiSpec);
  let rawItems = extractRawItems(input.uiSpec).filter(isItemAvailable);

  const applicableDeadEnds = input.deadEnds.filter((de) =>
    isDeadEndScopeCompatible(de, priorSelections, input.currentStage)
  );

  if (input.currentStage === 'time' && input.state) {
    const movie = isRecord(input.state.movie) ? input.state.movie : null;
    const duration = movie ? readTrimmedString(movie.duration) : null;
    if (duration) {
      const mins = parseDurationMinutes(duration);
      if (mins) {
        rawItems = addEndTimeToItems(rawItems, mins);
      }
    }
  }

  const matchedDeadEndIndices = new Set<number>();
  const items = rawItems.map((item) => {
    const copy = { ...item };
    const matchingDeadEnds: Array<{ preferenceIds: string[]; description: string }> = [];
    applicableDeadEnds.forEach((de, idx) => {
      if (doesDeadEndMatchItem(de, item, input.currentStage)) {
        matchedDeadEndIndices.add(idx);
        matchingDeadEnds.push({ preferenceIds: de.preferenceIds, description: de.description });
      }
    });
    if (matchingDeadEnds.length > 0) copy.deadEnds = matchingDeadEnds;
    return copy;
  });

  const unmatchedDeadEnds = applicableDeadEnds
    .filter((_, idx) => !matchedDeadEndIndices.has(idx))
    .map((de) => ({ preferenceIds: de.preferenceIds, description: de.description }));

  const payload: Record<string, unknown> = {
    currentStage: input.currentStage,
    currentSelectionId,
    preferences: input.preferences,
  };
  if (Object.keys(priorSelections).length > 0) payload.priorSelections = priorSelections;
  payload.items = items;
  if (highlightedIds.length > 0) payload.highlightedIds = highlightedIds;
  if (unmatchedDeadEnds.length > 0) payload.deadEnds = unmatchedDeadEnds;

  return payload;
}

export async function deriveActiveConflicts(
  ctx: ActiveConflictDerivationContext
): Promise<ActiveConflict[]> {
  const stage = toConflictStage(ctx.currentStage);
  if (!stage || stage === 'confirm') return [];

  const stagePreferences = ctx.preferences.filter((item) => item.relevantStages.includes(stage));
  if (stagePreferences.length === 0 && ctx.deadEnds.length === 0) return [];

  const stagePreferenceIds = new Set(stagePreferences.map((p) => p.id));
  const deadEndReferencedIds = new Set(ctx.deadEnds.flatMap((d) => d.preferenceIds));
  const extraPreferences = ctx.preferences.filter(
    (p) => !stagePreferenceIds.has(p.id) && deadEndReferencedIds.has(p.id)
  );
  const relevantPreferences = [...stagePreferences, ...extraPreferences];
  if (relevantPreferences.length === 0) return [];

  const input: ActiveConflictDerivationInput = {
    currentStage: ctx.currentStage,
    preferences: relevantPreferences,
    state: ctx.state,
    uiSpec: ctx.uiSpec,
    deadEnds: ctx.deadEnds,
  };

  const llmPayload = buildConflictLlmPayload(input);

  const schema = {
    type: 'object',
    properties: {
      activeConflicts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            preferenceIds: { type: 'array', items: { type: 'string' } },
            description: { type: 'string' },
          },
          required: ['preferenceIds', 'description'],
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
    llmPayload,
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
