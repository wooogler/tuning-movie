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
}

interface ExtractionOutput {
  newPreferences: string[];
  supersededPreferences: string[];
  newConstraints: string[];
}

const DEBUG_LLM = process.env.AGENT_LLM_DEBUG === 'true';

const EXTRACTION_SYSTEM_PROMPT =
  'You extract user preferences and system constraints from a movie booking agent interaction turn.\n' +
  'You receive the conversation history, the current UI items on screen, and the action just taken.\n' +
  '\n' +
  'PREFERENCES — what the user wants, derived from their words:\n' +
  '- Movie/theater/seat choices: "wants to watch Dune", "prefers IMAX".\n' +
  '- Time and schedule: "only available after 15:00", "free only on Feb 28", "wants evening showtime".\n' +
  '- Quantity: "wants 2 tickets", "booking for 3 people".\n' +
  '- Any personal desire or availability constraint stated by the user.\n' +
  '- Must come directly from user words; do not infer preferences from system state.\n' +
  '- SKIP trivial or routine inputs that carry no preference: "ok", "yes", "sure", "next", "go ahead", "sounds good", confirmations, greetings, single-word acknowledgements. Return empty newPreferences for these.\n' +
  '\n' +
  'SUPERSEDED PREFERENCES — existing preferences replaced or refined this turn:\n' +
  '- When the user changes their mind, list the old preference from existingPreferences that is now obsolete.\n' +
  '  Example: user says "actually Dune" → supersede "wants to watch Holdovers", add "wants to watch Dune".\n' +
  '- When a new preference is a more specific version of an existing one, supersede the vague one.\n' +
  '  Example: existing "wants evening showtime" + user says "after 8pm" → supersede "wants evening showtime", add "wants showtime after 20:00".\n' +
  '- When two existing preferences overlap with the new one, supersede both and add one consolidated preference.\n' +
  '  Example: existing ["wants evening showtime", "prefers late show"] + user says "after 9pm" → supersede both, add "wants showtime after 21:00".\n' +
  '- Copy the exact string from existingPreferences so it can be matched and removed.\n' +
  '\n' +
  'CONSTRAINTS — objective system availability facts useful across stages:\n' +
  '- Derive from visibleItems, messageHistory, and action outcomes.\n' +
  '- Record which concrete options exist or do not exist for specific entities.\n' +
  '  Good: "Dune is only available at AMC Theater", "Dune showtimes on Feb 28: 10:00am, 1:00pm".\n' +
  '  Good: "Alamo Drafthouse does not show Dune", "No evening showtimes for Oppenheimer on Mar 1".\n' +
  '- Constraints must be objective facts about the booking system, not about the user.\n' +
  '  Bad: "user cannot see movie on Feb 27" (that is a preference, not a system fact).\n' +
  '  Bad: "Dune is not available for the user" (vague, not a system fact).\n' +
  '- Do not record temporary UI states like filter results or loading states.\n' +
  '  Bad: "no showtimes available with current filters".\n' +
  '- Each constraint should name specific entities (movie, theater, date, time) so it remains useful in later stages.\n' +
  '\n' +
  'Rules:\n' +
  '- Return empty arrays if nothing new can be derived.\n' +
  '- Do not repeat items already in existingPreferences or existingConstraints.\n' +
  '- Each item must be a short standalone sentence.\n' +
  '- Return JSON only matching this schema: { "newPreferences": string[], "supersededPreferences": string[], "newConstraints": string[] }';

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

function toExtractionOutput(value: Record<string, unknown>): ExtractionOutput {
  const newPreferences = Array.isArray(value.newPreferences)
    ? (value.newPreferences as unknown[]).filter((item): item is string => typeof item === 'string')
    : [];
  const supersededPreferences = Array.isArray(value.supersededPreferences)
    ? (value.supersededPreferences as unknown[]).filter((item): item is string => typeof item === 'string')
    : [];
  const newConstraints = Array.isArray(value.newConstraints)
    ? (value.newConstraints as unknown[]).filter((item): item is string => typeof item === 'string')
    : [];
  return { newPreferences, supersededPreferences, newConstraints };
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

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
  const body = {
    model,
    input: [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT + '\n- Return JSON only via schema.' },
      { role: 'user', content: JSON.stringify(input) },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'extraction_result',
        strict: false,
        schema: {
          type: 'object',
          properties: {
            newPreferences: { type: 'array', items: { type: 'string' } },
            supersededPreferences: { type: 'array', items: { type: 'string' } },
            newConstraints: { type: 'array', items: { type: 'string' } },
          },
          required: ['newPreferences', 'supersededPreferences', 'newConstraints'],
          additionalProperties: false,
        },
      },
    },
  };

  if (DEBUG_LLM) {
    console.log('[tuning-agent-v2][extractor:openai] request:', JSON.stringify(input));
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (DEBUG_LLM) {
      console.error('[tuning-agent-v2][extractor:openai] error:', errorText);
    }
    throw new Error(`OpenAI extractor failed (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as unknown;
  const outputText = parseOpenAIOutputText(payload);
  if (DEBUG_LLM) {
    console.log('[tuning-agent-v2][extractor:openai] raw output:', outputText);
  }
  if (!outputText) return null;

  const parsed = parseJsonObject(outputText);
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
      parts: [{ text: EXTRACTION_SYSTEM_PROMPT }],
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
    console.log('[tuning-agent-v2][extractor:gemini] request:', JSON.stringify(input));
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (DEBUG_LLM) {
      console.error('[tuning-agent-v2][extractor:gemini] error:', errorText);
    }
    throw new Error(`Gemini extractor failed (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as unknown;
  const outputText = extractGeminiText(payload);
  if (DEBUG_LLM) {
    console.log('[tuning-agent-v2][extractor:gemini] raw output:', outputText);
  }
  if (!outputText) return null;

  const parsed = parseJsonObject(outputText);
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
    return { newPreferences: [], supersededPreferences: [], newConstraints: [] };
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
  };

  const result = geminiEnabled
    ? await extractWithGemini(input)
    : await extractWithOpenAI(input);

  return result ?? { newPreferences: [], supersededPreferences: [], newConstraints: [] };
}
