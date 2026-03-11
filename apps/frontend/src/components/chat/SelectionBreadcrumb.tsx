import { Fragment } from 'react';
import type { BookingContext, UISpec } from '../../spec';
import { formatTime12Hour } from '../../utils/displayFormats';

interface SelectionBreadcrumbProps {
  spec: UISpec;
  subdued?: boolean;
}

interface BreadcrumbSegment {
  key: string;
  label: string;
  value: string;
}

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

function getBooking(spec: UISpec): BookingContext {
  return spec.state.booking ?? {};
}

function getMovieValue(booking: BookingContext, meta: Record<string, unknown> | null) {
  return booking.movie?.title ?? getMetaMovieTitle(meta);
}

function getTheaterValue(booking: BookingContext, meta: Record<string, unknown> | null) {
  return booking.theater?.name ?? getMetaTheaterName(meta);
}

function getDateValue(booking: BookingContext, meta: Record<string, unknown> | null) {
  const rawDate = booking.date ?? readString(meta?.date);
  return rawDate ? formatShortDate(rawDate) : undefined;
}

function getTimeValue(booking: BookingContext, meta: Record<string, unknown> | null) {
  const rawTime = booking.showing?.time ?? readString(meta?.time);
  return rawTime ? formatCompactTime(rawTime) : undefined;
}

function getSeatValues(booking: BookingContext, meta: Record<string, unknown> | null) {
  const values = (booking.selectedSeats ?? [])
    .map((seat) => formatSeatLabel(seat.value))
    .filter(Boolean);

  if (values.length > 0) return values;
  return getMetaSeats(meta).map(formatSeatLabel).filter(Boolean);
}

function buildSegments(spec: UISpec): BreadcrumbSegment[] {
  const booking = getBooking(spec);
  const meta = getMetaRecord(spec);
  const segments: BreadcrumbSegment[] = [];

  const movie = getMovieValue(booking, meta);
  if (movie) {
    segments.push({ key: 'movie', label: 'Movie', value: movie });
  }

  const theater = getTheaterValue(booking, meta);
  if (theater) {
    segments.push({ key: 'theater', label: 'Theater', value: theater });
  }

  const date = getDateValue(booking, meta);
  if (date) {
    segments.push({ key: 'date', label: 'Date', value: date });
  }

  const time = getTimeValue(booking, meta);
  if (time) {
    segments.push({ key: 'time', label: 'ShowTime', value: time });
  }

  const seatValues = getSeatValues(booking, meta);
  if (seatValues.length > 0) {
    segments.push({ key: 'seat', label: 'Seat', value: seatValues.join(', ') });
  }

  return segments;
}

export function SelectionBreadcrumb({ spec, subdued = false }: SelectionBreadcrumbProps) {
  const segments = buildSegments(spec);

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
                subdued
                  ? 'bg-dark-border/50 text-fg-faint'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              {segment.label}
            </span>
            <span className={`font-medium ${subdued ? 'text-fg-muted' : 'text-fg-strong'}`}>
              {segment.value}
            </span>
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
