import { FastifyInstance } from 'fastify';
import { showings } from '../data/mock';

export async function showingRoutes(fastify: FastifyInstance) {
  // Get showings by movie and theater
  fastify.get('/showings', async (request, reply) => {
    const { movieId, theaterId, date } = request.query as {
      movieId?: string;
      theaterId?: string;
      date?: string;
    };

    let filteredShowings = showings;

    if (movieId) {
      filteredShowings = filteredShowings.filter(s => s.movieId === movieId);
    }

    if (theaterId) {
      filteredShowings = filteredShowings.filter(s => s.theaterId === theaterId);
    }

    if (date) {
      filteredShowings = filteredShowings.filter(s => s.date === date);
    }

    return { showings: filteredShowings };
  });

  // Get available dates for a movie at a theater
  fastify.get('/showings/dates', async (request, reply) => {
    const { movieId, theaterId } = request.query as {
      movieId: string;
      theaterId: string;
    };

    const filteredShowings = showings.filter(
      s => s.movieId === movieId && s.theaterId === theaterId
    );

    const dates = [...new Set(filteredShowings.map(s => s.date))].sort();

    return { dates };
  });

  // Get available times for a movie at a theater on a specific date
  fastify.get('/showings/times', async (request, reply) => {
    const { movieId, theaterId, date } = request.query as {
      movieId: string;
      theaterId: string;
      date: string;
    };

    const filteredShowings = showings.filter(
      s => s.movieId === movieId && s.theaterId === theaterId && s.date === date
    );

    return { showings: filteredShowings };
  });

  // Get showing by ID
  fastify.get('/showings/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const showing = showings.find(s => s.id === id);

    if (!showing) {
      return reply.code(404).send({ error: 'Showing not found' });
    }

    return { showing };
  });
}
