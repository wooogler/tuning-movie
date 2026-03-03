import { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { seats, showings } from '../db';
import { getDbFromRequest } from '../study/requestDb';
import type { StudyDb } from '../study/types';

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

    return { showings: withAvailableSeats(db, result) };
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

    return { showings: withAvailableSeats(db, result) };
  });

  // Get showing by ID
  fastify.get('/showings/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDbFromRequest(request);
    const showing = db.select().from(showings).where(eq(showings.id, id)).get();

    if (!showing) {
      return reply.code(404).send({ error: 'Showing not found' });
    }

    const [showingWithAvailability] = withAvailableSeats(db, [showing]);
    return { showing: showingWithAvailability };
  });
}
