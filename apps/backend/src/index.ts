import './env';
import path from 'path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { movieRoutes } from './routes/movies';
import { theaterRoutes } from './routes/theaters';
import { showingRoutes } from './routes/showings';
import { seatRoutes } from './routes/seats';
import { ticketRoutes } from './routes/tickets';
import { bookingRoutes } from './routes/bookings';

const fastify = Fastify({
  logger: true,
});

const start = async () => {
  try {
    await fastify.register(cors, {
      origin: true,
    });

    // Register API routes
    await fastify.register(movieRoutes);
    await fastify.register(theaterRoutes);
    await fastify.register(showingRoutes);
    await fastify.register(seatRoutes);
    await fastify.register(ticketRoutes);
    await fastify.register(bookingRoutes);

    // Health check
    fastify.get('/health', async () => {
      return { status: 'ok' };
    });

    // Serve static frontend files in production
    if (process.env.NODE_ENV === 'production') {
      const frontendPath = path.join(__dirname, '../../frontend/dist');
      await fastify.register(fastifyStatic, {
        root: frontendPath,
        prefix: '/',
      });

      // SPA fallback - serve index.html for non-API routes
      fastify.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith('/health')) {
          reply.status(404).send({ error: 'Not Found' });
        } else {
          (reply as any).sendFile('index.html');
        }
      });
    }

    const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    await fastify.listen({ port, host: '0.0.0.0' });

    console.log(`Server is running on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
