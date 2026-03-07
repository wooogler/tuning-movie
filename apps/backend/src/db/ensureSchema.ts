import type Database from 'better-sqlite3';

interface TableInfoRow {
  name: string;
}

function getColumnNames(sqlite: Database.Database, tableName: string): Set<string> {
  return new Set(
    (
      sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as TableInfoRow[]
    ).map((column) => column.name)
  );
}

export function ensureDbSchema(sqlite: Database.Database): void {
  const movieColumnNames = getColumnNames(sqlite, 'movies');
  if (movieColumnNames.size > 0) {
    if (!movieColumnNames.has('age_rating')) {
      sqlite.exec("ALTER TABLE movies ADD COLUMN age_rating TEXT NOT NULL DEFAULT 'NR'");
    }
    if (!movieColumnNames.has('synopsis')) {
      sqlite.exec("ALTER TABLE movies ADD COLUMN synopsis TEXT NOT NULL DEFAULT ''");
    }
  }

  const theaterColumnNames = getColumnNames(sqlite, 'theaters');
  if (theaterColumnNames.size > 0) {
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
  }

  const showingColumnNames = getColumnNames(sqlite, 'showings');
  if (showingColumnNames.size > 0 && !showingColumnNames.has('format')) {
    sqlite.exec("ALTER TABLE showings ADD COLUMN format TEXT NOT NULL DEFAULT 'Standard'");
  }

  const seatColumnNames = getColumnNames(sqlite, 'seats');
  if (seatColumnNames.size > 0 && !seatColumnNames.has('price')) {
    sqlite.exec('ALTER TABLE seats ADD COLUMN price INTEGER NOT NULL DEFAULT 10');
  }
}
