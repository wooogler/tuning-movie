import '../env';
import fs from 'fs';
import Database from 'better-sqlite3';
import {
  getScenarioById,
  getScenarioCatalog,
  getScenarioTemplatePath,
} from '../study/scenarioCatalog';
import { loadScenarioDataset } from '../study/scenarioDataset';

const TARGET_SCENARIO_ID = 'scn_t1_college_weekend';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function sorted(values: string[]): string[] {
  return values.slice().sort((a, b) => a.localeCompare(b));
}

function maxAdjacentAvailable(
  seats: Array<{ number: number; status: string }>
): number {
  const sortedSeats = seats.slice().sort((a, b) => a.number - b.number);
  let best = 0;
  let streak = 0;
  let prevNumber: number | null = null;

  for (const seat of sortedSeats) {
    if (seat.status !== 'available') {
      streak = 0;
      prevNumber = seat.number;
      continue;
    }

    if (prevNumber !== null && seat.number === prevNumber + 1) {
      streak += 1;
    } else {
      streak = 1;
    }

    if (streak > best) best = streak;
    prevNumber = seat.number;
  }

  return best;
}

function verify(): void {
  const scenarios = getScenarioCatalog(true);
  assert(
    scenarios.length === 1 && scenarios[0]?.id === TARGET_SCENARIO_ID,
    `Expected catalog to contain only ${TARGET_SCENARIO_ID}`
  );

  const scenario = getScenarioById(TARGET_SCENARIO_ID);
  assert(scenario, `Scenario not found: ${TARGET_SCENARIO_ID}`);

  const dataset = loadScenarioDataset(scenario!);
  const dbPath = getScenarioTemplatePath(scenario!);
  assert(fs.existsSync(dbPath), `Scenario template DB not found: ${dbPath}`);

  const sqlite = new Database(dbPath, { readonly: true });
  try {
    const movieIds = sqlite
      .prepare('SELECT id FROM movies ORDER BY id')
      .all()
      .map((row) => (row as { id: string }).id);
    assert(
      JSON.stringify(sorted(movieIds)) ===
        JSON.stringify(sorted(dataset.assertions.expectedMovieIds)),
      'Movie IDs in DB do not match expectedMovieIds assertion'
    );

    const theaterIds = sqlite
      .prepare('SELECT id FROM theaters ORDER BY id')
      .all()
      .map((row) => (row as { id: string }).id);
    assert(
      JSON.stringify(sorted(theaterIds)) ===
        JSON.stringify(sorted(dataset.assertions.expectedTheaterIds)),
      'Theater IDs in DB do not match expectedTheaterIds assertion'
    );

    for (const check of dataset.assertions.theaterDistanceChecks ?? []) {
      const distanceRow = sqlite
        .prepare('SELECT distance_miles AS distanceMiles FROM theaters WHERE id = ?')
        .get(check.theaterId) as { distanceMiles: number } | undefined;
      if (!distanceRow) {
        throw new Error(`Missing theater for distance check: ${check.theaterId}`);
      }
      const actualDistance = Number(distanceRow.distanceMiles);
      assert(
        actualDistance === Number(check.distanceMiles),
        `Theater ${check.theaterId} distance mismatch: expected ${check.distanceMiles}, got ${actualDistance}`
      );
    }

    for (const rule of dataset.assertions.dateRules) {
      const rows = sqlite
        .prepare(
          `SELECT DISTINCT date
           FROM showings
           WHERE movie_id = ? AND theater_id = ?
           ORDER BY date`
        )
        .all(rule.movieId, rule.theaterId) as Array<{ date: string }>;
      const actualDates = rows.map((row) => row.date);

      assert(
        JSON.stringify(actualDates) === JSON.stringify(rule.expectedDates),
        `Date rule mismatch for movie=${rule.movieId}, theater=${rule.theaterId}: expected [${rule.expectedDates.join(
          ', '
        )}], got [${actualDates.join(', ')}]`
      );
    }

    for (const rule of dataset.assertions.adjacencyRules) {
      const seats = sqlite
        .prepare(
          `SELECT number, status
           FROM seats
           WHERE showing_id = ? AND row = ?
           ORDER BY number`
        )
        .all(rule.showingId, rule.row) as Array<{ number: number; status: string }>;

      assert(
        seats.length > 0,
        `No seats found for adjacency rule showing=${rule.showingId}, row=${rule.row}`
      );
      const maxAdjacent = maxAdjacentAvailable(seats);

      if (typeof rule.minAdjacentAvailable === 'number') {
        assert(
          maxAdjacent >= rule.minAdjacentAvailable,
          `Adjacency min check failed for showing=${rule.showingId}, row=${rule.row}: expected >= ${rule.minAdjacentAvailable}, got ${maxAdjacent}`
        );
      }
      if (typeof rule.maxAdjacentAvailable === 'number') {
        assert(
          maxAdjacent <= rule.maxAdjacentAvailable,
          `Adjacency max check failed for showing=${rule.showingId}, row=${rule.row}: expected <= ${rule.maxAdjacentAvailable}, got ${maxAdjacent}`
        );
      }
    }
  } finally {
    sqlite.close();
  }
}

try {
  verify();
  console.log('[verify:t1] PASS - scenario dataset and DB constraints are valid.');
} catch (error) {
  console.error(
    `[verify:t1] FAIL - ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
