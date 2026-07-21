const DEFAULT_FIXED_CURRENT_DATE = '2026-03-11';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toIsoDateString(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseFixedDate(dateString: string): Date | null {
  if (!DATE_PATTERN.test(dateString)) return null;

  const [yearStr, monthStr, dayStr] = dateString.split('-');
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

const configuredDate = (process.env.FIXED_CURRENT_DATE ?? DEFAULT_FIXED_CURRENT_DATE).trim();
const parsedConfiguredDate = parseFixedDate(configuredDate);
const fallbackDate = parseFixedDate(DEFAULT_FIXED_CURRENT_DATE);

if (!fallbackDate) {
  throw new Error(`Invalid DEFAULT_FIXED_CURRENT_DATE: ${DEFAULT_FIXED_CURRENT_DATE}`);
}

const fixedCurrentDate = parsedConfiguredDate ?? fallbackDate;

export const FIXED_CURRENT_DATE = toIsoDateString(
  fixedCurrentDate.getUTCFullYear(),
  fixedCurrentDate.getUTCMonth() + 1,
  fixedCurrentDate.getUTCDate()
);

export function getFixedCurrentDateUtc(): Date {
  return new Date(fixedCurrentDate.getTime());
}
