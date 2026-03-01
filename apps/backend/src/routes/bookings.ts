import { randomUUID } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { db, bookings, bookingSeats, seats, showings } from '../db';
import { getFixedCurrentDateUtc } from '../studyDate';

interface BookingRequest {
  showingId: string;
  seats: string[];
  customerName: string;
  customerEmail: string;
}

export async function bookingRoutes(fastify: FastifyInstance) {
  // Create a booking
  fastify.post('/bookings', async (request, reply) => {
    const body = request.body as BookingRequest;
    const { showingId, seats: seatIds, customerName, customerEmail } = body;

    if (!showingId || typeof showingId !== 'string') {
      return reply.code(400).send({ error: 'Invalid showingId' });
    }
    if (!Array.isArray(seatIds) || seatIds.length === 0) {
      return reply.code(400).send({ error: 'At least one seat is required' });
    }
    if (!customerName || !customerEmail) {
      return reply.code(400).send({ error: 'Customer name and email are required' });
    }

    const uniqueSeatIds = [...new Set(seatIds)];
    if (uniqueSeatIds.length !== seatIds.length) {
      return reply.code(400).send({ error: 'Duplicate seats are not allowed' });
    }

    const showing = db.select().from(showings).where(eq(showings.id, showingId)).get();
    if (!showing) {
      return reply.code(404).send({ error: 'Showing not found' });
    }

    const selectedSeats = db
      .select()
      .from(seats)
      .where(and(inArray(seats.id, uniqueSeatIds), eq(seats.showingId, showingId)))
      .all();

    if (selectedSeats.length !== uniqueSeatIds.length) {
      return reply.code(400).send({ error: 'Some seats are invalid for this showing' });
    }

    const occupiedSeats = selectedSeats.filter((seat) => seat.status !== 'available');
    if (occupiedSeats.length > 0) {
      return reply.code(409).send({
        error: 'Some seats are already occupied',
        occupiedSeats: occupiedSeats.map((seat) => seat.id),
      });
    }

    const totalPrice = selectedSeats.reduce((sum, seat) => sum + seat.price, 0);

    const bookingId = randomUUID();
    const now = getFixedCurrentDateUtc().toISOString();

    try {
      db.transaction((tx) => {
        tx.insert(bookings)
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

        for (const seatId of uniqueSeatIds) {
          tx.insert(bookingSeats)
            .values({
              id: randomUUID(),
              bookingId,
              seatId,
            })
            .run();

          const updateResult = tx
            .update(seats)
            .set({ status: 'occupied' })
            .where(and(eq(seats.id, seatId), eq(seats.status, 'available')))
            .run();

          if (updateResult.changes !== 1) {
            throw new Error(`seat_conflict:${seatId}`);
          }
        }

      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'booking_failed';
      if (message.startsWith('seat_conflict:')) {
        const conflictedSeatId = message.split(':')[1];
        return reply.code(409).send({
          error: 'A selected seat was just booked by someone else',
          occupiedSeats: conflictedSeatId ? [conflictedSeatId] : [],
        });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create booking' });
    }

    const createdBooking = db.select().from(bookings).where(eq(bookings.id, bookingId)).get();
    return reply.code(201).send({ booking: createdBooking });
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

    return {
      booking: {
        ...booking,
        seats: bookedSeats.map((bs) => bs.seatId),
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

    const bookedSeats = db
      .select()
      .from(bookingSeats)
      .where(eq(bookingSeats.bookingId, id))
      .all();

    db.transaction((tx) => {
      tx.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, id)).run();
      for (const bs of bookedSeats) {
        tx.update(seats).set({ status: 'available' }).where(eq(seats.id, bs.seatId)).run();
      }
    });

    const updatedBooking = db.select().from(bookings).where(eq(bookings.id, id)).get();

    return { booking: updatedBooking };
  });
}
