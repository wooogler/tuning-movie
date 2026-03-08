const TWENTY_FOUR_HOUR_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TWELVE_HOUR_TIME_PATTERN = /^(1[0-2]|[1-9]):([0-5]\d)\s*([AaPp][Mm])$/;
const DURATION_TEXT_PATTERN = /^(?:(\d+)h(?:\s+(\d+)m)?|(\d+)m)$/i;

export function formatTime12Hour(value: string): string {
  const normalized = value.trim();
  if (!normalized) return value;

  const alreadyFormatted = normalized.match(TWELVE_HOUR_TIME_PATTERN);
  if (alreadyFormatted) {
    return `${alreadyFormatted[1]}:${alreadyFormatted[2]} ${alreadyFormatted[3].toUpperCase()}`;
  }

  const match = normalized.match(TWENTY_FOUR_HOUR_TIME_PATTERN);
  if (!match) return normalized;

  const hours24 = Number.parseInt(match[1], 10);
  const minutes = match[2];
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${meridiem}`;
}

export function parseTimeToMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;

  const twentyFourHourMatch = normalized.match(TWENTY_FOUR_HOUR_TIME_PATTERN);
  if (twentyFourHourMatch) {
    const hours = Number.parseInt(twentyFourHourMatch[1], 10);
    const minutes = Number.parseInt(twentyFourHourMatch[2], 10);
    return hours * 60 + minutes;
  }

  const twelveHourMatch = normalized.match(TWELVE_HOUR_TIME_PATTERN);
  if (!twelveHourMatch) return null;

  const hours = Number.parseInt(twelveHourMatch[1], 10) % 12;
  const minutes = Number.parseInt(twelveHourMatch[2], 10);
  const meridiem = twelveHourMatch[3].toUpperCase();
  return (meridiem === 'PM' ? hours + 12 : hours) * 60 + minutes;
}

export function parseDurationToMinutes(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;

  if (/^\d+$/.test(normalized)) {
    const minutes = Number.parseInt(normalized, 10);
    return Number.isInteger(minutes) && minutes > 0 ? minutes : null;
  }

  const match = normalized.match(DURATION_TEXT_PATTERN);
  if (!match) return null;

  if (match[3]) {
    const minutesOnly = Number.parseInt(match[3], 10);
    return Number.isInteger(minutesOnly) && minutesOnly > 0 ? minutesOnly : null;
  }

  const hours = Number.parseInt(match[1] ?? '0', 10);
  const minutes = Number.parseInt(match[2] ?? '0', 10);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours <= 0 && minutes <= 0) return null;
  if (minutes >= 60) return null;
  return hours * 60 + minutes;
}
