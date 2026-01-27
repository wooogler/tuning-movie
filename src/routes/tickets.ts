import { FastifyInstance } from 'fastify';
import { ticketTypes } from '../data/mock';

export async function ticketRoutes(fastify: FastifyInstance) {
  // Get all ticket types
  fastify.get('/ticket-types', async (request, reply) => {
    return { ticketTypes };
  });
}
