import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db, showings } from '../db';

export async function showingRoutes(fastify: FastifyInstance) {
  // Get showings by movie and theater
  fastify.get('/showings', async (request) => {
    const { movieId, theaterId, date } = request.query as {
      movieId?: string;
      theaterId?: string;
      date?: string;
    };

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

    return { showings: result };
  });

  // Get available dates for a movie at a theater
  fastify.get('/showings/dates', async (request) => {
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

    return { showings: result };
  });

  // Get showing by ID
  fastify.get('/showings/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const showing = db.select().from(showings).where(eq(showings.id, id)).get();

    if (!showing) {
      return reply.code(404).send({ error: 'Showing not found' });
    }

    return { showing };
  });
}
