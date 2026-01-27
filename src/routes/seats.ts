import { FastifyInstance } from 'fastify';
import { seats } from '../data/mock';

export async function seatRoutes(fastify: FastifyInstance) {
  // Get seats for a showing
  fastify.get('/seats/:showingId', async (request, reply) => {
    const { showingId } = request.params as { showingId: string };
    const showingSeats = seats[showingId];

    if (!showingSeats) {
      return reply.code(404).send({ error: 'Showing not found' });
    }

    return { seats: showingSeats };
  });
}
