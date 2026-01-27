import { FastifyInstance } from 'fastify';
import { bookings, seats, ticketTypes } from '../data/mock';
import { BookingRequest, Booking } from '../types';

export async function bookingRoutes(fastify: FastifyInstance) {
  // Create a booking
  fastify.post('/bookings', async (request, reply) => {
    const bookingRequest = request.body as BookingRequest;
    const { showingId, seatIds, tickets, customerInfo } = bookingRequest;

    // Validate seats are available
    const showingSeats = seats[showingId];
    if (!showingSeats) {
      return reply.code(404).send({ error: 'Showing not found' });
    }

    const selectedSeats = showingSeats.filter(s => seatIds.includes(s.id));
    if (selectedSeats.length !== seatIds.length) {
      return reply.code(400).send({ error: 'Some seats not found' });
    }

    const occupiedSeats = selectedSeats.filter(s => s.status === 'occupied');
    if (occupiedSeats.length > 0) {
      return reply.code(400).send({
        error: 'Some seats are already occupied',
        occupiedSeats: occupiedSeats.map(s => s.id)
      });
    }

    // Calculate total price
    let totalPrice = 0;
    for (const ticket of tickets) {
      const ticketType = ticketTypes.find(tt => tt.id === ticket.ticketTypeId);
      if (!ticketType) {
        return reply.code(400).send({ error: `Invalid ticket type: ${ticket.ticketTypeId}` });
      }
      totalPrice += ticketType.price * ticket.quantity;
    }

    // Create booking
    const booking: Booking = {
      id: `b${bookings.length + 1}`,
      showingId,
      seatIds,
      tickets,
      customerInfo,
      totalPrice,
      status: 'confirmed',
      createdAt: new Date().toISOString()
    };

    bookings.push(booking);

    // Update seat status
    selectedSeats.forEach(seat => {
      seat.status = 'occupied';
    });

    return reply.code(201).send({ booking });
  });

  // Get booking by ID
  fastify.get('/bookings/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const booking = bookings.find(b => b.id === id);

    if (!booking) {
      return reply.code(404).send({ error: 'Booking not found' });
    }

    return { booking };
  });

  // Cancel booking
  fastify.delete('/bookings/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const booking = bookings.find(b => b.id === id);

    if (!booking) {
      return reply.code(404).send({ error: 'Booking not found' });
    }

    if (booking.status === 'cancelled') {
      return reply.code(400).send({ error: 'Booking already cancelled' });
    }

    booking.status = 'cancelled';

    // Free up seats
    const showingSeats = seats[booking.showingId];
    booking.seatIds.forEach(seatId => {
      const seat = showingSeats.find(s => s.id === seatId);
      if (seat) {
        seat.status = 'available';
      }
    });

    return { booking };
  });
}
