import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const sqlite = new Database('tuning-movie.db');
const db = drizzle(sqlite, { schema });

async function seed() {
  console.log('Seeding database...');

  // Clear existing data
  db.delete(schema.bookingTickets).run();
  db.delete(schema.bookingSeats).run();
  db.delete(schema.bookings).run();
  db.delete(schema.seats).run();
  db.delete(schema.showings).run();
  db.delete(schema.movies).run();
  db.delete(schema.theaters).run();
  db.delete(schema.ticketTypes).run();

  // Insert movies
  const moviesData = [
    {
      id: 'm1',
      title: 'Dune: Part Two',
      posterUrl: 'https://example.com/dune2.jpg',
      genre: JSON.stringify(['Sci-Fi', 'Action']),
      duration: 166,
      rating: 'PG-13',
      releaseDate: '2024-02-28',
    },
    {
      id: 'm2',
      title: 'Oppenheimer',
      posterUrl: 'https://example.com/oppenheimer.jpg',
      genre: JSON.stringify(['Drama', 'History']),
      duration: 180,
      rating: 'R',
      releaseDate: '2023-08-15',
    },
    {
      id: 'm3',
      title: 'The Holdovers',
      posterUrl: 'https://example.com/holdovers.jpg',
      genre: JSON.stringify(['Comedy', 'Drama']),
      duration: 134,
      rating: 'R',
      releaseDate: '2024-01-05',
    },
  ];

  for (const movie of moviesData) {
    db.insert(schema.movies).values(movie).run();
  }
  console.log('Inserted movies');

  // Insert theaters
  const theatersData = [
    { id: 't1', name: 'AMC Lincoln Square', location: 'New York, NY', screenCount: 12 },
    { id: 't2', name: 'Regal LA Live', location: 'Los Angeles, CA', screenCount: 10 },
    { id: 't3', name: 'Alamo Drafthouse', location: 'Austin, TX', screenCount: 15 },
  ];

  for (const theater of theatersData) {
    db.insert(schema.theaters).values(theater).run();
  }
  console.log('Inserted theaters');

  // Insert ticket types
  const ticketTypesData = [
    { id: 'tt1', name: 'Adult', price: 14.0, description: 'Ages 18+' },
    { id: 'tt2', name: 'Child', price: 9.0, description: 'Ages 3-12' },
    { id: 'tt3', name: 'Senior', price: 10.0, description: 'Ages 65+' },
  ];

  for (const ticketType of ticketTypesData) {
    db.insert(schema.ticketTypes).values(ticketType).run();
  }
  console.log('Inserted ticket types');

  // Generate showings for next 7 days
  const today = new Date();
  const showingsData: Array<{
    id: string;
    movieId: string;
    theaterId: string;
    screenNumber: number;
    date: string;
    time: string;
    totalSeats: number;
  }> = [];

  const times = ['10:00', '13:00', '16:00', '19:00', '22:00'];
  let showingId = 1;

  // Each theater shows different movies
  const theaterMovies: Record<string, string[]> = {
    t1: ['m1', 'm2'], // AMC shows Dune and Oppenheimer
    t2: ['m1', 'm3'], // Regal shows Dune and Holdovers
    t3: ['m2', 'm3'], // Alamo shows Oppenheimer and Holdovers
  };

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);
    const dateStr = date.toISOString().split('T')[0];

    for (const [theaterId, movieIds] of Object.entries(theaterMovies)) {
      for (const movieId of movieIds) {
        // Each movie has 2-3 showtimes per day
        const movieTimes = times.slice(0, 2 + Math.floor(Math.random() * 2));
        for (const time of movieTimes) {
          showingsData.push({
            id: `s${showingId++}`,
            movieId,
            theaterId,
            screenNumber: Math.floor(Math.random() * 5) + 1,
            date: dateStr,
            time,
            totalSeats: 100,
          });
        }
      }
    }
  }

  for (const showing of showingsData) {
    db.insert(schema.showings).values(showing).run();
  }
  console.log(`Inserted ${showingsData.length} showings`);

  // Generate seats for each showing
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const seatsPerRow = 10;
  let seatCount = 0;

  for (const showing of showingsData) {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      for (let seatNum = 1; seatNum <= seatsPerRow; seatNum++) {
        const seatType = rowIndex >= 8 ? 'premium' : 'standard';
        // Randomly mark some seats as occupied (simulating existing bookings)
        const status = Math.random() < 0.15 ? 'occupied' : 'available';

        db.insert(schema.seats)
          .values({
            id: `${showing.id}-${rows[rowIndex]}${seatNum}`,
            showingId: showing.id,
            row: rows[rowIndex],
            number: seatNum,
            type: seatType,
            status,
          })
          .run();
        seatCount++;
      }
    }
  }
  console.log(`Inserted ${seatCount} seats`);

  console.log('Database seeded successfully!');
  sqlite.close();
}

seed().catch(console.error);
