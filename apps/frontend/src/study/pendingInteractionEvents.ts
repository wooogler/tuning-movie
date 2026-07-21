export interface PendingStudyLogEventInput {
  type: string;
  payload: unknown;
  clientTimestamp?: string;
}

const PENDING_STUDY_LOG_EVENTS_KEY = 'tuning-movie-pending-study-log-events';

function readPendingEvents(): PendingStudyLogEventInput[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.sessionStorage.getItem(PENDING_STUDY_LOG_EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingStudyLogEventInput[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingEvents(events: PendingStudyLogEventInput[]): void {
  if (typeof window === 'undefined') return;

  try {
    if (events.length === 0) {
      window.sessionStorage.removeItem(PENDING_STUDY_LOG_EVENTS_KEY);
      return;
    }
    window.sessionStorage.setItem(PENDING_STUDY_LOG_EVENTS_KEY, JSON.stringify(events));
  } catch {
    // Ignore storage failures.
  }
}

export function queuePendingStudyLogEvent(event: PendingStudyLogEventInput): void {
  const events = readPendingEvents();
  events.push(event);
  writePendingEvents(events);
}

export function consumePendingStudyLogEvents(): PendingStudyLogEventInput[] {
  const events = readPendingEvents();
  writePendingEvents([]);
  return events;
}
