/**
 * Spec Generator Functions
 *
 * 각 Stage별 UISpec 생성 함수
 * 백엔드 데이터를 받아 Agent가 읽을 수 있는 UISpec으로 변환
 */

import type { UISpec, DataItem, StateModel, QuantityItem } from './types';
import type { Movie, Theater, Showing, Seat, TicketType } from '../types';
import { computeVisibleItems } from './modifiers';

// =============================================================================
// Helper: Create Spec
// =============================================================================

/**
 * UISpec 생성 헬퍼
 */
function createSpec<T extends DataItem>(
  base: Omit<UISpec<T>, 'visibleItems' | 'state'> & { initialState?: Partial<StateModel> }
): UISpec<T> {
  // visibleItems 계산
  const tempSpec = { ...base, visibleItems: [], state: {} } as UISpec<T>;
  const visibleItems = computeVisibleItems(tempSpec);

  // 초기 state 생성
  const state: StateModel = base.initialState ?? {};

  return {
    stage: base.stage,
    title: base.title,
    description: base.description,
    visibleItems,
    state,
    items: base.items,
    modification: base.modification,
    display: base.display,
    meta: base.meta,
  };
}

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

export function generateMovieSpec(movies: Movie[]): UISpec<MovieItem> {
  const items: MovieItem[] = movies.map((m) => ({
    id: m.id,
    title: m.title,
    genre: m.genre,
    rating: m.rating,
    duration: m.duration,
    posterUrl: m.posterUrl,
  }));

  return createSpec({
    stage: 'movie',
    title: 'Select Movie',
    description: 'Choose a movie you want to watch',
    items,
    modification: {},
    display: {
      valueField: 'title',
      component: 'buttonGroup',
    },
  });
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
  movieId: string
): UISpec<TheaterItem> {
  const items: TheaterItem[] = theaters.map((t) => ({
    id: t.id,
    name: t.name,
    location: t.location,
  }));

  return createSpec({
    stage: 'theater',
    title: 'Select Theater',
    description: 'Choose a theater near you',
    items,
    modification: {},
    display: {
      valueField: 'name',
      component: 'buttonGroup',
    },
    meta: { movieId },
  });
}

// =============================================================================
// Date Stage
// =============================================================================

export interface DateItem extends DataItem {
  id: string;
  date: string;
  dayOfWeek: string;
  displayText: string;
  available: boolean;
}

export function generateDateSpec(
  dates: DateItem[],
  movieId: string,
  theaterId: string
): UISpec<DateItem> {
  return createSpec({
    stage: 'date',
    title: 'Select Date',
    description: 'Pick a date for your movie',
    items: dates,
    modification: {},
    display: {
      valueField: 'displayText',
      component: 'calendar',
    },
    meta: { movieId, theaterId },
  });
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
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const items: DateItem[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = dayNames[date.getDay()];
    const month = monthNames[date.getMonth()];
    const day = date.getDate();

    items.push({
      id: dateStr,
      date: dateStr,
      dayOfWeek,
      displayText: `${month} ${day} (${dayOfWeek})`,
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
  date: string
): UISpec<TimeItem> {
  const items: TimeItem[] = showings.map((s) => ({
    id: s.id,
    time: s.time,
    availableSeats: s.availableSeats,
    totalSeats: s.totalSeats,
  }));

  return createSpec({
    stage: 'time',
    title: 'Select Time',
    description: 'Choose a showtime',
    items,
    modification: {},
    display: {
      valueField: 'time',
      component: 'buttonGroup',
    },
    meta: { movieId, theaterId, date },
  });
}

// =============================================================================
// Seat Stage
// =============================================================================

export interface SeatItem extends DataItem {
  id: string;
  row: string;
  number: number;
  label: string;
  status: 'available' | 'occupied';
}

export function generateSeatSpec(
  seats: Seat[],
  movieId: string,
  theaterId: string,
  date: string,
  showtimeId: string
): UISpec<SeatItem> {
  const items: SeatItem[] = seats
    .filter((s) => s.type === 'standard')
    .map((s) => ({
      id: s.id,
      row: s.row,
      number: s.number,
      label: `${s.row}${s.number}`,
      status: s.status === 'available' ? 'available' : 'occupied',
    }));

  const rows = [...new Set(items.map((s) => s.row))].sort();
  const seatsPerRow = Math.max(...items.map((s) => s.number));

  return createSpec({
    stage: 'seat',
    title: 'Select Seats',
    description: 'Choose your seats',
    items,
    modification: {},
    display: {
      valueField: 'label',
      component: 'seatMap',
    },
    meta: {
      movieId,
      theaterId,
      date,
      showtimeId,
      rows,
      seatsPerRow,
    },
    initialState: {
      selectedList: [],
    },
  });
}

// =============================================================================
// Ticket Stage
// =============================================================================

export interface TicketItem extends DataItem {
  id: string;
  name: string;
  price: number;
  priceDisplay: string;
  description?: string;
}

export function generateTicketSpec(
  ticketTypes: TicketType[],
  selectedSeats: string[]
): UISpec<TicketItem> {
  const items: TicketItem[] = ticketTypes.map((t) => ({
    id: t.id,
    name: t.name,
    price: t.price,
    priceDisplay: `$${t.price.toFixed(2)}`,
    description: t.description,
  }));

  // 초기 수량 (모두 0)
  const initialQuantities: QuantityItem[] = items.map((item) => ({
    item: { id: item.id, value: item.name },
    count: 0,
  }));

  return createSpec({
    stage: 'ticket',
    title: 'Select Tickets',
    description: 'Choose ticket types and quantities',
    items,
    modification: {},
    display: {
      valueField: 'name',
      component: 'counter',
    },
    meta: {
      maxTotal: selectedSeats.length,
      selectedSeats,
    },
    initialState: {
      quantities: initialQuantities,
    },
  });
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
  return createSpec({
    stage: 'confirm',
    title: 'Confirm Booking',
    description: 'Review your booking details',
    items: [],
    modification: {},
    display: {
      valueField: 'id',
      component: 'summary',
    },
    meta: meta as unknown as Record<string, unknown>,
  });
}
