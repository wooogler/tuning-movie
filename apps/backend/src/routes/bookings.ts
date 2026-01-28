import { FastifyInstance } from 'fastify';
import { eq, inArray } from 'drizzle-orm';
import { db, bookings, bookingSeats, bookingTickets, seats, ticketTypes } from '../db';

interface BookingRequest {
  showingId: string;
  seats: string[];
  tickets: { ticketTypeId: string; quantity: number }[];
  customerName: string;
  customerEmail: string;
}

export async function bookingRoutes(fastify: FastifyInstance) {
  // Create a booking
  fastify.post('/bookings', async (request, reply) => {
    const body = request.body as BookingRequest;
    const { showingId, seats: seatIds, tickets, customerName, customerEmail } = body;

    // Validate seats exist and are available
    const selectedSeats = db
      .select()
      .from(seats)
      .where(inArray(seats.id, seatIds))
      .all();

    if (selectedSeats.length !== seatIds.length) {
      return reply.code(400).send({ error: 'Some seats not found' });
    }

    const occupiedSeats = selectedSeats.filter((s) => s.status !== 'available');
    if (occupiedSeats.length > 0) {
      return reply.code(400).send({
        error: 'Some seats are already occupied',
        occupiedSeats: occupiedSeats.map((s) => s.id),
      });
    }

    // Calculate total price
    let totalPrice = 0;
    for (const ticket of tickets) {
      const ticketType = db
        .select()
        .from(ticketTypes)
        .where(eq(ticketTypes.id, ticket.ticketTypeId))
        .get();

      if (!ticketType) {
        return reply.code(400).send({ error: `Invalid ticket type: ${ticket.ticketTypeId}` });
      }
      totalPrice += ticketType.price * ticket.quantity;
    }

    // Create booking
    const bookingId = `b-${Date.now()}`;
    const now = new Date().toISOString();

    db.insert(bookings)
      .values({
        id: bookingId,
        showingId,
        customerName,
        customerEmail,
        totalPrice,
        status: 'confirmed',
        createdAt: now,
      })
      .run();

    // Create booking seats
    for (const seatId of seatIds) {
      db.insert(bookingSeats)
        .values({
          id: `bs-${Date.now()}-${seatId}`,
          bookingId,
          seatId,
        })
        .run();

      // Update seat status to occupied
      db.update(seats).set({ status: 'occupied' }).where(eq(seats.id, seatId)).run();
    }

    // Create booking tickets
    for (const ticket of tickets) {
      db.insert(bookingTickets)
        .values({
          id: `bt-${Date.now()}-${ticket.ticketTypeId}`,
          bookingId,
          ticketTypeId: ticket.ticketTypeId,
          quantity: ticket.quantity,
        })
        .run();
    }

    const booking = db.select().from(bookings).where(eq(bookings.id, bookingId)).get();

    return reply.code(201).send({ booking });
  });

  // Get booking by ID
  fastify.get('/bookings/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const booking = db.select().from(bookings).where(eq(bookings.id, id)).get();

    if (!booking) {
      return reply.code(404).send({ error: 'Booking not found' });
    }

    // Get associated seats
    const bookedSeats = db
      .select()
      .from(bookingSeats)
      .where(eq(bookingSeats.bookingId, id))
      .all();

    // Get associated tickets
    const bookedTickets = db
      .select()
      .from(bookingTickets)
      .where(eq(bookingTickets.bookingId, id))
      .all();

    return {
      booking: {
        ...booking,
        seats: bookedSeats.map((bs) => bs.seatId),
        tickets: bookedTickets.map((bt) => ({
          ticketTypeId: bt.ticketTypeId,
          quantity: bt.quantity,
        })),
      },
    };
  });

  // Cancel booking
  fastify.delete('/bookings/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const booking = db.select().from(bookings).where(eq(bookings.id, id)).get();

    if (!booking) {
      return reply.code(404).send({ error: 'Booking not found' });
    }

    if (booking.status === 'cancelled') {
      return reply.code(400).send({ error: 'Booking already cancelled' });
    }

    // Update booking status
    db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, id)).run();

    // Free up seats
    const bookedSeats = db
      .select()
      .from(bookingSeats)
      .where(eq(bookingSeats.bookingId, id))
      .all();

    for (const bs of bookedSeats) {
      db.update(seats).set({ status: 'available' }).where(eq(seats.id, bs.seatId)).run();
    }

    const updatedBooking = db.select().from(bookings).where(eq(bookings.id, id)).get();

    return { booking: updatedBooking };
  });
}
