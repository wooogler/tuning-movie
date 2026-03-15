export function parseDurationMinutes(duration: string): number | null {
  const match = duration.match(/(?:(\d+)h)?\s*(?:(\d+)m)?/);
  if (!match) return null;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const total = hours * 60 + minutes;
  return total > 0 ? total : null;
}

function computeEndTime(startTime: string, durationMinutes: number): string | null {
  const match = startTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const totalMin = parseInt(match[1], 10) * 60 + parseInt(match[2], 10) + durationMinutes;
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  const displayH = endH % 12 || 12;
  const amPm = endH < 12 ? 'AM' : 'PM';
  return `${displayH}:${String(endM).padStart(2, '0')} ${amPm}`;
}

export function addEndTimeToItems<T extends Record<string, unknown>>(
  items: T[],
  durationMinutes: number
): T[] {
  return items.map((item) => {
    const time = typeof item.time === 'string' ? item.time.trim() : null;
    if (!time) return item;
    const match = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return item;
    const totalMin = parseInt(match[1], 10) * 60 + parseInt(match[2], 10) + durationMinutes;
    const endH = Math.floor(totalMin / 60) % 24;
    const endM = totalMin % 60;
    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    const displayH = endH % 12 || 12;
    const amPm = endH < 12 ? 'AM' : 'PM';
    const displayEndTime = `${displayH}:${String(endM).padStart(2, '0')} ${amPm}`;
    return { ...item, endTime, displayEndTime };
  });
}

export function buildEndTimeMap(
  items: Record<string, unknown>[],
  durationMinutes: number
): Record<string, string> | null {
  const map: Record<string, string> = {};
  for (const item of items) {
    const id = typeof item.id === 'string' ? item.id : null;
    const time = typeof item.time === 'string' ? item.time.trim() : null;
    if (!id || !time) continue;
    const end = computeEndTime(time, durationMinutes);
    if (end) map[id] = end;
  }
  return Object.keys(map).length > 0 ? map : null;
}
