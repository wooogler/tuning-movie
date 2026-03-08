import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const movies = sqliteTable('movies', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  genre: text('genre').notNull(), // JSON string array
  duration: text('duration').notNull(), // e.g. "1h 50m"
  rating: text('rating').notNull(),
  ageRating: text('age_rating').notNull().default('NR'),
  synopsis: text('synopsis').notNull().default(''),
  releaseDate: text('release_date').notNull(),
});

export const theaters = sqliteTable('theaters', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  location: text('location').notNull(),
  screenCount: integer('screen_count').notNull(),
  distanceMiles: real('distance_miles').notNull(),
  amenities: text('amenities').notNull(), // JSON string array
});

export const showings = sqliteTable('showings', {
  id: text('id').primaryKey(),
  movieId: text('movie_id').notNull().references(() => movies.id),
  theaterId: text('theater_id').notNull().references(() => theaters.id),
  screenNumber: integer('screen_number').notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  time: text('time').notNull(), // HH:MM
  format: text('format').notNull().default('Standard'), // Standard, IMAX, 3D
  totalSeats: integer('total_seats').notNull(),
});

export const seats = sqliteTable('seats', {
  id: text('id').primaryKey(),
  showingId: text('showing_id').notNull().references(() => showings.id),
  row: text('row').notNull(),
  number: integer('number').notNull(),
  type: text('type').notNull(), // standard, premium, couple
  price: integer('price').notNull(),
  status: text('status').notNull().default('available'), // available, occupied, reserved
});

export const bookings = sqliteTable('bookings', {
  id: text('id').primaryKey(),
  showingId: text('showing_id').notNull().references(() => showings.id),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  totalPrice: real('total_price').notNull(),
  status: text('status').notNull().default('confirmed'), // confirmed, cancelled
  createdAt: text('created_at').notNull(),
});

export const bookingSeats = sqliteTable('booking_seats', {
  id: text('id').primaryKey(),
  bookingId: text('booking_id').notNull().references(() => bookings.id),
  seatId: text('seat_id').notNull().references(() => seats.id),
});
