import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { movies } from '../db';
import { getDbFromRequest } from '../study/requestDb';
import { stableShuffleForSession } from '../study/stableOrdering';

export async function movieRoutes(fastify: FastifyInstance) {
  // Get all movies
  fastify.get('/movies', async (request, reply) => {
    const db = getDbFromRequest(request);
    const result = db.select().from(movies).all();
    const ordered = stableShuffleForSession(request, result, 'movies', (movie) => movie.id);
    return {
      movies: ordered.map((m) => ({
        ...m,
        genre: JSON.parse(m.genre),
      })),
    };
  });

  // Get movie by ID
  fastify.get('/movies/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDbFromRequest(request);
    const movie = db.select().from(movies).where(eq(movies.id, id)).get();

    if (!movie) {
      return reply.code(404).send({ error: 'Movie not found' });
    }

    return {
      movie: {
        ...movie,
        genre: JSON.parse(movie.genre),
      },
    };
  });
}
