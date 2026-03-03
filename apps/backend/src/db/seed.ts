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
      distance_miles REAL NOT NULL,
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

  const hasDistanceKm = theaterColumnNames.has('distance_km');
  const hasDistanceMiles = theaterColumnNames.has('distance_miles');

  if (!hasDistanceMiles) {
    sqlite.exec('ALTER TABLE theaters ADD COLUMN distance_miles REAL NOT NULL DEFAULT 0');
    if (hasDistanceKm) {
      sqlite.exec('UPDATE theaters SET distance_miles = distance_km');
    }
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
  weekday: string[];
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

const SHOWTIME_SCHEDULE: Record<MovieId, Record<TheaterId, DailySchedule>> = {
  m1: {
    ta: { weekday: ['17:00', '20:00'], saturday: ['14:00', '17:00', '19:30', '21:00'], sunday: ['14:00', '19:00'] },
    tb: { weekday: ['18:30'], saturday: ['15:00', '19:00'], sunday: ['18:30'] },
    tc: { weekday: [], saturday: [], sunday: [] },
    td: { weekday: ['18:00'], saturday: ['17:00'], sunday: [] },
  },
  m2: {
    ta: { weekday: ['19:00'], saturday: ['19:00'], sunday: [] },
    tb: { weekday: ['17:30'], saturday: ['15:00', '18:30'], sunday: ['19:00'] },
    tc: { weekday: ['19:30'], saturday: ['19:00', '21:00'], sunday: ['18:00'] },
    td: { weekday: [], saturday: [], sunday: [] },
  },
  m3: {
    ta: { weekday: ['18:30', '20:30'], saturday: ['15:00', '18:30', '21:00'], sunday: ['14:00', '18:00', '20:30'] },
    tb: { weekday: ['18:00'], saturday: ['14:00', '19:00'], sunday: ['15:00', '18:30'] },
    tc: { weekday: ['19:00'], saturday: ['18:00', '20:30'], sunday: ['14:00', '19:00', '21:00'] },
    td: { weekday: ['18:00'], saturday: ['16:00', '19:00'], sunday: ['15:00', '18:00'] },
  },
  m4: {
    ta: { weekday: ['17:30', '20:00'], saturday: ['14:00', '17:30', '19:30', '21:00'], sunday: ['14:00', '19:30'] },
    tb: { weekday: ['19:00'], saturday: ['15:00', '19:30'], sunday: ['19:00'] },
    tc: { weekday: [], saturday: [], sunday: [] },
    td: { weekday: ['19:00'], saturday: ['18:00'], sunday: [] },
  },
  m5: {
    ta: { weekday: ['20:00'], saturday: ['20:00'], sunday: [] },
    tb: { weekday: ['18:30'], saturday: ['16:00', '19:00'], sunday: ['18:30'] },
    tc: { weekday: ['20:00'], saturday: ['19:30', '21:00'], sunday: ['19:00'] },
    td: { weekday: [], saturday: [], sunday: [] },
  },
  m6: {
    ta: { weekday: ['18:00', '20:30'], saturday: ['15:00', '18:00', '20:30'], sunday: ['14:00', '18:30', '21:00'] },
    tb: { weekday: ['18:30'], saturday: ['14:00', '18:30'], sunday: ['15:00', '19:00'] },
    tc: { weekday: ['19:00'], saturday: ['18:00', '20:00'], sunday: ['14:00', '18:30', '20:30'] },
    td: { weekday: ['18:30'], saturday: ['15:00', '19:00'], sunday: ['14:00', '18:00'] },
  },
  m7: {
    ta: { weekday: ['19:00'], saturday: ['16:00', '19:00'], sunday: ['15:00', '20:00'] },
    tb: { weekday: ['19:30'], saturday: ['18:00', '20:30'], sunday: ['19:00'] },
    tc: { weekday: ['18:30'], saturday: [], sunday: ['17:00'] },
    td: { weekday: [], saturday: [], sunday: [] },
  },
  m8: {
    ta: { weekday: ['18:00'], saturday: ['14:30', '18:00'], sunday: ['13:00', '17:00'] },
    tb: { weekday: ['18:30'], saturday: ['15:00', '19:30'], sunday: ['14:00', '18:00'] },
    tc: { weekday: ['19:00'], saturday: ['17:00'], sunday: ['15:00', '19:00'] },
    td: { weekday: ['18:00'], saturday: [], sunday: ['16:00'] },
  },
};

const AVAILABILITY_DAYS: Record<MovieId, Record<TheaterId, number>> = {
  m1: { ta: 14, tb: 12, tc: 0, td: 9 },
  // Comedy short-run title: ends on 2026-03-13 (3 days from 2026-03-11)
  m2: { ta: 3, tb: 3, tc: 3, td: 0 },
  m3: { ta: 8, tb: 7, tc: 10, td: 8 },
  m4: { ta: 14, tb: 12, tc: 0, td: 9 },
  // Action short-run title: ends on 2026-03-13 (3 days from 2026-03-11)
  m5: { ta: 3, tb: 3, tc: 3, td: 0 },
  m6: { ta: 11, tb: 10, tc: 12, td: 9 },
  m7: { ta: 10, tb: 9, tc: 8, td: 0 },
  m8: { ta: 13, tb: 11, tc: 10, td: 8 },
};

function getDateWeekdayUtc(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function getShowtimesForDate(schedule: DailySchedule, date: string): string[] {
  const weekday = getDateWeekdayUtc(date);
  if (weekday === 6) return schedule.saturday;
  if (weekday === 0) return schedule.sunday;
  return schedule.weekday;
}

function maxAvailabilityDays(): number {
  let maxDays = 0;
  for (const byTheater of Object.values(AVAILABILITY_DAYS)) {
    for (const days of Object.values(byTheater)) {
      if (days > maxDays) maxDays = days;
    }
  }
  return maxDays;
}

function buildShowings(baseDateUtc: Date): ShowingSeed[] {
  const showings: ShowingSeed[] = [];

  for (const movieId of Object.keys(SHOWTIME_SCHEDULE) as MovieId[]) {
    const byTheater = SHOWTIME_SCHEDULE[movieId];

    for (const theaterId of Object.keys(byTheater) as TheaterId[]) {
      const schedule = byTheater[theaterId];
      const availabilityDays = AVAILABILITY_DAYS[movieId][theaterId] ?? 0;
      if (availabilityDays <= 0) continue;

      for (let dayOffset = 0; dayOffset < availabilityDays; dayOffset++) {
        const date = toIsoDate(addDaysUtc(baseDateUtc, dayOffset));
        const showtimes = getShowtimesForDate(schedule, date);
        if (showtimes.length === 0) continue;

        for (const time of showtimes) {
          showings.push({
            id: makeShowingId(movieId, theaterId, date, time),
            movieId,
            theaterId,
            screenNumber: MOVIE_SCREEN_NUMBER[movieId],
            date,
            time,
            totalSeats: 48,
          });
        }
      }
    }
  }

  return showings;
}

function isUnpopularMovie(movieId: string): boolean {
  return movieId === 'm3' || movieId === 'm6';
}

function isTheaterASaturdayPrime(showing: ShowingSeed): boolean {
  if (showing.theaterId !== 'ta' || getDateWeekdayUtc(showing.date) !== 6 || showing.time !== '19:30') {
    return false;
  }
  return showing.movieId === 'm1' || showing.movieId === 'm4';
}

function isTheaterBSaturdayEveningConflict(showing: ShowingSeed): boolean {
  if (showing.theaterId !== 'tb' || getDateWeekdayUtc(showing.date) !== 6) return false;
  return (
    (showing.movieId === 'm1' && showing.time === '19:00') ||
    (showing.movieId === 'm4' && showing.time === '19:30')
  );
}

function getPriceProfile(showing: ShowingSeed): PriceProfile {
  if (isTheaterASaturdayPrime(showing)) {
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

function getSeatStatus(showing: ShowingSeed, row: string, number: number): SeatStatus {
  if (isTheaterASaturdayPrime(showing)) {
    if (row === 'A' || row === 'B') return 'available';
    if (row === 'C') return [4, 5].includes(number) ? 'available' : 'occupied';
    if (row === 'D') return [4, 5].includes(number) ? 'available' : 'occupied';
    if (row === 'E') return number === 6 ? 'available' : 'occupied';
    return 'occupied';
  }

  if (isTheaterBSaturdayEveningConflict(showing)) {
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
  number: number
): { type: 'standard' | 'premium'; price: number; status: SeatStatus } {
  const priceProfile = getPriceProfile(showing);
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
    status: getSeatStatus(showing, row, number),
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
      title: 'Midnight Bachelors',
      posterUrl: 'https://placehold.co/300x450?text=Midnight+Bachelors',
      genre: JSON.stringify(['Comedy']),
      duration: 100,
      rating: '4.5',
      releaseDate: '2024-06-14',
    },
    {
      id: 'm2',
      title: 'Hall Pass High',
      posterUrl: 'https://placehold.co/300x450?text=Hall+Pass+High',
      genre: JSON.stringify(['Comedy']),
      duration: 113,
      rating: '4.1',
      releaseDate: '2025-02-21',
    },
    {
      id: 'm3',
      title: 'Desk for Two',
      posterUrl: 'https://placehold.co/300x450?text=Desk+for+Two',
      genre: JSON.stringify(['Comedy', 'Drama']),
      duration: 121,
      rating: '3.8',
      releaseDate: '2025-08-08',
    },
    {
      id: 'm4',
      title: 'Shadow Sentinel',
      posterUrl: 'https://placehold.co/300x450?text=Shadow+Sentinel',
      genre: JSON.stringify(['Action']),
      duration: 152,
      rating: '4.7',
      releaseDate: '2024-11-22',
    },
    {
      id: 'm5',
      title: 'Black Ledger: Retribution',
      posterUrl: 'https://placehold.co/300x450?text=Black+Ledger+Retribution',
      genre: JSON.stringify(['Action']),
      duration: 169,
      rating: '4.3',
      releaseDate: '2025-01-17',
    },
    {
      id: 'm6',
      title: 'Skyline Vortex',
      posterUrl: 'https://placehold.co/300x450?text=Skyline+Vortex',
      genre: JSON.stringify(['Action', 'Drama']),
      duration: 131,
      rating: '3.9',
      releaseDate: '2024-09-13',
    },
    {
      id: 'm7',
      title: 'Vanishing Point',
      posterUrl: 'https://placehold.co/300x450?text=Vanishing+Point',
      genre: JSON.stringify(['Thriller']),
      duration: 149,
      rating: '4.4',
      releaseDate: '2025-10-03',
    },
    {
      id: 'm8',
      title: 'City of Starlight',
      posterUrl: 'https://placehold.co/300x450?text=City+of+Starlight',
      genre: JSON.stringify(['Romance']),
      duration: 128,
      rating: '4.2',
      releaseDate: '2025-12-12',
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
      distanceMiles: 1.2,
      amenities: JSON.stringify(['Premium Large Format', 'Reserved Seating']),
    },
    {
      id: 'tb',
      name: 'AMC 34th Street 14',
      location: 'Midtown, Manhattan, New York, NY',
      screenCount: 14,
      distanceMiles: 2.8,
      amenities: JSON.stringify(['Reserved Seating']),
    },
    {
      id: 'tc',
      name: 'AMC Magic Johnson Harlem 9',
      location: 'Harlem, Manhattan, New York, NY',
      screenCount: 9,
      distanceMiles: 6.1,
      amenities: JSON.stringify(['Reserved Seating']),
    },
    {
      id: 'td',
      name: 'AMC Bay Plaza Cinema 13',
      location: 'Baychester, Bronx, New York, NY',
      screenCount: 13,
      distanceMiles: 15.4,
      amenities: JSON.stringify(['Reserved Seating']),
    },
  ];

  for (const theater of theatersData) {
    db.insert(schema.theaters).values(theater).run();
  }
  console.log('Inserted theaters');

  const fixedDate = getFixedCurrentDateUtc();
  const startDate = toIsoDate(fixedDate);
  const maxDays = maxAvailabilityDays();
  const endDate = toIsoDate(addDaysUtc(fixedDate, Math.max(0, maxDays - 1)));
  const showingsData = buildShowings(fixedDate);

  console.log(
    `Generating study showings from ${startDate} to ${endDate} (movie/theater-specific availability)`
  );

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
          const profile = seatProfileForShowing(showing, row, number);

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
