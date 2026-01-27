import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, movies } from '../db';

export async function movieRoutes(fastify: FastifyInstance) {
  // Get all movies
  fastify.get('/movies', async (request, reply) => {
    const result = db.select().from(movies).all();
    return {
      movies: result.map((m) => ({
        ...m,
        genre: JSON.parse(m.genre),
      })),
    };
  });

  // Get movie by ID
  fastify.get('/movies/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
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
