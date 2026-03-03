export type PreferencePriority = 'hard' | 'soft' | 'unknown';

export interface PreferenceRow {
  id: string;
  label: string;
  priority: PreferencePriority;
}

const KNOWN_PREFERENCE_LABELS: Record<string, string> = {
  comedy: 'Comedy genre',
  'weekend-only': 'Weekend only',
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

export function buildPreferenceRows(preferenceTypes: string[]): PreferenceRow[] {
  return preferenceTypes.map((preferenceType) => {
    const baseId = basePreferenceId(preferenceType);
    return {
      id: preferenceType,
      label: toPreferenceLabel(baseId),
      priority: inferPriority(preferenceType),
    };
  });
}
