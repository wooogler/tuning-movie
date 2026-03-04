export type PreferencePriority = 'hard' | 'soft' | 'unknown';
export type PreferenceStage = 'movie' | 'theater' | 'date' | 'time' | 'seat' | 'confirm';

export interface PreferenceRow {
  id: string;
  label: string;
  description?: string;
  priority: PreferencePriority;
  stage: PreferenceStage;
  step: number;
  stepLabel: string;
}

const PREFERENCE_STAGE_ORDER: PreferenceStage[] = [
  'movie',
  'theater',
  'date',
  'time',
  'seat',
  'confirm',
];

const PREFERENCE_STAGE_META: Record<PreferenceStage, { step: number; label: string }> = {
  movie: { step: 1, label: 'Movie' },
  theater: { step: 2, label: 'Theater' },
  date: { step: 3, label: 'Date' },
  time: { step: 4, label: 'Time' },
  seat: { step: 5, label: 'Seat' },
  confirm: { step: 6, label: 'Confirm' },
};

const KNOWN_PREFERENCE_LABELS: Record<string, string> = {
  comedy: 'Comedy genre',
  'weekend-only': 'This weekend only',
  'distance-under-10mi': 'Theater within 10 miles',
  'no-sunday-morning': 'No Sunday morning showtimes',
  'end-before-10pm': 'Movie ends before 10 PM',
  'three-adjacent-seats': '3 adjacent seats',
  'row-2-low-vision': 'Row 2 seating (low vision)',
  'high-rating': 'High rating preferred',
  'avoid-romcom': 'Avoid romantic comedy',
  'desk-for-two': 'Prefer Desk for Two',
  'saturday-afternoon': 'Prefer Saturday afternoon',
};

const KNOWN_PREFERENCE_DESCRIPTIONS: Record<string, string> = {
  comedy: 'Choose a movie that includes comedy.',
  'weekend-only': 'Must watch this weekend (Saturday or Sunday).',
  'distance-under-10mi': 'Only theaters within 10 miles are acceptable.',
  'no-sunday-morning': 'Sunday morning showtimes are not available.',
  'end-before-10pm': 'Pick a showtime that ends before 10:00 PM.',
  'three-adjacent-seats': 'Need 3 side-by-side seats in the same row.',
  'row-2-low-vision': 'Second row is required for low-vision accessibility.',
  'high-rating': 'Prefer higher-rated options when possible.',
  'avoid-romcom': 'Prefer non-romantic-comedy options if available.',
  'desk-for-two': 'Initial preference is the movie "Desk for Two".',
  'saturday-afternoon': 'For Saturday, afternoon times are preferred.',
};

const KNOWN_PREFERENCE_STORY_HIGHLIGHTS: Record<string, string[]> = {
  comedy: ['agreed on a comedy', "as long as it's a comedy movie"],
  'weekend-only': [
    'this weekend',
    'if not this weekend, it will be a while before your schedules align again',
  ],
  'distance-under-10mi': ['within 10 miles', 'Anything outside the town would not work'],
  'no-sunday-morning': ['Sunday mornings are out'],
  'end-before-10pm': ['ends before 10 PM'],
  'three-adjacent-seats': ['must sit together in adjacent seats'],
  'row-2-low-vision': [
    'Avery has low vision',
    'prefers to sit in the second row',
    'the first row is too close',
    'anything beyond the third row is too far',
  ],
  'high-rating': ['prefer movies with high ratings'],
  'avoid-romcom': [
    'prefer to avoid romantic comedies',
    "you're open to it if the other options don't work out",
  ],
  'desk-for-two': ['Desk for Two'],
  'saturday-afternoon': ['On Saturdays, you tend to sleep in, so morning showtimes are not ideal'],
};

const KNOWN_PREFERENCE_STAGES: Record<string, PreferenceStage> = {
  comedy: 'movie',
  'high-rating': 'movie',
  'avoid-romcom': 'movie',
  'desk-for-two': 'movie',
  'distance-under-10mi': 'theater',
  'weekend-only': 'date',
  'no-sunday-morning': 'time',
  'end-before-10pm': 'time',
  'saturday-afternoon': 'time',
  'three-adjacent-seats': 'seat',
  'row-2-low-vision': 'seat',
};

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .filter((token) => token.length > 0)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function inferPriority(preferenceType: string): PreferencePriority {
  if (preferenceType.endsWith('-hard')) return 'hard';
  if (preferenceType.endsWith('-soft')) return 'soft';
  return 'unknown';
}

function basePreferenceId(preferenceType: string): string {
  if (preferenceType.endsWith('-hard') || preferenceType.endsWith('-soft')) {
    return preferenceType.slice(0, -5);
  }
  return preferenceType;
}

function toPreferenceLabel(baseId: string): string {
  const known = KNOWN_PREFERENCE_LABELS[baseId];
  if (known) return known;
  return toTitleCase(baseId.replace(/[_-]+/g, ' '));
}

function toPreferenceDescription(baseId: string): string | undefined {
  return KNOWN_PREFERENCE_DESCRIPTIONS[baseId];
}

export function getStoryHighlightPhrases(preferenceTypes: string[]): string[] {
  const phrases = new Set<string>();
  for (const preferenceType of preferenceTypes) {
    const baseId = basePreferenceId(preferenceType);
    const candidates = KNOWN_PREFERENCE_STORY_HIGHLIGHTS[baseId] ?? [];
    for (const candidate of candidates) {
      phrases.add(candidate);
    }
  }
  return [...phrases];
}

function inferStage(baseId: string): PreferenceStage {
  const known = KNOWN_PREFERENCE_STAGES[baseId];
  if (known) return known;

  if (/(seat|row|adjacent|ticket)/.test(baseId)) return 'seat';
  if (/(theater|distance|mile)/.test(baseId)) return 'theater';
  if (/(morning|afternoon|evening|runtime|before|after|start|end|time|pm|am)/.test(baseId)) {
    return 'time';
  }
  if (/(weekend|saturday|sunday|date|weekday)/.test(baseId)) return 'date';
  if (/(confirm|submit|checkout|payment|booked|booking-complete)/.test(baseId)) return 'confirm';
  return 'movie';
}

export function getPreferenceStepMeta(stage: PreferenceStage): { step: number; label: string } {
  return PREFERENCE_STAGE_META[stage];
}

export function getPreferenceStageOrder(): PreferenceStage[] {
  return PREFERENCE_STAGE_ORDER.slice();
}

export function buildPreferenceRows(preferenceTypes: string[]): PreferenceRow[] {
  return preferenceTypes.map((preferenceType) => {
    const baseId = basePreferenceId(preferenceType);
    const stage = inferStage(baseId);
    const stepMeta = getPreferenceStepMeta(stage);
    return {
      id: preferenceType,
      label: toPreferenceLabel(baseId),
      description: toPreferenceDescription(baseId),
      priority: inferPriority(preferenceType),
      stage,
      step: stepMeta.step,
      stepLabel: stepMeta.label,
    };
  });
}
