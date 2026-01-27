import Fastify from 'fastify';
import cors from '@fastify/cors';
import { movieRoutes } from './routes/movies';
import { theaterRoutes } from './routes/theaters';
import { showingRoutes } from './routes/showings';
import { seatRoutes } from './routes/seats';
import { ticketRoutes } from './routes/tickets';
import { bookingRoutes } from './routes/bookings';

const fastify = Fastify({
  logger: true
});

const start = async () => {
  try {
    await fastify.register(cors, {
      origin: true
    });

    // Register routes
    await fastify.register(movieRoutes);
    await fastify.register(theaterRoutes);
    await fastify.register(showingRoutes);
    await fastify.register(seatRoutes);
    await fastify.register(ticketRoutes);
    await fastify.register(bookingRoutes);

    // Health check
    fastify.get('/health', async (request, reply) => {
      return { status: 'ok' };
    });

    const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    await fastify.listen({ port, host: '0.0.0.0' });

    console.log(`Server is running on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
