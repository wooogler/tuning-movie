export type PreferencePriority = 'hard' | 'soft' | 'unknown';
export type PreferenceStage = 'movie' | 'theater' | 'date' | 'time' | 'seat' | 'confirm';

interface PreferenceBuildContext {
  seatRows?: string[];
}

export interface PreferenceRow {
  id: string;
  label: string;
  description?: string;
  priority: PreferencePriority;
  stage: PreferenceStage;
  step: number;
  stageLabel: string;
}

export interface PreferenceStepSummary {
  stage: PreferenceStage;
  step: number;
  stageLabel: string;
  sentence: string;
}

export interface ExtractedPreferenceMention {
  preferenceId: string;
  basePreferenceId: string;
  priority: PreferencePriority;
  stage: PreferenceStage;
  matchedPhrases: string[];
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
  time: { step: 4, label: 'Showtime' },
  seat: { step: 5, label: 'Seat' },
  confirm: { step: 6, label: 'Confirm' },
};

const SPECIFIC_DATE_PREFERENCE_PATTERN = /^date-(\d{4})-(\d{2})-(\d{2})$/;

const KNOWN_PREFERENCE_LABELS: Record<string, string> = {
  'ai-recommendation': 'Describe the situation and ask for a recommendation',
  action: 'Action genre',
  'arrive-after-4pm': 'Arrival after 4:00 PM',
  'arrive-after-530pm': 'Arrival after 5:30 PM',
  'arrive-after-6pm': 'Arrival after 6:00 PM',
  'before-7pm': 'Finish before 7 PM',
  'before-8pm': 'Finish before 8 PM',
  'before-9pm': 'Finish before 9 PM',
  'center-seat': 'Centered seat required',
  'closest-theater': 'Closest theater preferred',
  comedy: 'Comedy genre',
  'cosmic-laughs': 'Watch Cosmic Laughs',
  'date-2026-03-12': 'Watch on Thu, Mar 12',
  'distance-under-12mi': 'Theater within 12 miles',
  'end-before-2pm': 'End before 2 PM',
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
  'kid-friendly-ai-guided': 'Ask AI for a kid-friendly recommendation',
  'ocean-depths': 'Watch Ocean Depths',
  'premium-seat': 'Premium reclining seats',
  'start-after-1pm': 'Start after 1 PM',
  'start-after-2pm': 'Start after 2 PM',
  '3d-required': '3D screening required',
  'four-adjacent-seats': '4 adjacent seats',
  'three-adjacent-seats': '3 adjacent seats',
  'two-adjacent-seats': '2 adjacent seats',
  'avoid-front-rows': 'Avoid first 3 rows',
  'avoid-first-two-rows': 'Avoid first 2 rows',
  'avoid-back-rows': 'Avoid last 2 rows',
  'row-2-low-vision': 'Row 2 seating (low vision)',
  'high-rating': 'High rating preferred',
  'low-rating': 'Lower rating acceptable',
  thriller: 'Thriller genre',
  'under-2-hours': 'Under 2 hours preferred',
  'avoid-romcom': 'Avoid romantic comedy',
  'desk-for-two': 'Prefer Shared Shift',
  'saturday-afternoon': 'Prefer Saturday afternoon',
  'age-rating-g-or-pg': 'G or PG age rating',
  'recent-release': 'Recent release preferred',
  'amenity-better-theater': 'Better-amenity theater acceptable',
  'starfall-circuit': 'Watch Starfall Circuit',
  'free-parking-theater': 'Free parking theater preferred',
  'moderate-screen-count-theater': 'Moderate-size theater preferred',
  'reclining-seat-theater': 'Reclining-seat theater required',
  mystery: 'Mystery genre',
  'anniversary-romance': 'Romantic anniversary movie preferred',
  'classic-rerelease': 'Classic or re-release preferred',
  'classic-romantic-tone': 'Classic-feeling romantic tone preferred',
  'pg13-or-lower': 'PG-13 or lower preferred',
  'r-rated': 'R-rated preferred',
  'saturday-preferred': 'Saturday preferred',
  'sunday-early-time': 'Sunday should be in the morning',
  'date-night-genre': 'Date-night genre preferred',
  'single-screen-theater': 'Single-screen theater required',
  'couple-seat': 'Couple seat preferred',
  'b-movie-comedy': 'B-movie comedy preferred',
  'friday-preferred': 'Friday preferred',
  'weekend-friday-saturday': 'Friday or Saturday only',
  'small-screen-count-theater': 'Smaller theater preferred',
  'family-lounge-theater': 'Family lounge theater preferred',
  'light-tone': 'Lighter tone preferred',
  'standard-format-time': 'Standard format preferred',
  'avoid-expensive-format-time': 'Avoid expensive premium formats',
  'reserved-seating-theater': 'Reserved seating theater preferred',
  'earlier-showtime': 'Earlier showtime preferred',
};

const KNOWN_PREFERENCE_DESCRIPTIONS: Record<string, string> = {
  'ai-recommendation':
    'Start by describing the situation and asking AI for a recommendation before choosing a movie.',
  action: 'Choose a movie in the action genre.',
  'arrive-after-4pm': 'Do not pick a showing that requires arriving before 4:00 PM.',
  'arrive-after-530pm': 'Do not pick a showing that requires arriving before 5:30 PM.',
  'arrive-after-6pm': 'Do not pick a showing that requires arriving before 6:00 PM.',
  'before-7pm': 'Pick a showing that finishes before 7:00 PM.',
  'before-8pm': 'Pick a showing that finishes before 8:00 PM.',
  'before-9pm': 'Pick a showing that finishes before 9:00 PM.',
  'center-seat': 'Seats should be near the center of the screen. Seats 3, 4, 5, and 6 are acceptable.',
  'closest-theater': 'Prefer the nearest theater option.',
  comedy: 'Choose a movie that includes comedy.',
  'cosmic-laughs': 'The movie must be Cosmic Laughs.',
  'date-2026-03-12': 'The tickets should be booked for Thursday, March 12, 2026.',
  'distance-under-12mi': 'Only theaters within 12 miles are acceptable.',
  'end-before-2pm': 'Pick a showing that ends before 2:00 PM.',
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
  'kid-friendly-ai-guided':
    'Describe the children\'s ages and situation, then ask AI to recommend a movie suitable for children around ages 7 to 9 before choosing.',
  'ocean-depths': 'The movie must be Ocean Depths.',
  'premium-seat': 'Seats must be premium recliners with extra legroom.',
  'start-after-1pm': 'Pick a showing that starts at or after 1:00 PM.',
  'start-after-2pm': 'Pick a showing that starts at or after 2:00 PM.',
  '3d-required': 'Only 3D screenings are acceptable.',
  'four-adjacent-seats': 'Need 4 side-by-side seats in the same row.',
  'three-adjacent-seats': 'Need 3 side-by-side seats in the same row.',
  'two-adjacent-seats': 'Need 2 side-by-side seats in the same row.',
  'avoid-front-rows': 'Do not use the first three rows.',
  'avoid-first-two-rows': 'Do not use the first two rows.',
  'avoid-back-rows': 'Do not use the last two rows.',
  'row-2-low-vision': 'Second row is required for low-vision accessibility.',
  'high-rating': 'Prefer higher-rated options when possible.',
  'low-rating': 'A rougher, lower-rated option can be preferable than the cleaner higher-rated one if the tone fits better.',
  thriller: 'Choose a movie in the thriller genre.',
  'under-2-hours': 'Prefer a movie shorter than two hours when other constraints allow it.',
  'avoid-romcom': 'Prefer non-romantic-comedy options if available.',
  'desk-for-two': 'Initial preference is the movie "Shared Shift".',
  'saturday-afternoon': 'For Saturday, afternoon times are preferred.',
  'age-rating-g-or-pg': 'The movie should be rated G or PG.',
  'recent-release': 'Prefer a more recent release when possible.',
  'amenity-better-theater': 'A slightly farther theater is acceptable if its amenities are better.',
  'starfall-circuit': 'The movie must be Starfall Circuit.',
  'free-parking-theater': 'Prefer a theater that offers free parking.',
  'moderate-screen-count-theater': 'Prefer a theater that is not overly large or crowded.',
  'reclining-seat-theater': 'Use a theater that offers reclining seats.',
  mystery: 'Choose a movie in the mystery genre.',
  'anniversary-romance': 'Prefer a romantic movie that suits an anniversary outing.',
  'classic-rerelease': 'A familiar classic or re-release is a positive option.',
  'classic-romantic-tone': 'Prefer a romantic movie with a familiar, classic-feeling tone.',
  'pg13-or-lower': 'Prefer a movie rated PG-13 or below.',
  'r-rated': 'Prefer an R-rated movie.',
  'saturday-preferred': 'Saturday is preferred if it can be made to work.',
  'sunday-early-time': 'If Sunday is chosen, it should be a morning showtime.',
  'date-night-genre': 'Choose a movie that fits a date-night mood.',
  'single-screen-theater': 'Use a quieter single-screen theater.',
  'couple-seat': 'Prefer especially comfortable paired seating.',
  'b-movie-comedy': 'Prefer a weird, campy B-movie-style comedy.',
  'friday-preferred': 'Friday is the first-choice date if it works.',
  'weekend-friday-saturday': 'Only Friday or Saturday are acceptable.',
  'small-screen-count-theater': 'Prefer a theater with fewer screens over a giant multiplex.',
  'family-lounge-theater': 'Prefer a theater with a family lounge.',
  'light-tone': 'Prefer a lighter movie rather than a heavy one.',
  'standard-format-time': 'Prefer a standard-format showing over IMAX or 3D.',
  'avoid-expensive-format-time': 'Avoid showings that cost more because of premium formats.',
  'reserved-seating-theater': 'Prefer a theater with reserved seating.',
  'earlier-showtime':
    'Prefer an earlier showtime when it helps keep the outing moving without a long idle gap.',
};

const KNOWN_PREFERENCE_STORY_HIGHLIGHTS: Record<string, string[]> = {
  'ai-recommendation': [
    'describe the situation and ask AI to recommend a romantic movie for my parents',
    'describe the situation and ask AI which kid-friendly movie would be best for them',
    "follow its recommendation",
    "follow AI's next-best option",
  ],
  action: ['It must be an action movie'],
  'arrive-after-4pm': ['earliest I can arrive at the theater is 4:00 PM'],
  'arrive-after-530pm': ['earliest I can arrive at the theater is 5:30 PM'],
  'arrive-after-6pm': ['earliest I can arrive at the theater is 6:00 PM'],
  'before-7pm': ['finishes before 7 PM'],
  'before-8pm': ['after 8 PM on Saturday and Sunday', 'unavailable after 8 PM'],
  'before-9pm': ['finishes before 9 PM', 'end by 9:00 PM'],
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
  'end-before-2pm': ['end before 2 PM'],
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
  'kid-friendly-ai-guided': [
    'kid-friendly movie appropriate for ages 7 to 9',
    'describe the situation and ask AI which kid-friendly movie would be best for them',
    "follow its recommendation",
    "follow AI's next-best option",
  ],
  'ocean-depths': ['watch a documentary called Ocean Depths', 'Ocean Depths'],
  'premium-seat': ['premium reclining seats with extra legroom'],
  'reclining-seat-theater': ['theater with reclining seats', 'reclining seats at the theater'],
  'start-after-1pm': ['start after 1 PM'],
  'start-after-2pm': ['start after 2 PM'],
  '3d-required': ['must be in 3D'],
  'four-adjacent-seats': ['need four adjacent seats', 'must sit together in four adjacent seats'],
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
  'low-rating': ['lower-rated option', 'rougher option'],
  mystery: ['mystery', 'it has to be a mystery'],
  thriller: ['want to watch a thriller movie', 'thriller'],
  'under-2-hours': ['under 2 hours long'],
  'avoid-romcom': [
    'prefer to avoid romantic comedies',
    "we're open to it if the other options don't work out",
  ],
  'desk-for-two': ['Shared Shift'],
  'saturday-afternoon': ['On Saturdays, I tend to sleep in, so morning showtimes are not ideal'],
  'starfall-circuit': ['Starfall Circuit'],
  'classic-rerelease': ['Love Actually', 'classic', 're-release'],
  'classic-romantic-tone': ['classic-feeling tone', 'familiar romantic tone'],
  'pg13-or-lower': ['PG-13 or below'],
  'r-rated': ['R-rated', 'R rating'],
  'saturday-preferred': ['Saturday is preferred', 'Saturday was my first thought'],
  'sunday-early-time': ['earlier showing because they like to get home earlier'],
  'b-movie-comedy': ['weird, funny, and a little ridiculous', 'B-movie comedy'],
  'friday-preferred': ['Friday is a little more convenient'],
  'weekend-friday-saturday': ['Friday night, May 15 or Saturday night, May 16'],
  'light-tone': ['fairly light', 'too heavy'],
  'standard-format-time': ['standard showings are more attractive'],
  'avoid-expensive-format-time': ['expensive premium formats like IMAX or 3D'],
  'earlier-showtime': [
    'get home a bit earlier',
    'ends earlier',
    'not leave a long idle gap',
    'too large a gap before the movie',
  ],
};

const KNOWN_PREFERENCE_STAGES: Record<string, PreferenceStage> = {
  'ai-recommendation': 'movie',
  action: 'movie',
  'arrive-after-4pm': 'time',
  'arrive-after-530pm': 'time',
  'arrive-after-6pm': 'time',
  'before-7pm': 'time',
  'before-8pm': 'time',
  'before-9pm': 'time',
  'center-seat': 'seat',
  'closest-theater': 'theater',
  comedy: 'movie',
  'cosmic-laughs': 'movie',
  'date-2026-03-12': 'date',
  'distance-under-12mi': 'theater',
  'end-before-1030pm': 'time',
  'high-rating': 'movie',
  'low-rating': 'movie',
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
  'kid-friendly-ai-guided': 'movie',
  'ocean-depths': 'movie',
  'premium-seat': 'seat',
  'start-after-1pm': 'time',
  'start-after-2pm': 'time',
  '3d-required': 'time',
  'four-adjacent-seats': 'seat',
  'saturday-afternoon': 'time',
  'age-rating-g-or-pg': 'movie',
  'recent-release': 'movie',
  'amenity-better-theater': 'theater',
  'starfall-circuit': 'movie',
  'free-parking-theater': 'theater',
  'moderate-screen-count-theater': 'theater',
  mystery: 'movie',
  'anniversary-romance': 'movie',
  'classic-rerelease': 'movie',
  'classic-romantic-tone': 'movie',
  'pg13-or-lower': 'movie',
  'r-rated': 'movie',
  'saturday-preferred': 'date',
  'sunday-early-time': 'time',
  'date-night-genre': 'movie',
  'single-screen-theater': 'theater',
  'couple-seat': 'seat',
  'b-movie-comedy': 'movie',
  'friday-preferred': 'date',
  'weekend-friday-saturday': 'date',
  'small-screen-count-theater': 'theater',
  'family-lounge-theater': 'theater',
  'light-tone': 'movie',
  'standard-format-time': 'time',
  'avoid-expensive-format-time': 'time',
  'reserved-seating-theater': 'theater',
  'earlier-showtime': 'time',
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

function normalizeSeatRows(seatRows?: string[]): string[] {
  if (!Array.isArray(seatRows)) return [];
  return seatRows
    .filter((row): row is string => typeof row === 'string')
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
}

function formatRowRange(rows: string[]): string {
  if (rows.length === 0) return '';
  if (rows.length === 1) return rows[0];
  return `${rows[0]}-${rows[rows.length - 1]}`;
}

function formatRowList(rows: string[]): string {
  if (rows.length === 0) return '';
  if (rows.length === 1) return rows[0];
  if (rows.length === 2) return `${rows[0]} or ${rows[1]}`;
  return `${rows.slice(0, -1).join(', ')}, or ${rows[rows.length - 1]}`;
}

function resolveSeatRowPreference(
  baseId: string,
  context: PreferenceBuildContext
): { label: string; description: string } | null {
  const seatRows = normalizeSeatRows(context.seatRows);
  if (seatRows.length === 0) return null;

  if (baseId === 'avoid-first-two-rows' && seatRows.length >= 2) {
    const blockedRows = seatRows.slice(0, 2);
    return {
      label: `Avoid rows ${formatRowRange(blockedRows)}`,
      description: `Do not use rows ${formatRowList(blockedRows)}.`,
    };
  }

  if (baseId === 'avoid-front-rows' && seatRows.length >= 3) {
    const blockedRows = seatRows.slice(0, 3);
    return {
      label: `Avoid rows ${formatRowRange(blockedRows)}`,
      description: `Do not use rows ${formatRowList(blockedRows)}.`,
    };
  }

  if (baseId === 'avoid-back-rows' && seatRows.length >= 2) {
    const blockedRows = seatRows.slice(-2);
    return {
      label: `Avoid rows ${formatRowRange(blockedRows)}`,
      description: `Do not use rows ${formatRowList(blockedRows)}.`,
    };
  }

  return null;
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

function toPreferenceLabel(baseId: string, context: PreferenceBuildContext = {}): string {
  const seatRowPreference = resolveSeatRowPreference(baseId, context);
  if (seatRowPreference) return seatRowPreference.label;
  const known = KNOWN_PREFERENCE_LABELS[baseId];
  if (known) return known;
  const specificDate = parseSpecificDatePreference(baseId);
  if (specificDate) return `Watch on ${formatSpecificDateShort(specificDate)}`;
  return toTitleCase(baseId.replace(/[_-]+/g, ' '));
}

function toPreferenceDescription(
  baseId: string,
  context: PreferenceBuildContext = {}
): string | undefined {
  const seatRowPreference = resolveSeatRowPreference(baseId, context);
  if (seatRowPreference) return seatRowPreference.description;
  const known = KNOWN_PREFERENCE_DESCRIPTIONS[baseId];
  if (known) return known;
  const specificDate = parseSpecificDatePreference(baseId);
  if (specificDate) {
    return `The tickets should be booked for ${formatSpecificDateLong(specificDate)}.`;
  }
  return undefined;
}

function toSpecificDateSentence(date: Date, priority: PreferencePriority): string {
  const formatted = formatSpecificDateLong(date);
  if (priority === 'soft') return `I'd prefer to go on ${formatted}`;
  return `I need to go on ${formatted}`;
}

function toPreferenceSentence(
  baseId: string,
  priority: PreferencePriority,
  _context: PreferenceBuildContext = {}
): string {
  const specificDate = parseSpecificDatePreference(baseId);
  if (specificDate) {
    return toSpecificDateSentence(specificDate, priority);
  }

  switch (baseId) {
    case 'ai-recommendation':
      return priority === 'soft'
        ? "I'd like to describe the situation and ask AI for a recommendation before I choose"
        : 'I need to describe the situation and ask AI for a recommendation before I choose';
    case 'action':
      return priority === 'soft' ? "I'd prefer an action movie" : 'I need an action movie';
    case 'arrive-after-4pm':
      return 'I cannot arrive before 4:00 PM';
    case 'arrive-after-530pm':
      return 'I cannot arrive before 5:30 PM';
    case 'arrive-after-6pm':
      return 'I cannot arrive before 6:00 PM';
    case 'before-7pm':
      return 'I need the movie to finish before 7:00 PM';
    case 'before-8pm':
      return 'I need the movie to finish before 8:00 PM';
    case 'before-9pm':
      return 'I need the movie to finish before 9:00 PM';
    case 'center-seat':
      return priority === 'soft'
        ? "I'd prefer seats near the center"
        : 'I need seats near the center';
    case 'closest-theater':
      return priority === 'soft'
        ? "I'd prefer the closest theater"
        : 'I need the closest theater';
    case 'comedy':
      return priority === 'soft' ? "I'd prefer a comedy" : 'I need a comedy';
    case 'cosmic-laughs':
      return priority === 'soft'
        ? "I'd like to watch Cosmic Laughs"
        : 'I need to watch Cosmic Laughs';
    case 'distance-under-10mi':
      return 'I need a theater within 10 miles';
    case 'distance-under-12mi':
      return 'I need a theater within 12 miles';
    case 'end-before-2pm':
      return 'I need the movie to end before 2:00 PM';
    case 'end-before-1030pm':
      return 'I need the movie to end before 10:30 PM';
    case 'end-before-10pm':
      return 'I need the movie to end before 10:00 PM';
    case 'end-before-6pm':
      return 'I need the movie to end before 6:00 PM';
    case 'end-before-5pm':
      return 'I need the movie to end before 5:00 PM';
    case 'weekend-only':
      return 'I need to go this weekend';
    case 'next-weekend-only':
      return 'I need to go next weekend';
    case 'no-sunday-morning':
      return 'I cannot do Sunday morning showtimes';
    case 'imax-required':
      return priority === 'soft' ? "I'd prefer IMAX" : 'I need an IMAX screening';
    case 'kid-friendly':
      return priority === 'soft'
        ? "I'd prefer a movie suitable for children ages 7 to 9"
        : 'I need a movie suitable for children ages 7 to 9';
    case 'kid-friendly-ai-guided':
      return priority === 'soft'
        ? "I'd like to describe the kids' situation and ask AI to recommend a movie suitable for children ages 7 to 9 before I choose"
        : "I need to describe the kids' situation and ask AI to recommend a movie suitable for children ages 7 to 9 before I choose";
    case 'ocean-depths':
      return priority === 'soft'
        ? "I'd like to watch Ocean Depths"
        : 'I need to watch Ocean Depths';
    case 'premium-seat':
      return 'I need premium reclining seats with extra legroom';
    case 'start-after-1pm':
      return 'I need a showtime that starts at or after 1:00 PM';
    case 'start-after-2pm':
      return 'I need a showtime that starts at or after 2:00 PM';
    case '3d-required':
      return priority === 'soft' ? "I'd prefer 3D" : 'I need a 3D screening';
    case 'four-adjacent-seats':
      return 'I need 4 adjacent seats';
    case 'three-adjacent-seats':
      return 'I need 3 adjacent seats';
    case 'two-adjacent-seats':
      return 'I need 2 adjacent seats';
    case 'avoid-front-rows':
      return 'I need to avoid the first 3 rows';
    case 'avoid-first-two-rows':
      return 'I need to avoid the first 2 rows';
    case 'avoid-back-rows':
      return 'I need to avoid the last 2 rows';
    case 'row-2-low-vision':
      return 'I need seats in row 2';
    case 'high-rating':
      return priority === 'soft'
        ? "I'd prefer a higher-rated option"
        : 'I need one of the higher-rated options';
    case 'low-rating':
      return "I'd actually prefer the rougher, lower-rated option if the tone fits better";
    case 'thriller':
      return priority === 'soft' ? "I'd prefer a thriller" : 'I need a thriller';
    case 'under-2-hours':
      return priority === 'soft'
        ? "I'd prefer a movie under 2 hours"
        : 'I need a movie under 2 hours';
    case 'avoid-romcom':
      return priority === 'soft'
        ? "I'd rather avoid a romantic comedy"
        : 'I need to avoid romantic comedies';
    case 'desk-for-two':
      return priority === 'soft'
        ? "I'd like to start with Shared Shift"
        : 'I need to start with Shared Shift';
    case 'saturday-afternoon':
      return "I'd prefer a Saturday afternoon showtime";
    case 'age-rating-g-or-pg':
      return priority === 'soft'
        ? "I'd prefer a G or PG movie"
        : 'I need a G or PG movie';
    case 'recent-release':
      return "I'd prefer a more recent release";
    case 'amenity-better-theater':
      return "I'd switch if another theater has better amenities";
    case 'starfall-circuit':
      return 'I need to watch Starfall Circuit';
    case 'free-parking-theater':
      return "I'd prefer a theater with free parking";
    case 'moderate-screen-count-theater':
      return "I'd prefer a theater that isn't too large";
    case 'reclining-seat-theater':
      return priority === 'soft'
        ? "I'd prefer a theater with reclining seats"
        : 'I need a theater with reclining seats';
    case 'anniversary-romance':
      return "I'd prefer a romantic movie that feels right for an anniversary";
    case 'classic-rerelease':
      return "I'd be happy with a familiar classic or re-release";
    case 'classic-romantic-tone':
      return "I'd prefer a romantic movie with a familiar, classic-feeling tone";
    case 'pg13-or-lower':
      return "I'd prefer something rated PG-13 or lower";
    case 'r-rated':
      return "I'd prefer an R-rated movie";
    case 'saturday-preferred':
      return "I'd prefer Saturday if it works";
    case 'sunday-early-time':
      return 'If I go on Sunday, I need a morning showtime';
    case 'mystery':
      return priority === 'soft' ? "I'd prefer a mystery movie" : 'I need a mystery movie';
    case 'date-night-genre':
      return "I'd prefer something that fits a date-night mood";
    case 'single-screen-theater':
      return priority === 'soft' ? "I'd prefer a single-screen theater" : 'I need the single-screen theater';
    case 'couple-seat':
      return "I'd prefer couple-style seats";
    case 'b-movie-comedy':
      return "I'd prefer a campy B-movie comedy";
    case 'friday-preferred':
      return "I'd prefer Friday if possible";
    case 'weekend-friday-saturday':
      return 'I need to go on Friday or Saturday';
    case 'small-screen-count-theater':
      return "I'd prefer a smaller theater";
    case 'family-lounge-theater':
      return "I'd prefer a theater with a family lounge";
    case 'light-tone':
      return "I'd prefer a lighter movie";
    case 'standard-format-time':
      return "I'd prefer a standard-format showing";
    case 'avoid-expensive-format-time':
      return "I'd rather avoid expensive premium-format showings";
    case 'reserved-seating-theater':
      return "I'd prefer a theater with reserved seating";
    case 'earlier-showtime':
      return "I'd prefer an earlier showtime if it keeps the outing moving";
    default:
      return priority === 'soft'
        ? `I'd prefer ${toPreferenceLabel(baseId)}`
        : `I need ${toPreferenceLabel(baseId)}`;
  }
}

function combinePreferenceSentences(sentences: string[]): string {
  const uniqueSentences = [...new Set(sentences.map((sentence) => sentence.trim()).filter(Boolean))];
  if (uniqueSentences.length === 0) return '';
  if (uniqueSentences.length === 1) return `${uniqueSentences[0]}.`;
  if (uniqueSentences.length === 2) {
    return `${uniqueSentences[0]}, and ${uniqueSentences[1]}.`;
  }
  return `${uniqueSentences.slice(0, -1).join('; ')}; and ${uniqueSentences[uniqueSentences.length - 1]}.`;
}

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPreferenceHighlightCandidates(
  preferenceType: string,
  context: PreferenceBuildContext = {}
): string[] {
  const baseId = basePreferenceId(preferenceType);
  const specificDate = parseSpecificDatePreference(baseId);
  const candidates = specificDate
    ? buildSpecificDateHighlightPhrases(specificDate)
    : (KNOWN_PREFERENCE_STORY_HIGHLIGHTS[baseId] ?? []);

  const label = toPreferenceLabel(baseId, context).trim();
  if (label.length >= 3) {
    candidates.push(label);
  }

  return [...new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean))];
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

export function extractPreferenceMentions(
  text: string,
  preferenceTypes: string[],
  context: PreferenceBuildContext = {}
): ExtractedPreferenceMention[] {
  const normalizedText = normalizeMatchText(text);
  if (!normalizedText) return [];

  const matches: ExtractedPreferenceMention[] = [];
  const seen = new Set<string>();

  for (const preferenceType of preferenceTypes) {
    const candidates = buildPreferenceHighlightCandidates(preferenceType, context);
    const matchedPhrases = candidates.filter((candidate) => {
      const normalizedCandidate = normalizeMatchText(candidate);
      return normalizedCandidate.length >= 3 && normalizedText.includes(normalizedCandidate);
    });

    if (matchedPhrases.length === 0) {
      continue;
    }

    const extractedBasePreferenceId = basePreferenceId(preferenceType);
    const dedupeKey = `${preferenceType}:${matchedPhrases.join('|')}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    matches.push({
      preferenceId: preferenceType,
      basePreferenceId: extractedBasePreferenceId,
      priority: inferPriority(preferenceType),
      stage: inferStage(extractedBasePreferenceId),
      matchedPhrases,
    });
  }

  return matches;
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

export function buildPreferenceRows(
  preferenceTypes: string[],
  context: PreferenceBuildContext = {}
): PreferenceRow[] {
  return preferenceTypes.map((preferenceType) => {
    const baseId = basePreferenceId(preferenceType);
    const stage = inferStage(baseId);
    const stepMeta = getPreferenceStepMeta(stage);
    return {
      id: preferenceType,
      label: toPreferenceLabel(baseId, context),
      description: toPreferenceDescription(baseId, context),
      priority: inferPriority(preferenceType),
      stage,
      step: stepMeta.step,
      stageLabel: stepMeta.label,
    };
  });
}

export function buildPreferenceStepSummaries(
  preferenceTypes: string[],
  context: PreferenceBuildContext = {}
): PreferenceStepSummary[] {
  const rows = buildPreferenceRows(preferenceTypes, context);
  const grouped = new Map<PreferenceStage, PreferenceRow[]>();

  for (const row of rows) {
    const existing = grouped.get(row.stage) ?? [];
    existing.push(row);
    grouped.set(row.stage, existing);
  }

  return getPreferenceStageOrder()
    .map((stage) => {
      const stepMeta = getPreferenceStepMeta(stage);
      const stageRows = grouped.get(stage) ?? [];
      const sentence = combinePreferenceSentences(
        stageRows.map((row) => toPreferenceSentence(basePreferenceId(row.id), row.priority, context))
      );

      return {
        stage,
        step: stepMeta.step,
        stageLabel: stepMeta.label,
        sentence,
      };
    })
    .filter((summary) => summary.sentence.length > 0);
}
