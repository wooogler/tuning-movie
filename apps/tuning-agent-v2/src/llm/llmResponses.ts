interface ItemChoice {
  itemId: string;
  reason?: string;
}

interface ChooseItemInput {
  stage: string;
  preference: string;
  candidates: Array<{ id: string; value: string }>;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function toItemChoice(obj: Record<string, unknown>): ItemChoice | null {
  const itemId = typeof obj.itemId === 'string' ? obj.itemId.trim() : '';
  if (!itemId) return null;

  return {
    itemId,
    reason: typeof obj.reason === 'string' ? obj.reason : undefined,
  };
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const OPENAI_MODEL = process.env.AGENT_OPENAI_MODEL || 'gpt-5.2';

function extractOpenAIOutputText(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;

  if (typeof record.output_text === 'string' && record.output_text.trim()) {
    return record.output_text.trim();
  }

  const output = Array.isArray(record.output) ? record.output : [];
  for (const chunk of output) {
    if (!chunk || typeof chunk !== 'object') continue;
    const chunkRecord = chunk as Record<string, unknown>;
    const content = Array.isArray(chunkRecord.content) ? chunkRecord.content : [];
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

export async function chooseItemWithOpenAI(input: ChooseItemInput): Promise<ItemChoice | null> {
  if (process.env.AGENT_ENABLE_OPENAI === 'false') return null;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const body = {
    model: OPENAI_MODEL,
    input:
      'Choose exactly one candidate item id.\n' +
      'Prefer matching the user preference if provided.\n\n' +
      JSON.stringify(input),
    text: {
      format: {
        type: 'json_schema',
        name: 'item_choice',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['itemId'],
          additionalProperties: false,
        },
      },
    },
  };

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
    throw new Error(`OpenAI request failed (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as unknown;
  const outputText = extractOpenAIOutputText(payload);
  if (!outputText) return null;

  const obj = parseJsonObject(outputText);
  if (!obj) return null;

  return toItemChoice(obj);
}

// ── Gemini ──────────────────────────────────────────────────────────────────

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = process.env.AGENT_GEMINI_MODEL || 'gemini-2.5-flash';

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

export async function chooseItemWithGemini(input: ChooseItemInput): Promise<ItemChoice | null> {
  if (process.env.AGENT_ENABLE_GEMINI === 'false') return null;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: {
      parts: [
        {
          text:
            'Choose exactly one candidate item id.\n' +
            'Prefer matching the user preference if provided.\n' +
            'Return JSON only: { "itemId": string, "reason": string }',
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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as unknown;
  const outputText = extractGeminiText(payload);
  if (!outputText) return null;

  const obj = parseJsonObject(outputText);
  if (!obj) return null;

  return toItemChoice(obj);
}
