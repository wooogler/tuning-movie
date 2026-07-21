import { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { movies, seats, showings } from '../db';
import { getDbFromRequest } from '../study/requestDb';
import { parseDurationText } from '../utils/duration';
import type { StudyDb } from '../study/types';

function computeEndTime(
  startTime: string,
  durationMinutes: number
): { endTime: string; displayEndTime: string } | null {
  const match = startTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const totalMin = parseInt(match[1], 10) * 60 + parseInt(match[2], 10) + durationMinutes;
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  const displayH = endH % 12 || 12;
  const amPm = endH < 12 ? 'AM' : 'PM';
  const displayEndTime = `${displayH}:${String(endM).padStart(2, '0')} ${amPm}`;
  return { endTime, displayEndTime };
}

function withAvailableSeats<T extends { id: string }>(
  db: StudyDb,
  showingRows: T[]
): Array<T & { availableSeats: number }> {
  if (showingRows.length === 0) return [];

  const showingIds = showingRows.map((showing) => showing.id);
  const showingSeats = db
    .select({ showingId: seats.showingId, status: seats.status })
    .from(seats)
    .where(inArray(seats.showingId, showingIds))
    .all();

  const availableSeatCountByShowing = new Map<string, number>();
  for (const seat of showingSeats) {
    if (seat.status !== 'available') continue;
    availableSeatCountByShowing.set(
      seat.showingId,
      (availableSeatCountByShowing.get(seat.showingId) ?? 0) + 1
    );
  }

  return showingRows.map((showing) => ({
    ...showing,
    availableSeats: availableSeatCountByShowing.get(showing.id) ?? 0,
  }));
}

function withEndTimes<T extends { movieId: string; time: string }>(
  db: StudyDb,
  showingRows: T[]
): Array<T & { endTime: string; displayEndTime: string }> {
  if (showingRows.length === 0) return [];

  const movieIds = [...new Set(showingRows.map((s) => s.movieId))];
  const movieRows = db
    .select({ id: movies.id, duration: movies.duration })
    .from(movies)
    .where(inArray(movies.id, movieIds))
    .all();

  const durationMap = new Map<string, number>();
  for (const movie of movieRows) {
    const mins = parseDurationText(movie.duration);
    if (mins) durationMap.set(movie.id, mins);
  }

  return showingRows.map((showing) => {
    const durationMins = durationMap.get(showing.movieId);
    if (!durationMins) return { ...showing, endTime: '', displayEndTime: '' };
    const result = computeEndTime(showing.time, durationMins);
    return {
      ...showing,
      endTime: result?.endTime ?? '',
      displayEndTime: result?.displayEndTime ?? '',
    };
  });
}

function sortShowingsByTime<T extends { time: string }>(showingRows: T[]): T[] {
  return [...showingRows].sort((left, right) => left.time.localeCompare(right.time));
}

export async function showingRoutes(fastify: FastifyInstance) {
  // Get showings by movie and theater
  fastify.get('/showings', async (request) => {
    const { movieId, theaterId, date } = request.query as {
      movieId?: string;
      theaterId?: string;
      date?: string;
    };

    const db = getDbFromRequest(request);
    let result = db.select().from(showings).all();

    if (movieId) {
      result = result.filter((s) => s.movieId === movieId);
    }

    if (theaterId) {
      result = result.filter((s) => s.theaterId === theaterId);
    }

    if (date) {
      result = result.filter((s) => s.date === date);
    }

    return { showings: withEndTimes(db, withAvailableSeats(db, sortShowingsByTime(result))) };
  });

  // Get available dates for a movie at a theater
  fastify.get('/showings/dates', async (request) => {
    const db = getDbFromRequest(request);
    const { movieId, theaterId } = request.query as {
      movieId: string;
      theaterId: string;
    };

    const result = db
      .select()
      .from(showings)
      .where(and(eq(showings.movieId, movieId), eq(showings.theaterId, theaterId)))
      .all();

    const dates = [...new Set(result.map((s) => s.date))].sort();

    return { dates };
  });

  // Get available times for a movie at a theater on a specific date
  fastify.get('/showings/times', async (request) => {
    const db = getDbFromRequest(request);
    const { movieId, theaterId, date } = request.query as {
      movieId: string;
      theaterId: string;
      date: string;
    };

    const result = db
      .select()
      .from(showings)
      .where(
        and(
          eq(showings.movieId, movieId),
          eq(showings.theaterId, theaterId),
          eq(showings.date, date)
        )
      )
      .all();

    return { showings: withEndTimes(db, withAvailableSeats(db, sortShowingsByTime(result))) };
  });

  // Get showing by ID
  fastify.get('/showings/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDbFromRequest(request);
    const showing = db.select().from(showings).where(eq(showings.id, id)).get();

    if (!showing) {
      return reply.code(404).send({ error: 'Showing not found' });
    }

    const [showingWithAvailability] = withEndTimes(db, withAvailableSeats(db, [showing]));
    return { showing: showingWithAvailability };
  });
}
