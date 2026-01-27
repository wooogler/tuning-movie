import { FastifyInstance } from 'fastify';
import { movies } from '../data/mock';

export async function movieRoutes(fastify: FastifyInstance) {
  // Get all movies
  fastify.get('/movies', async (request, reply) => {
    return { movies };
  });

  // Get movie by ID
  fastify.get('/movies/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const movie = movies.find(m => m.id === id);

    if (!movie) {
      return reply.code(404).send({ error: 'Movie not found' });
    }

    return { movie };
  });
}
