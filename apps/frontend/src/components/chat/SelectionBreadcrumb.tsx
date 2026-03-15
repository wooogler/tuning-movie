import { Fragment } from 'react';
import type { Stage, UISpec, WorkflowSelectionState } from '../../spec';
import { formatTime12Hour } from '../../utils/displayFormats';

interface SelectionBreadcrumbProps {
  spec: UISpec;
  stage?: Stage;
  subdued?: boolean;
}

interface BreadcrumbSegment {
  key: string;
  label: string;
  value?: string;
  active?: boolean;
}

const STAGE_LABEL: Record<Stage, string> = {
  movie: 'Movie',
  theater: 'Theater',
  date: 'Date',
  time: 'ShowTime',
  seat: 'Seat',
  confirm: 'Confirm',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getMetaRecord(spec: UISpec): Record<string, unknown> | null {
  return isRecord(spec.meta) ? spec.meta : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function formatShortDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value.trim();
  return `${Number.parseInt(match[2], 10)}/${Number.parseInt(match[3], 10)}`;
}

function formatCompactTime(value: string): string {
  return formatTime12Hour(value).replace(/\s+([AP]M)$/i, '$1');
}

function formatSeatLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.split(' - ')[0]?.trim() || trimmed;
}

function getMetaMovieTitle(meta: Record<string, unknown> | null): string | undefined {
  const movie = meta?.movie;
  return isRecord(movie) ? readString(movie.title) : undefined;
}

function getMetaTheaterName(meta: Record<string, unknown> | null): string | undefined {
  const theater = meta?.theater;
  return isRecord(theater) ? readString(theater.name) : undefined;
}

function getMetaSeats(meta: Record<string, unknown> | null): string[] {
  const seats = meta?.seats;
  if (!Array.isArray(seats)) return [];
  return seats
    .map((seat) => readString(seat))
    .filter((seat): seat is string => Boolean(seat));
}

type LegacyWorkflowSelectionState = WorkflowSelectionState & {
  date?: WorkflowSelectionState['date'] | string;
  selectedSeats?: WorkflowSelectionState['seats'];
};

function normalizeLegacyWorkflow(legacyWorkflow: LegacyWorkflowSelectionState): WorkflowSelectionState {
  const normalizedDate =
    typeof legacyWorkflow.date === 'string'
      ? { id: legacyWorkflow.date, date: legacyWorkflow.date }
      : legacyWorkflow.date;

  const normalizedSeats = (legacyWorkflow.seats ?? legacyWorkflow.selectedSeats ?? [])
    .map((seat) => {
      if (!isRecord(seat)) return null;
      const id = readString(seat.id);
      if (!id) return null;
      const label = readString(seat.label) ?? readString(seat.value);

      return {
        id,
        ...(label ? { label } : {}),
      };
    })
    .filter((seat): seat is NonNullable<WorkflowSelectionState['seats']>[number] => Boolean(seat));

  return {
    ...legacyWorkflow,
    ...(normalizedDate ? { date: normalizedDate } : {}),
    ...(normalizedSeats.length > 0 ? { seats: normalizedSeats } : {}),
  };
}

function getWorkflow(spec: UISpec): WorkflowSelectionState {
  if (spec.state.workflow) {
    return spec.state.workflow;
  }

  const legacyWorkflow = spec.state.booking as LegacyWorkflowSelectionState | undefined;
  if (!legacyWorkflow) {
    return {};
  }

  return normalizeLegacyWorkflow(legacyWorkflow);
}

function getMovieValue(workflow: WorkflowSelectionState, meta: Record<string, unknown> | null) {
  return workflow.movie?.title ?? getMetaMovieTitle(meta);
}

function getTheaterValue(workflow: WorkflowSelectionState, meta: Record<string, unknown> | null) {
  return workflow.theater?.name ?? getMetaTheaterName(meta);
}

function getDateValue(workflow: WorkflowSelectionState, meta: Record<string, unknown> | null) {
  const rawDate = workflow.date?.date ?? workflow.date?.id ?? readString(meta?.date);
  return rawDate ? formatShortDate(rawDate) : undefined;
}

function getTimeValue(workflow: WorkflowSelectionState, meta: Record<string, unknown> | null) {
  const rawTime = workflow.showing?.displayTime ?? workflow.showing?.time ?? readString(meta?.time);
  return rawTime ? formatCompactTime(rawTime) : undefined;
}

function getSeatValues(workflow: WorkflowSelectionState, meta: Record<string, unknown> | null) {
  const values = (workflow.seats ?? [])
    .map((seat) => formatSeatLabel(typeof seat.label === 'string' ? seat.label : seat.id))
    .filter(Boolean);

  if (values.length > 0) return values;
  return getMetaSeats(meta).map(formatSeatLabel).filter(Boolean);
}

function buildSegments(spec: UISpec, stage?: Stage): BreadcrumbSegment[] {
  const workflow = getWorkflow(spec);
  const meta = getMetaRecord(spec);
  const segments: BreadcrumbSegment[] = [];

  const movie = getMovieValue(workflow, meta);
  if (movie) {
    segments.push({ key: 'movie', label: 'Movie', value: movie });
  }

  const theater = getTheaterValue(workflow, meta);
  if (theater) {
    segments.push({ key: 'theater', label: 'Theater', value: theater });
  }

  const date = getDateValue(workflow, meta);
  if (date) {
    segments.push({ key: 'date', label: 'Date', value: date });
  }

  const time = getTimeValue(workflow, meta);
  if (time) {
    segments.push({ key: 'time', label: 'ShowTime', value: time });
  }

  const seatValues = getSeatValues(workflow, meta);
  if (seatValues.length > 0) {
    segments.push({ key: 'seat', label: 'Seat', value: seatValues.join(', ') });
  }

  if (stage) {
    const existing = segments.find((s) => s.key === stage);
    if (existing) {
      existing.active = true;
    } else {
      segments.push({ key: stage, label: STAGE_LABEL[stage], active: true });
    }
  }

  return segments;
}

export function SelectionBreadcrumb({ spec, stage, subdued = false }: SelectionBreadcrumbProps) {
  const segments = buildSegments(spec, stage);

  if (segments.length === 0) return null;

  return (
    <div
      className={`mb-2 rounded-xl border px-3 py-2 ${
        subdued
          ? 'border-dark-border bg-dark-light/45'
          : 'border-primary/25 bg-dark-light/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] leading-4">
      {segments.map((segment, index) => (
        <Fragment key={segment.key}>
          <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
            <span
              className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                segment.active && !subdued
                  ? 'bg-primary text-primary-fg'
                  : subdued
                    ? 'bg-dark-border/50 text-fg-faint'
                    : 'bg-primary/10 text-primary'
              }`}
            >
              {segment.label}
            </span>
            {segment.value ? (
              <span className={`font-medium ${subdued ? 'text-fg-muted' : 'text-fg-strong'}`}>
                {segment.value}
              </span>
            ) : null}
          </span>
          {index < segments.length - 1 ? (
            <span className={subdued ? 'text-fg-faint/60' : 'text-primary/55'}>{'>'}</span>
          ) : null}
        </Fragment>
      ))}
      </div>
    </div>
  );
}
