const DURATION_TEXT_PATTERN = /^(?:(\d+)h(?:\s+(\d+)m)?|(\d+)m)$/i;

export function formatDurationMinutes(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new Error(`Invalid duration minutes: ${minutes}`);
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) return `${remainingMinutes}m`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

export function parseDurationText(value: string): number | null {
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

export function normalizeDurationText(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value <= 0) return null;
    return formatDurationMinutes(value);
  }

  if (typeof value !== 'string') return null;
  const minutes = parseDurationText(value);
  return minutes === null ? null : formatDurationMinutes(minutes);
}
