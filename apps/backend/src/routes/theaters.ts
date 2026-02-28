import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, theaters, showings } from '../db';

type TheaterRow = typeof theaters.$inferSelect;

function parseAmenities(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    // Ignore parse errors and return an empty list.
  }
  return [];
}

function toTheaterResponse(row: TheaterRow) {
  return {
    ...row,
    amenities: parseAmenities(row.amenities),
  };
}

export async function theaterRoutes(fastify: FastifyInstance) {
  // Get all theaters
  fastify.get('/theaters', async () => {
    const result = db.select().from(theaters).all();
    return { theaters: result.map(toTheaterResponse) };
  });

  // Get theaters by movie ID
  fastify.get('/theaters/movie/:movieId', async (request) => {
    const { movieId } = request.params as { movieId: string };

    // Get unique theaters that are showing this movie
    const movieShowings = db
      .select({ theaterId: showings.theaterId })
      .from(showings)
      .where(eq(showings.movieId, movieId))
      .all();

    const theaterIds = [...new Set(movieShowings.map((s) => s.theaterId))];

    const availableTheaters = db
      .select()
      .from(theaters)
      .all()
      .filter((t) => theaterIds.includes(t.id));

    return { theaters: availableTheaters.map(toTheaterResponse) };
  });

  // Get theater by ID
  fastify.get('/theaters/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const theater = db.select().from(theaters).where(eq(theaters.id, id)).get();

    if (!theater) {
      return reply.code(404).send({ error: 'Theater not found' });
    }

    return { theater: toTheaterResponse(theater) };
  });
}
