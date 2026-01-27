# Tuning Movie Backend

A movie ticket booking system API built with Fastify and TypeScript.

## Features

- Movie selection
- Theater selection
- Date selection
- Time selection
- Seat selection
- Ticket type and quantity selection
- Booking confirmation

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Production

```bash
npm start
```

## API Endpoints

### Movies
- `GET /movies` - Get all movies
- `GET /movies/:id` - Get movie by ID

### Theaters
- `GET /theaters` - Get all theaters
- `GET /theaters/movie/:movieId` - Get theaters showing a specific movie
- `GET /theaters/:id` - Get theater by ID

### Showings
- `GET /showings?movieId&theaterId&date` - Get showings with optional filters
- `GET /showings/dates?movieId&theaterId` - Get available dates
- `GET /showings/times?movieId&theaterId&date` - Get available times
- `GET /showings/:id` - Get showing by ID

### Seats
- `GET /seats/:showingId` - Get seats for a showing

### Tickets
- `GET /ticket-types` - Get all ticket types

### Bookings
- `POST /bookings` - Create a booking
- `GET /bookings/:id` - Get booking by ID
- `DELETE /bookings/:id` - Cancel a booking

## Booking Flow

1. Select a movie (`GET /movies`)
2. Select a theater (`GET /theaters/movie/:movieId`)
3. Select a date (`GET /showings/dates`)
4. Select a time (`GET /showings/times`)
5. Select seats (`GET /seats/:showingId`)
6. Select ticket types and quantities (`GET /ticket-types`)
7. Confirm booking (`POST /bookings`)
