import { FastifyInstance } from 'fastify';
import { db, ticketTypes } from '../db';

export async function ticketRoutes(fastify: FastifyInstance) {
  // Get all ticket types
  fastify.get('/ticket-types', async () => {
    const result = db.select().from(ticketTypes).all();
    return { ticketTypes: result };
  });
}
