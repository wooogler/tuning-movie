/**
 * Spec Generator Functions
 *
 * 각 Stage별 UISpec 생성 함수
 * 백엔드 데이터를 받아 Agent가 읽을 수 있는 UISpec으로 변환
 */

import type { UISpec, DataItem } from './types';
import type {
  Movie,
  Theater,
  Showing,
  Seat,
  TicketType,
} from '../types';

// =============================================================================
// Movie Stage
// =============================================================================

export interface MovieItem extends DataItem {
  id: string;
  title: string;
  genre: string[];
  rating: string;
  duration: number;
  posterUrl?: string;
}

export function generateMovieSpec(
  movies: Movie[],
  selectedId?: string
): UISpec<MovieItem> {
  const items: MovieItem[] = movies.map((m) => ({
    id: m.id,
    title: m.title,
    genre: m.genre,
    rating: m.rating,
    duration: m.duration,
    posterUrl: m.posterUrl,
  }));

  return {
    stage: 'movie',
    items,
    state: { selectedId },
    modification: {},
  };
}

// =============================================================================
// Theater Stage
// =============================================================================

export interface TheaterItem extends DataItem {
  id: string;
  name: string;
  location: string;
}

export function generateTheaterSpec(
  theaters: Theater[],
  movieId: string,
  selectedId?: string
): UISpec<TheaterItem> {
  const items: TheaterItem[] = theaters.map((t) => ({
    id: t.id,
    name: t.name,
    location: t.location,
  }));

  return {
    stage: 'theater',
    items,
    state: { selectedId },
    modification: {},
    meta: { movieId },
  };
}

// =============================================================================
// Date Stage
// =============================================================================

export interface DateItem extends DataItem {
  id: string;
  date: string;
  dayOfWeek: string;
  available: boolean;
}

export function generateDateSpec(
  dates: DateItem[],
  movieId: string,
  theaterId: string,
  selectedId?: string
): UISpec<DateItem> {
  return {
    stage: 'date',
    items: dates,
    state: { selectedId },
    modification: {},
    meta: { movieId, theaterId },
  };
}

/**
 * 날짜 범위에서 DateItem 배열 생성 (헬퍼 함수)
 */
export function createDateItems(
  startDate: Date,
  days: number,
  availableDates?: string[]
): DateItem[] {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const items: DateItem[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    items.push({
      id: dateStr,
      date: dateStr,
      dayOfWeek: dayNames[date.getDay()],
      available: availableDates ? availableDates.includes(dateStr) : true,
    });
  }

  return items;
}

// =============================================================================
// Time Stage
// =============================================================================

export interface TimeItem extends DataItem {
  id: string;
  time: string;
  availableSeats: number;
  totalSeats: number;
}

export function generateTimeSpec(
  showings: Showing[],
  movieId: string,
  theaterId: string,
  date: string,
  selectedId?: string
): UISpec<TimeItem> {
  const items: TimeItem[] = showings.map((s) => ({
    id: s.id,
    time: s.time,
    availableSeats: s.availableSeats,
    totalSeats: s.totalSeats,
  }));

  return {
    stage: 'time',
    items,
    state: { selectedId },
    modification: {},
    meta: { movieId, theaterId, date },
  };
}

// =============================================================================
// Seat Stage
// =============================================================================

export interface SeatItem extends DataItem {
  id: string;
  row: string;
  number: number;
  status: 'available' | 'occupied';
}

export function generateSeatSpec(
  seats: Seat[],
  movieId: string,
  theaterId: string,
  date: string,
  showtimeId: string,
  selectedIds?: string[]
): UISpec<SeatItem> {
  // standard 좌석만 사용, premium 없음
  const items: SeatItem[] = seats
    .filter((s) => s.type === 'standard')
    .map((s) => ({
      id: s.id,
      row: s.row,
      number: s.number,
      status: s.status === 'available' ? 'available' : 'occupied',
    }));

  // 좌석 배치 정보 계산
  const rows = [...new Set(items.map((s) => s.row))].sort();
  const seatsPerRow = Math.max(...items.map((s) => s.number));

  return {
    stage: 'seat',
    items,
    state: { selectedIds: selectedIds ?? [] },
    modification: {},
    meta: {
      movieId,
      theaterId,
      date,
      showtimeId,
      rows,
      seatsPerRow,
    },
  };
}

// =============================================================================
// Ticket Stage
// =============================================================================

export interface TicketItem extends DataItem {
  id: string;
  name: string;
  price: number;
  description?: string;
}

export function generateTicketSpec(
  ticketTypes: TicketType[],
  selectedSeats: string[],
  quantities?: Record<string, number>
): UISpec<TicketItem> {
  const items: TicketItem[] = ticketTypes.map((t) => ({
    id: t.id,
    name: t.name,
    price: t.price,
    description: t.description,
  }));

  // 기본 수량 초기화 (모두 0)
  const defaultQuantities: Record<string, number> = {};
  ticketTypes.forEach((t) => {
    defaultQuantities[t.id] = 0;
  });

  return {
    stage: 'ticket',
    items,
    state: { quantities: quantities ?? defaultQuantities },
    modification: {},
    meta: {
      maxTotal: selectedSeats.length,
      selectedSeats,
    },
  };
}

// =============================================================================
// Confirm Stage
// =============================================================================

export interface ConfirmMeta {
  movie: { id: string; title: string };
  theater: { id: string; name: string };
  date: string;
  time: string;
  seats: string[];
  tickets: Array<{ type: string; quantity: number; price: number }>;
  totalPrice: number;
}

export function generateConfirmSpec(meta: ConfirmMeta): UISpec {
  return {
    stage: 'confirm',
    items: [],
    state: {},
    modification: {},
    meta,
  };
}
