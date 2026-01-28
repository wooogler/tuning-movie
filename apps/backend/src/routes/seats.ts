import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, seats } from '../db';

export async function seatRoutes(fastify: FastifyInstance) {
  // Get seats for a showing
  fastify.get('/seats/:showingId', async (request, reply) => {
    const { showingId } = request.params as { showingId: string };
    const showingSeats = db.select().from(seats).where(eq(seats.showingId, showingId)).all();

    if (showingSeats.length === 0) {
      return reply.code(404).send({ error: 'Showing not found or no seats available' });
    }

    return { seats: showingSeats };
  });
}
