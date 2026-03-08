import '../env';
import fs from 'fs';
import Database from 'better-sqlite3';
import {
  getScenarioById,
  getScenarioTemplatePath,
} from '../study/scenarioCatalog';
import {
  loadScenarioDataset,
  type ScenarioTimeRuleShowing,
} from '../study/scenarioDataset';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function sortedStrings(values: string[]): string[] {
  return values.slice().sort((a, b) => a.localeCompare(b));
}

function sortedNumbers(values: number[]): number[] {
  return values.slice().sort((a, b) => a - b);
}

function normalizeShowings(
  values: ScenarioTimeRuleShowing[]
): ScenarioTimeRuleShowing[] {
  return values
    .slice()
    .sort(
      (a, b) => a.time.localeCompare(b.time) || a.format.localeCompare(b.format)
    );
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

export function verifyScenario(scenarioId: string): void {
  const normalizedScenarioId = scenarioId.trim();
  assert(normalizedScenarioId, 'Scenario id is required.');

  const scenario = getScenarioById(normalizedScenarioId);
  assert(scenario, `Scenario not found: ${normalizedScenarioId}`);

  const dataset = loadScenarioDataset(scenario!);
  const dbPath = getScenarioTemplatePath(scenario!);
  assert(
    fs.existsSync(dbPath),
    `Scenario template DB not found: ${dbPath}`
  );

  const sqlite = new Database(dbPath, { readonly: true });

  try {
    const movieIds = sqlite
      .prepare('SELECT id FROM movies ORDER BY id')
      .all()
      .map((row) => (row as { id: string }).id);
    assert(
      JSON.stringify(sortedStrings(movieIds)) ===
        JSON.stringify(sortedStrings(dataset.assertions.expectedMovieIds)),
      'Movie IDs in DB do not match expectedMovieIds assertion'
    );

    const theaterIds = sqlite
      .prepare('SELECT id FROM theaters ORDER BY id')
      .all()
      .map((row) => (row as { id: string }).id);
    assert(
      JSON.stringify(sortedStrings(theaterIds)) ===
        JSON.stringify(sortedStrings(dataset.assertions.expectedTheaterIds)),
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

    for (const rule of dataset.assertions.timeRules ?? []) {
      const rows = sqlite
        .prepare(
          `SELECT time, format
           FROM showings
           WHERE movie_id = ? AND theater_id = ? AND date = ?
           ORDER BY time, format`
        )
        .all(rule.movieId, rule.theaterId, rule.date) as Array<{
        time: string;
        format: string;
      }>;

      const actualShowings = normalizeShowings(
        rows.map((row) => ({
          time: row.time,
          format: row.format as ScenarioTimeRuleShowing['format'],
        }))
      );
      const expectedShowings = normalizeShowings(rule.expectedShowings);

      assert(
        JSON.stringify(actualShowings) === JSON.stringify(expectedShowings),
        `Time rule mismatch for movie=${rule.movieId}, theater=${rule.theaterId}, date=${rule.date}: expected ${JSON.stringify(
          expectedShowings
        )}, got ${JSON.stringify(actualShowings)}`
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

    for (const rule of dataset.assertions.seatAvailabilityRules ?? []) {
      const rows = sqlite
        .prepare(
          `SELECT number
           FROM seats
           WHERE showing_id = ? AND row = ? AND status = 'available'
           ORDER BY number`
        )
        .all(rule.showingId, rule.row) as Array<{ number: number }>;

      const actualAvailableNumbers = rows.map((row) => row.number);
      const expectedAvailableNumbers = sortedNumbers(rule.expectedAvailableNumbers);

      assert(
        JSON.stringify(actualAvailableNumbers) ===
          JSON.stringify(expectedAvailableNumbers),
        `Seat availability mismatch for showing=${rule.showingId}, row=${rule.row}: expected [${expectedAvailableNumbers.join(
          ', '
        )}], got [${actualAvailableNumbers.join(', ')}]`
      );
    }
  } finally {
    sqlite.close();
  }
}

function readScenarioId(): string {
  const argValue = process.argv
    .slice(2)
    .map((value) => value.trim())
    .find((value) => value.length > 0);
  const envValue = process.env.SCENARIO_ID?.trim();
  const scenarioId = argValue || envValue || '';

  if (!scenarioId) {
    throw new Error(
      'Scenario id is required. Usage: npm run db:verify:scenario -- <scenario_id>'
    );
  }

  return scenarioId;
}

if (require.main === module) {
  try {
    const scenarioId = readScenarioId();
    verifyScenario(scenarioId);
    console.log(`[verify:scenario] PASS - ${scenarioId}`);
  } catch (error) {
    console.error(
      `[verify:scenario] FAIL - ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
