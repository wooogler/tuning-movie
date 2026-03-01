import '../env';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { getFixedCurrentDateUtc } from '../studyDate';

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
      price INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'available'
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

  const seatColumnNames = new Set(
    (
      sqlite.prepare('PRAGMA table_info(seats)').all() as Array<{
        name: string;
      }>
    ).map((column) => column.name)
  );

  if (!seatColumnNames.has('price')) {
    sqlite.exec('ALTER TABLE seats ADD COLUMN price INTEGER NOT NULL DEFAULT 10');
  }

  console.log('Tables created/verified');
}

function toIsoDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function addDaysUtc(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function getUpcomingWeekendDates(baseDateUtc: Date): { saturday: string; sunday: string } {
  const weekday = baseDateUtc.getUTCDay();
  const daysUntilSaturday = (6 - weekday + 7) % 7;
  const saturday = addDaysUtc(baseDateUtc, daysUntilSaturday);
  const sunday = addDaysUtc(saturday, 1);
  return {
    saturday: toIsoDate(saturday),
    sunday: toIsoDate(sunday),
  };
}

function makeShowingId(movieId: string, theaterId: string, date: string, time: string): string {
  return `s_${movieId}_${theaterId}_${date.replace(/-/g, '')}_${time.replace(':', '')}`;
}

interface ShowingSeed {
  id: string;
  movieId: string;
  theaterId: string;
  screenNumber: number;
  date: string;
  time: string;
  totalSeats: number;
}

type MovieId = 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6' | 'm7' | 'm8';
type TheaterId = 'ta' | 'tb' | 'tc' | 'td';
type SeatStatus = 'available' | 'occupied';

interface DailySchedule {
  saturday: string[];
  sunday: string[];
}

interface PriceProfile {
  front: number;
  middle: number;
  back: number;
  backType: 'standard' | 'premium';
}

const MOVIE_SCREEN_NUMBER: Record<MovieId, number> = {
  m1: 1,
  m2: 2,
  m3: 3,
  m4: 4,
  m5: 5,
  m6: 6,
  m7: 7,
  m8: 8,
};

const WEEKEND_SCHEDULE: Record<MovieId, Record<TheaterId, DailySchedule>> = {
  m1: {
    ta: { saturday: ['14:00', '17:00', '19:30', '21:00'], sunday: ['14:00', '19:00'] },
    tb: { saturday: ['15:00', '19:00'], sunday: ['18:30'] },
    tc: { saturday: [], sunday: [] },
    td: { saturday: ['17:00'], sunday: [] },
  },
  m2: {
    ta: { saturday: ['19:00'], sunday: [] },
    tb: { saturday: ['15:00', '18:30'], sunday: ['19:00'] },
    tc: { saturday: ['19:00', '21:00'], sunday: ['18:00'] },
    td: { saturday: [], sunday: [] },
  },
  m3: {
    ta: { saturday: ['15:00', '18:30', '21:00'], sunday: ['14:00', '18:00', '20:30'] },
    tb: { saturday: ['14:00', '19:00'], sunday: ['15:00', '18:30'] },
    tc: { saturday: ['18:00', '20:30'], sunday: ['14:00', '19:00', '21:00'] },
    td: { saturday: ['16:00', '19:00'], sunday: ['15:00', '18:00'] },
  },
  m4: {
    ta: { saturday: ['14:00', '17:30', '19:30', '21:00'], sunday: ['14:00', '19:30'] },
    tb: { saturday: ['15:00', '19:30'], sunday: ['19:00'] },
    tc: { saturday: [], sunday: [] },
    td: { saturday: ['18:00'], sunday: [] },
  },
  m5: {
    ta: { saturday: ['20:00'], sunday: [] },
    tb: { saturday: ['16:00', '19:00'], sunday: ['18:30'] },
    tc: { saturday: ['19:30', '21:00'], sunday: ['19:00'] },
    td: { saturday: [], sunday: [] },
  },
  m6: {
    ta: { saturday: ['15:00', '18:00', '20:30'], sunday: ['14:00', '18:30', '21:00'] },
    tb: { saturday: ['14:00', '18:30'], sunday: ['15:00', '19:00'] },
    tc: { saturday: ['18:00', '20:00'], sunday: ['14:00', '18:30', '20:30'] },
    td: { saturday: ['15:00', '19:00'], sunday: ['14:00', '18:00'] },
  },
  m7: {
    ta: { saturday: ['16:00', '19:00'], sunday: ['15:00', '20:00'] },
    tb: { saturday: ['18:00', '20:30'], sunday: ['19:00'] },
    tc: { saturday: [], sunday: ['17:00'] },
    td: { saturday: [], sunday: [] },
  },
  m8: {
    ta: { saturday: ['14:30', '18:00'], sunday: ['13:00', '17:00'] },
    tb: { saturday: ['15:00', '19:30'], sunday: ['14:00', '18:00'] },
    tc: { saturday: ['17:00'], sunday: ['15:00', '19:00'] },
    td: { saturday: [], sunday: ['16:00'] },
  },
};

function buildShowings(saturday: string, sunday: string): ShowingSeed[] {
  const showings: ShowingSeed[] = [];

  for (const movieId of Object.keys(WEEKEND_SCHEDULE) as MovieId[]) {
    const byTheater = WEEKEND_SCHEDULE[movieId];

    for (const theaterId of Object.keys(byTheater) as TheaterId[]) {
      const schedule = byTheater[theaterId];

      for (const time of schedule.saturday) {
        showings.push({
          id: makeShowingId(movieId, theaterId, saturday, time),
          movieId,
          theaterId,
          screenNumber: MOVIE_SCREEN_NUMBER[movieId],
          date: saturday,
          time,
          totalSeats: 48,
        });
      }

      for (const time of schedule.sunday) {
        showings.push({
          id: makeShowingId(movieId, theaterId, sunday, time),
          movieId,
          theaterId,
          screenNumber: MOVIE_SCREEN_NUMBER[movieId],
          date: sunday,
          time,
          totalSeats: 48,
        });
      }
    }
  }

  return showings;
}

function isUnpopularMovie(movieId: string): boolean {
  return movieId === 'm3' || movieId === 'm6';
}

function isTheaterASaturdayPrime(showing: ShowingSeed, saturday: string): boolean {
  if (showing.theaterId !== 'ta' || showing.date !== saturday || showing.time !== '19:30') {
    return false;
  }
  return showing.movieId === 'm1' || showing.movieId === 'm4';
}

function isTheaterBSaturdayEveningConflict(showing: ShowingSeed, saturday: string): boolean {
  if (showing.theaterId !== 'tb' || showing.date !== saturday) return false;
  return (
    (showing.movieId === 'm1' && showing.time === '19:00') ||
    (showing.movieId === 'm4' && showing.time === '19:30')
  );
}

function getPriceProfile(showing: ShowingSeed, saturday: string): PriceProfile {
  if (isTheaterASaturdayPrime(showing, saturday)) {
    return { front: 15, middle: 17, back: 18, backType: 'premium' };
  }

  if (showing.theaterId === 'ta') {
    return { front: 10, middle: 12, back: 15, backType: 'premium' };
  }

  if (showing.theaterId === 'tb') {
    return { front: 10, middle: 12, back: 12, backType: 'standard' };
  }

  if (showing.theaterId === 'tc') {
    if (isUnpopularMovie(showing.movieId)) {
      return { front: 10, middle: 10, back: 10, backType: 'standard' };
    }
    return { front: 8, middle: 10, back: 10, backType: 'standard' };
  }

  if (isUnpopularMovie(showing.movieId)) {
    return { front: 10, middle: 10, back: 10, backType: 'standard' };
  }
  return { front: 8, middle: 10, back: 10, backType: 'standard' };
}

function getSeatStatus(showing: ShowingSeed, row: string, number: number, saturday: string): SeatStatus {
  if (isTheaterASaturdayPrime(showing, saturday)) {
    if (row === 'A' || row === 'B') return 'available';
    if (row === 'C') return [4, 5].includes(number) ? 'available' : 'occupied';
    if (row === 'D') return [4, 5].includes(number) ? 'available' : 'occupied';
    if (row === 'E') return number === 6 ? 'available' : 'occupied';
    return 'occupied';
  }

  if (isTheaterBSaturdayEveningConflict(showing, saturday)) {
    if (row === 'A' || row === 'B' || row === 'C' || row === 'D') return 'available';
    if (row === 'E') return [4, 5].includes(number) ? 'available' : 'occupied';
    return 'occupied';
  }

  if (isUnpopularMovie(showing.movieId)) {
    if (row === 'A' || row === 'B' || row === 'C' || row === 'D') return 'available';
    if (row === 'E' || row === 'F') {
      return [4, 5].includes(number) ? 'available' : 'occupied';
    }
  }

  return 'available';
}

function seatProfileForShowing(
  showing: ShowingSeed,
  row: string,
  number: number,
  saturday: string
): { type: 'standard' | 'premium'; price: number; status: SeatStatus } {
  const priceProfile = getPriceProfile(showing, saturday);
  const type: 'standard' | 'premium' =
    row === 'E' || row === 'F' ? priceProfile.backType : 'standard';
  const price =
    row === 'A' || row === 'B'
      ? priceProfile.front
      : row === 'C' || row === 'D'
      ? priceProfile.middle
      : priceProfile.back;

  return {
    type,
    price,
    status: getSeatStatus(showing, row, number, saturday),
  };
}

async function seed() {
  console.log('Seeding database...');

  createTables();

  db.delete(schema.bookingSeats).run();
  db.delete(schema.bookings).run();
  db.delete(schema.seats).run();
  db.delete(schema.showings).run();
  db.delete(schema.movies).run();
  db.delete(schema.theaters).run();

  const moviesData = [
    {
      id: 'm1',
      title: 'The Hangover',
      posterUrl: 'https://image.tmdb.org/t/p/w500/uluhlXubGu1VxU63X9VHCLWDAYP.jpg',
      genre: JSON.stringify(['Comedy']),
      duration: 100,
      rating: '4.5',
      releaseDate: '2009-06-05',
    },
    {
      id: 'm2',
      title: 'Superbad',
      posterUrl: 'https://image.tmdb.org/t/p/w500/ek8e8txUyUwd2BNqj6lFEerJfbq.jpg',
      genre: JSON.stringify(['Comedy']),
      duration: 113,
      rating: '4.1',
      releaseDate: '2007-08-17',
    },
    {
      id: 'm3',
      title: 'The Intern',
      posterUrl: 'https://image.tmdb.org/t/p/w500/sf6j1SbgDf2k3mS9t2qfJvM6v0x.jpg',
      genre: JSON.stringify(['Comedy', 'Drama']),
      duration: 121,
      rating: '3.8',
      releaseDate: '2015-09-25',
    },
    {
      id: 'm4',
      title: 'The Dark Knight',
      posterUrl: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
      genre: JSON.stringify(['Action']),
      duration: 152,
      rating: '4.7',
      releaseDate: '2008-07-18',
    },
    {
      id: 'm5',
      title: 'John Wick 4',
      posterUrl: 'https://image.tmdb.org/t/p/w500/vZloFAK7NmvMGKE7VkF5UHaz0I.jpg',
      genre: JSON.stringify(['Action']),
      duration: 169,
      rating: '4.3',
      releaseDate: '2023-03-24',
    },
    {
      id: 'm6',
      title: 'Top Gun: Maverick',
      posterUrl: 'https://image.tmdb.org/t/p/w500/62HCnUTziyWcpDaBO2i1DX17ljH.jpg',
      genre: JSON.stringify(['Action', 'Drama']),
      duration: 131,
      rating: '3.9',
      releaseDate: '2022-05-27',
    },
    {
      id: 'm7',
      title: 'Gone Girl',
      posterUrl: 'https://image.tmdb.org/t/p/w500/ts996lKsxvjkO2yiYG0ht4qAicO.jpg',
      genre: JSON.stringify(['Thriller']),
      duration: 149,
      rating: '4.4',
      releaseDate: '2014-10-03',
    },
    {
      id: 'm8',
      title: 'La La Land',
      posterUrl: 'https://image.tmdb.org/t/p/w500/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg',
      genre: JSON.stringify(['Romance']),
      duration: 128,
      rating: '4.2',
      releaseDate: '2016-12-09',
    },
  ];

  for (const movie of moviesData) {
    db.insert(schema.movies).values(movie).run();
  }
  console.log('Inserted movies');

  const theatersData = [
    {
      id: 'ta',
      name: 'Regal Battery Park',
      location: 'Battery Park, Manhattan, New York, NY',
      screenCount: 11,
      distanceKm: 1.2,
      amenities: JSON.stringify(['Premium Large Format', 'Reserved Seating']),
    },
    {
      id: 'tb',
      name: 'AMC 34th Street 14',
      location: 'Midtown, Manhattan, New York, NY',
      screenCount: 14,
      distanceKm: 2.8,
      amenities: JSON.stringify(['Reserved Seating']),
    },
    {
      id: 'tc',
      name: 'AMC Magic Johnson Harlem 9',
      location: 'Harlem, Manhattan, New York, NY',
      screenCount: 9,
      distanceKm: 6.1,
      amenities: JSON.stringify(['Reserved Seating']),
    },
    {
      id: 'td',
      name: 'AMC Bay Plaza Cinema 13',
      location: 'Baychester, Bronx, New York, NY',
      screenCount: 13,
      distanceKm: 15.4,
      amenities: JSON.stringify(['Reserved Seating']),
    },
  ];

  for (const theater of theatersData) {
    db.insert(schema.theaters).values(theater).run();
  }
  console.log('Inserted theaters');

  const { saturday, sunday } = getUpcomingWeekendDates(getFixedCurrentDateUtc());
  const showingsData = buildShowings(saturday, sunday);

  console.log(`Generating study showings for weekend: ${saturday} (Sat), ${sunday} (Sun)`);

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

  const rows = ['A', 'B', 'C', 'D', 'E', 'F'];
  const seatsPerRow = 8;
  let seatCount = 0;

  const insertSeat = sqlite.prepare(
    'INSERT INTO seats (id, showing_id, row, number, type, price, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const insertAllSeats = sqlite.transaction(() => {
    for (const showing of showingsData) {
      for (const row of rows) {
        for (let number = 1; number <= seatsPerRow; number++) {
          const profile = seatProfileForShowing(showing, row, number, saturday);

          insertSeat.run(
            `${showing.id}-${row}${number}`,
            showing.id,
            row,
            number,
            profile.type,
            profile.price,
            profile.status
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
