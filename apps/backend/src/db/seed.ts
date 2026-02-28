import '../env';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { FIXED_CURRENT_DATE, getFixedCurrentDateUtc } from '../studyDate';

const dbPath = process.env.DATABASE_URL || 'tuning-movie.db';
const sqlite = new Database(dbPath);
const db = drizzle(sqlite, { schema });

function createTables() {
  console.log('Creating tables if not exist...');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS movies (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      poster_url TEXT,
      genre TEXT NOT NULL,
      duration INTEGER NOT NULL,
      rating TEXT NOT NULL,
      release_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS theaters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      screen_count INTEGER NOT NULL,
      distance_km REAL NOT NULL,
      amenities TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS showings (
      id TEXT PRIMARY KEY,
      movie_id TEXT NOT NULL REFERENCES movies(id),
      theater_id TEXT NOT NULL REFERENCES theaters(id),
      screen_number INTEGER NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      total_seats INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS seats (
      id TEXT PRIMARY KEY,
      showing_id TEXT NOT NULL REFERENCES showings(id),
      row TEXT NOT NULL,
      number INTEGER NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available'
    );

    CREATE TABLE IF NOT EXISTS ticket_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      showing_id TEXT NOT NULL REFERENCES showings(id),
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      total_price REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS booking_seats (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id),
      seat_id TEXT NOT NULL REFERENCES seats(id)
    );

    CREATE TABLE IF NOT EXISTS booking_tickets (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id),
      ticket_type_id TEXT NOT NULL REFERENCES ticket_types(id),
      quantity INTEGER NOT NULL
    );
  `);

  const theaterColumnNames = new Set(
    (
      sqlite.prepare('PRAGMA table_info(theaters)').all() as Array<{
        name: string;
      }>
    ).map((column) => column.name)
  );

  if (!theaterColumnNames.has('distance_km')) {
    sqlite.exec('ALTER TABLE theaters ADD COLUMN distance_km REAL NOT NULL DEFAULT 0');
  }

  if (!theaterColumnNames.has('amenities')) {
    sqlite.exec("ALTER TABLE theaters ADD COLUMN amenities TEXT NOT NULL DEFAULT '[]'");
  }

  console.log('Tables created/verified');
}

async function seed() {
  console.log('Seeding database...');

  // Create tables first
  createTables();

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
      posterUrl: 'https://image.tmdb.org/t/p/w500/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg',
      genre: JSON.stringify(['Sci-Fi', 'Action']),
      duration: 166,
      rating: 'PG-13',
      releaseDate: '2024-02-28',
    },
    {
      id: 'm2',
      title: 'Oppenheimer',
      posterUrl: 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
      genre: JSON.stringify(['Drama', 'History']),
      duration: 180,
      rating: 'R',
      releaseDate: '2023-08-15',
    },
    {
      id: 'm3',
      title: 'The Holdovers',
      posterUrl: 'https://image.tmdb.org/t/p/w500/VHSzNBTwxV8vh7wylo7O9CLdac.jpg',
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
    {
      id: 't1',
      name: 'AMC Lincoln Square 13',
      location: 'Upper West Side, New York, NY',
      screenCount: 13,
      distanceKm: 2.3,
      amenities: JSON.stringify(['IMAX', 'Dolby Cinema', 'Recliner Seats']),
    },
    {
      id: 't2',
      name: 'AMC Empire 25',
      location: 'Times Square, New York, NY',
      screenCount: 25,
      distanceKm: 4.1,
      amenities: JSON.stringify(['IMAX', '4DX', 'Reserved Seating']),
    },
    {
      id: 't3',
      name: 'Regal Union Square',
      location: 'Union Square, New York, NY',
      screenCount: 14,
      distanceKm: 1.7,
      amenities: JSON.stringify(['RPX', 'Stadium Seating', 'Wheelchair Access']),
    },
    {
      id: 't4',
      name: 'Alamo Drafthouse Downtown Brooklyn',
      location: 'Downtown Brooklyn, New York, NY',
      screenCount: 9,
      distanceKm: 6.0,
      amenities: JSON.stringify(['In-Theater Dining', 'Luxury Recliners', 'No-Ads Policy']),
    },
    {
      id: 't5',
      name: 'Nitehawk Williamsburg',
      location: 'Williamsburg, New York, NY',
      screenCount: 7,
      distanceKm: 5.4,
      amenities: JSON.stringify(['In-Theater Dining', 'Indie Screenings', 'Cocktail Bar']),
    },
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

  // Generate showings for next 14 days (updated to match frontend calendar range)
  const fixedCurrentDate = getFixedCurrentDateUtc();
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
    t1: ['m1', 'm2'], // Lincoln Square
    t2: ['m1', 'm2', 'm3'], // Empire 25
    t3: ['m1', 'm3'], // Union Square
    t4: ['m2', 'm3'], // Downtown Brooklyn
    t5: ['m3'], // Williamsburg
  };

  const SHOWING_DAYS = 14;
  const startDateStr = FIXED_CURRENT_DATE;
  const endDate = new Date(fixedCurrentDate);
  endDate.setUTCDate(endDate.getUTCDate() + SHOWING_DAYS - 1);
  const endDateStr = endDate.toISOString().split('T')[0];
  console.log(`Generating showings from ${startDateStr} to ${endDateStr} (${SHOWING_DAYS} days)`);

  for (let dayOffset = 0; dayOffset < SHOWING_DAYS; dayOffset++) {
    const date = new Date(fixedCurrentDate);
    date.setUTCDate(date.getUTCDate() + dayOffset);
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

  const insertShowing = sqlite.prepare(
    'INSERT INTO showings (id, movie_id, theater_id, screen_number, date, time, total_seats) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insertAllShowings = sqlite.transaction(() => {
    for (const showing of showingsData) {
      insertShowing.run(
        showing.id,
        showing.movieId,
        showing.theaterId,
        showing.screenNumber,
        showing.date,
        showing.time,
        showing.totalSeats
      );
    }
  });
  insertAllShowings();
  console.log(`Inserted ${showingsData.length} showings`);

  // Generate seats for each showing (optimized with prepared statement + transaction)
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const seatsPerRow = 10;
  let seatCount = 0;

  const insertSeat = sqlite.prepare(
    'INSERT INTO seats (id, showing_id, row, number, type, status) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const insertAllSeats = sqlite.transaction(() => {
    for (const showing of showingsData) {
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        for (let seatNum = 1; seatNum <= seatsPerRow; seatNum++) {
          const seatType = rowIndex >= 8 ? 'premium' : 'standard';
          const status = Math.random() < 0.15 ? 'occupied' : 'available';

          insertSeat.run(
            `${showing.id}-${rows[rowIndex]}${seatNum}`,
            showing.id,
            rows[rowIndex],
            seatNum,
            seatType,
            status
          );
          seatCount++;
        }
      }
    }
  });

  insertAllSeats();
  console.log(`Inserted ${seatCount} seats`);

  console.log('Database seeded successfully!');
  sqlite.close();
}

seed().catch(console.error);
