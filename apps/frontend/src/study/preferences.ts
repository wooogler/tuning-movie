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

const SPECIFIC_DATE_PREFERENCE_PATTERN = /^date-(\d{4})-(\d{2})-(\d{2})$/;

const KNOWN_PREFERENCE_LABELS: Record<string, string> = {
  'ai-recommendation': 'AI recommendation preferred',
  action: 'Action genre',
  'arrive-after-530pm': 'Arrival after 5:30 PM',
  'arrive-after-6pm': 'Arrival after 6:00 PM',
  'before-7pm': 'Finish before 7 PM',
  'before-8pm': 'Finish before 8 PM',
  'center-seat': 'Centered seat required',
  'closest-theater': 'Closest theater preferred',
  comedy: 'Comedy genre',
  'cosmic-laughs': 'Watch Cosmic Laughs',
  'date-2026-03-12': 'Watch on Thu, Mar 12',
  'distance-under-12mi': 'Theater within 12 miles',
  'end-before-1030pm': 'End before 10:30 PM',
  'weekend-only': 'This weekend only',
  'distance-under-10mi': 'Theater within 10 miles',
  'end-before-6pm': 'End before 6 PM',
  'end-before-5pm': 'End before 5 PM',
  'no-sunday-morning': 'No Sunday morning showtimes',
  'next-weekend-only': 'Next weekend only',
  'end-before-10pm': 'Movie ends before 10 PM',
  'imax-required': 'IMAX required',
  'kid-friendly': 'Kid-friendly movie',
  'ocean-depths': 'Watch Ocean Depths',
  'premium-seat': 'Premium reclining seats',
  'start-after-1pm': 'Start after 1 PM',
  'start-after-2pm': 'Start after 2 PM',
  '3d-required': '3D screening required',
  'three-adjacent-seats': '3 adjacent seats',
  'two-adjacent-seats': '2 adjacent seats',
  'avoid-front-rows': 'Avoid first 3 rows',
  'avoid-first-two-rows': 'Avoid first 2 rows',
  'avoid-back-rows': 'Avoid last 2 rows',
  'row-2-low-vision': 'Row 2 seating (low vision)',
  'high-rating': 'High rating preferred',
  thriller: 'Thriller genre',
  'under-2-hours': 'Under 2 hours preferred',
  'avoid-romcom': 'Avoid romantic comedy',
  'desk-for-two': 'Prefer Shared Shift',
  'saturday-afternoon': 'Prefer Saturday afternoon',
};

const KNOWN_PREFERENCE_DESCRIPTIONS: Record<string, string> = {
  'ai-recommendation': 'Begin with an AI movie recommendation.',
  action: 'Choose a movie in the action genre.',
  'arrive-after-530pm': 'Do not pick a showing that requires arriving before 5:30 PM.',
  'arrive-after-6pm': 'Do not pick a showing that requires arriving before 6:00 PM.',
  'before-7pm': 'Pick a showing that finishes before 7:00 PM.',
  'before-8pm': 'Pick a showing that finishes before 8:00 PM.',
  'center-seat': 'Seats should be near the center of the screen. Seats 3, 4, 5, and 6 are acceptable.',
  'closest-theater': 'Prefer the nearest theater option.',
  comedy: 'Choose a movie that includes comedy.',
  'cosmic-laughs': 'The movie must be Cosmic Laughs.',
  'date-2026-03-12': 'The tickets should be booked for Thursday, March 12, 2026.',
  'distance-under-12mi': 'Only theaters within 12 miles are acceptable.',
  'end-before-1030pm': 'Pick a showtime that ends before 10:30 PM.',
  'weekend-only': 'Must watch this weekend (Saturday or Sunday).',
  'distance-under-10mi': 'Only theaters within 10 miles are acceptable.',
  'end-before-6pm': 'Pick a showing that ends before 6:00 PM.',
  'end-before-5pm': 'Pick a showing that ends before 5:00 PM.',
  'no-sunday-morning': 'Sunday morning showtimes are not available.',
  'next-weekend-only': 'Must watch next weekend (Saturday or Sunday).',
  'end-before-10pm': 'Pick a showtime that ends before 10:00 PM.',
  'imax-required': 'Only IMAX screenings are acceptable.',
  'kid-friendly': 'Choose a movie suitable for children around ages 7 to 9.',
  'ocean-depths': 'The movie must be Ocean Depths.',
  'premium-seat': 'Seats must be premium recliners with extra legroom.',
  'start-after-1pm': 'Pick a showing that starts at or after 1:00 PM.',
  'start-after-2pm': 'Pick a showing that starts at or after 2:00 PM.',
  '3d-required': 'Only 3D screenings are acceptable.',
  'three-adjacent-seats': 'Need 3 side-by-side seats in the same row.',
  'two-adjacent-seats': 'Need 2 side-by-side seats in the same row.',
  'avoid-front-rows': 'Do not use the first three rows.',
  'avoid-first-two-rows': 'Do not use the first two rows.',
  'avoid-back-rows': 'Do not use the last two rows.',
  'row-2-low-vision': 'Second row is required for low-vision accessibility.',
  'high-rating': 'Prefer higher-rated options when possible.',
  thriller: 'Choose a movie in the thriller genre.',
  'under-2-hours': 'Prefer a movie shorter than two hours when other constraints allow it.',
  'avoid-romcom': 'Prefer non-romantic-comedy options if available.',
  'desk-for-two': 'Initial preference is the movie "Shared Shift".',
  'saturday-afternoon': 'For Saturday, afternoon times are preferred.',
};

const KNOWN_PREFERENCE_STORY_HIGHLIGHTS: Record<string, string[]> = {
  'ai-recommendation': ['want AI to recommend a movie first'],
  action: ['It must be an action movie'],
  'arrive-after-530pm': ['earliest I can arrive at the theater is 5:30 PM'],
  'arrive-after-6pm': ['earliest I can arrive at the theater is 6:00 PM'],
  'before-7pm': ['finishes before 7 PM'],
  'before-8pm': ['after 8 PM on Saturday and Sunday', 'unavailable after 8 PM'],
  'center-seat': [
    'do not want a side seat',
    'seat needs to be reasonably centered on the screen',
    'a seat in the center section',
  ],
  'closest-theater': ['closest theater'],
  comedy: ['agreed on a comedy', "as long as it's a comedy movie"],
  'cosmic-laughs': ['watch Cosmic Laughs'],
  'date-2026-03-12': [
    'anniversary is tomorrow, Thursday, March 12',
    'tickets to be for their actual anniversary tomorrow',
  ],
  'distance-under-12mi': ['within 12 miles is acceptable'],
  'end-before-1030pm': ['end before 10:30 PM'],
  'weekend-only': [
    'this weekend',
    'if not this weekend, it will be a while before our schedules align again',
    'this Saturday',
  ],
  'distance-under-10mi': ['within 10 miles', 'Anything outside the town would not work'],
  'end-before-6pm': ['end before 6 PM'],
  'end-before-5pm': ['end before 5 PM'],
  'no-sunday-morning': ['Sunday mornings are out'],
  'next-weekend-only': ['next weekend'],
  'end-before-10pm': ['ends before 10 PM'],
  'imax-required': ['must watch it in IMAX format', 'must be in IMAX'],
  'kid-friendly': [
    'kid-friendly movie appropriate for ages 7 to 9',
    'kid-friendly movie appropriate for ages 7-9',
  ],
  'ocean-depths': ['watch a documentary called Ocean Depths', 'Ocean Depths'],
  'premium-seat': ['premium reclining seats with extra legroom'],
  'start-after-1pm': ['start after 1 PM'],
  'start-after-2pm': ['start after 2 PM'],
  '3d-required': ['must be in 3D'],
  'three-adjacent-seats': ['must sit together in adjacent seats'],
  'two-adjacent-seats': ['two seats must be together', 'need two adjacent seats'],
  'avoid-front-rows': ['avoid the first three rows'],
  'avoid-first-two-rows': ['must not be in the first two rows', 'not in the first two rows'],
  'avoid-back-rows': ['do not want to sit in the last two rows'],
  'row-2-low-vision': [
    'Avery has low vision',
    'prefers to sit in the second row',
    'the first row is too close',
    'anything beyond the third row is too far',
  ],
  'high-rating': ['prefer movies with high ratings', 'prefer the highest-rated'],
  thriller: ['want to watch a thriller movie', 'thriller'],
  'under-2-hours': ['under 2 hours long'],
  'avoid-romcom': [
    'prefer to avoid romantic comedies',
    "we're open to it if the other options don't work out",
  ],
  'desk-for-two': ['Shared Shift'],
  'saturday-afternoon': ['On Saturdays, I tend to sleep in, so morning showtimes are not ideal'],
};

const KNOWN_PREFERENCE_STAGES: Record<string, PreferenceStage> = {
  'ai-recommendation': 'movie',
  action: 'movie',
  'arrive-after-530pm': 'time',
  'arrive-after-6pm': 'time',
  'before-7pm': 'time',
  'before-8pm': 'time',
  'center-seat': 'seat',
  'closest-theater': 'theater',
  comedy: 'movie',
  'cosmic-laughs': 'movie',
  'date-2026-03-12': 'date',
  'distance-under-12mi': 'theater',
  'end-before-1030pm': 'time',
  'high-rating': 'movie',
  thriller: 'movie',
  'under-2-hours': 'movie',
  'avoid-romcom': 'movie',
  'desk-for-two': 'movie',
  'distance-under-10mi': 'theater',
  'end-before-6pm': 'time',
  'end-before-5pm': 'time',
  'weekend-only': 'date',
  'no-sunday-morning': 'time',
  'next-weekend-only': 'date',
  'end-before-10pm': 'time',
  'imax-required': 'time',
  'kid-friendly': 'movie',
  'ocean-depths': 'movie',
  'premium-seat': 'seat',
  'start-after-1pm': 'time',
  'start-after-2pm': 'time',
  '3d-required': 'time',
  'saturday-afternoon': 'time',
  'three-adjacent-seats': 'seat',
  'two-adjacent-seats': 'seat',
  'avoid-front-rows': 'seat',
  'avoid-first-two-rows': 'seat',
  'avoid-back-rows': 'seat',
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

function parseSpecificDatePreference(baseId: string): Date | null {
  const match = SPECIFIC_DATE_PREFERENCE_PATTERN.exec(baseId);
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatSpecificDateShort(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatSpecificDateLong(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function buildSpecificDateHighlightPhrases(date: Date): string[] {
  const weekdayLong = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(date);
  const monthDay = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);

  return [
    `${weekdayLong}, ${monthDay}`,
    formatSpecificDateLong(date),
    `this ${weekdayLong}, ${monthDay}`,
  ];
}

function toPreferenceLabel(baseId: string): string {
  const known = KNOWN_PREFERENCE_LABELS[baseId];
  if (known) return known;
  const specificDate = parseSpecificDatePreference(baseId);
  if (specificDate) return `Watch on ${formatSpecificDateShort(specificDate)}`;
  return toTitleCase(baseId.replace(/[_-]+/g, ' '));
}

function toPreferenceDescription(baseId: string): string | undefined {
  const known = KNOWN_PREFERENCE_DESCRIPTIONS[baseId];
  if (known) return known;
  const specificDate = parseSpecificDatePreference(baseId);
  if (specificDate) {
    return `The tickets should be booked for ${formatSpecificDateLong(specificDate)}.`;
  }
  return undefined;
}

export function getStoryHighlightPhrases(preferenceTypes: string[]): string[] {
  const phrases = new Set<string>();
  for (const preferenceType of preferenceTypes) {
    const baseId = basePreferenceId(preferenceType);
    const specificDate = parseSpecificDatePreference(baseId);
    const candidates = specificDate
      ? buildSpecificDateHighlightPhrases(specificDate)
      : (KNOWN_PREFERENCE_STORY_HIGHLIGHTS[baseId] ?? []);
    for (const candidate of candidates) {
      phrases.add(candidate);
    }
  }
  return [...phrases];
}

function inferStage(baseId: string): PreferenceStage {
  const known = KNOWN_PREFERENCE_STAGES[baseId];
  if (known) return known;
  if (parseSpecificDatePreference(baseId)) return 'date';

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
