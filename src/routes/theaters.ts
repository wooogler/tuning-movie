import { FastifyInstance } from 'fastify';
import { theaters } from '../data/mock';

export async function theaterRoutes(fastify: FastifyInstance) {
  // Get all theaters
  fastify.get('/theaters', async (request, reply) => {
    return { theaters };
  });

  // Get theaters by movie ID
  fastify.get('/theaters/movie/:movieId', async (request, reply) => {
    const { movieId } = request.params as { movieId: string };

    // Get unique theaters that are showing this movie
    const { showings } = await import('../data/mock');
    const theaterIds = [...new Set(
      showings.filter(s => s.movieId === movieId).map(s => s.theaterId)
    )];

    const availableTheaters = theaters.filter(t => theaterIds.includes(t.id));

    return { theaters: availableTheaters };
  });

  // Get theater by ID
  fastify.get('/theaters/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const theater = theaters.find(t => t.id === id);

    if (!theater) {
      return reply.code(404).send({ error: 'Theater not found' });
    }

    return { theater };
  });
}
