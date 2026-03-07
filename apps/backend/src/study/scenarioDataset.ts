import fs from 'fs';
import path from 'path';
import { resolveScenarioCatalogPath } from './scenarioCatalog';
import type { ScenarioDefinition } from './types';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

type SeatType = 'standard' | 'premium' | 'couple';
type SeatStatus = 'available' | 'occupied';
type ShowingFormat = 'Standard' | 'IMAX' | '3D';

export interface ScenarioDatasetMovie {
  id: string;
  title: string;
  genre: string[];
  duration: number;
  rating: string;
  ageRating: string;
  synopsis: string;
  releaseDate: string;
}

export interface ScenarioDatasetTheater {
  id: string;
  name: string;
  location: string;
  screenCount: number;
  distanceMiles: number;
  amenities: string[];
}

export interface ScenarioDatasetShowing {
  id: string;
  movieId: string;
  theaterId: string;
  screenNumber: number;
  date: string;
  time: string;
  format: ShowingFormat;
  totalSeats: number;
}

export interface ScenarioSeatTemplateRowRule {
  row: string;
  type?: SeatType;
  price?: number;
}

export interface ScenarioSeatTemplate {
  rows: string[];
  seatsPerRow: number;
  defaultType: SeatType;
  defaultPrice: number;
  defaultStatus?: SeatStatus;
  rowRules?: ScenarioSeatTemplateRowRule[];
}

export interface ScenarioSeatOverride {
  showingId: string;
  row: string;
  occupiedNumbers?: number[];
  availableNumbers?: number[];
}

export interface ScenarioDateRule {
  movieId: string;
  theaterId: string;
  expectedDates: string[];
}

export interface ScenarioAdjacencyRule {
  showingId: string;
  row: string;
  minAdjacentAvailable?: number;
  maxAdjacentAvailable?: number;
}

export interface ScenarioTheaterDistanceCheck {
  theaterId: string;
  distanceMiles: number;
}

export interface ScenarioDatasetAssertions {
  expectedMovieIds: string[];
  expectedTheaterIds: string[];
  theaterDistanceChecks?: ScenarioTheaterDistanceCheck[];
  dateRules: ScenarioDateRule[];
  adjacencyRules: ScenarioAdjacencyRule[];
}

export interface ScenarioDataset {
  movies: ScenarioDatasetMovie[];
  theaters: ScenarioDatasetTheater[];
  showings: ScenarioDatasetShowing[];
  seatTemplate: ScenarioSeatTemplate;
  seatOverrides: ScenarioSeatOverride[];
  assertions: ScenarioDatasetAssertions;
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
  return normalized.length === value.length ? normalized : null;
}

function readInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (!Number.isInteger(value)) return null;
  return value;
}

function readPositiveInteger(value: unknown): number | null {
  const parsed = readInteger(value);
  if (parsed === null || parsed <= 0) return null;
  return parsed;
}

function readNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return value;
}

function readShowingFormat(value: unknown): ShowingFormat | null {
  if (value === 'Standard' || value === 'IMAX' || value === '3D') {
    return value;
  }
  return null;
}

function validateDate(value: string): boolean {
  return ISO_DATE_PATTERN.test(value);
}

function validateTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

function assertUniqueIds(ids: string[], label: string, scenarioId: string): void {
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new Error(`[${scenarioId}] Duplicate ${label} id: ${duplicates[0]}`);
  }
}

function parseMovie(raw: unknown, index: number, scenarioId: string): ScenarioDatasetMovie {
  const record = toObject(raw);
  if (!record) {
    throw new Error(`[${scenarioId}] movies[${index}] must be an object`);
  }

  const id = readString(record.id);
  const title = readString(record.title);
  const genre = readStringArray(record.genre);
  const duration = readPositiveInteger(record.duration);
  const rating = readString(record.rating);
  const ageRating = readString(record.ageRating) ?? 'NR';
  const synopsis = readString(record.synopsis) ?? '';
  const releaseDate = readString(record.releaseDate);

  if (!id || !title || !genre || duration === null || !rating || !releaseDate) {
    throw new Error(`[${scenarioId}] movies[${index}] has invalid fields`);
  }
  if (!validateDate(releaseDate)) {
    throw new Error(`[${scenarioId}] movies[${index}].releaseDate must be YYYY-MM-DD`);
  }

  return {
    id,
    title,
    genre,
    duration,
    rating,
    ageRating,
    synopsis,
    releaseDate,
  };
}

function parseTheater(raw: unknown, index: number, scenarioId: string): ScenarioDatasetTheater {
  const record = toObject(raw);
  if (!record) {
    throw new Error(`[${scenarioId}] theaters[${index}] must be an object`);
  }

  const id = readString(record.id);
  const name = readString(record.name);
  const location = readString(record.location);
  const screenCount = readPositiveInteger(record.screenCount);
  const distanceMiles = readNonNegativeNumber(record.distanceMiles);
  const amenities = readStringArray(record.amenities);

  if (
    !id ||
    !name ||
    !location ||
    screenCount === null ||
    distanceMiles === null ||
    !amenities
  ) {
    throw new Error(`[${scenarioId}] theaters[${index}] has invalid fields`);
  }

  return {
    id,
    name,
    location,
    screenCount,
    distanceMiles,
    amenities,
  };
}

function parseShowing(raw: unknown, index: number, scenarioId: string): ScenarioDatasetShowing {
  const record = toObject(raw);
  if (!record) {
    throw new Error(`[${scenarioId}] showings[${index}] must be an object`);
  }

  const id = readString(record.id);
  const movieId = readString(record.movieId);
  const theaterId = readString(record.theaterId);
  const screenNumber = readPositiveInteger(record.screenNumber);
  const date = readString(record.date);
  const time = readString(record.time);
  const format = readShowingFormat(record.format) ?? 'Standard';
  const totalSeats = readPositiveInteger(record.totalSeats);

  if (
    !id ||
    !movieId ||
    !theaterId ||
    screenNumber === null ||
    !date ||
    !time ||
    totalSeats === null
  ) {
    throw new Error(`[${scenarioId}] showings[${index}] has invalid fields`);
  }
  if (!validateDate(date)) {
    throw new Error(`[${scenarioId}] showings[${index}].date must be YYYY-MM-DD`);
  }
  if (!validateTime(time)) {
    throw new Error(`[${scenarioId}] showings[${index}].time must be HH:MM`);
  }

  return {
    id,
    movieId,
    theaterId,
    screenNumber,
    date,
    time,
    format,
    totalSeats,
  };
}

function parseSeatTemplate(raw: unknown, scenarioId: string): ScenarioSeatTemplate {
  const record = toObject(raw);
  if (!record) {
    throw new Error(`[${scenarioId}] seatTemplate must be an object`);
  }

  const rows = readStringArray(record.rows);
  const seatsPerRow = readPositiveInteger(record.seatsPerRow);
  const defaultType = readString(record.defaultType) as SeatType | null;
  const defaultPrice = readPositiveInteger(record.defaultPrice);
  const defaultStatus = readString(record.defaultStatus) as SeatStatus | null;

  if (!rows || seatsPerRow === null || !defaultType || defaultPrice === null) {
    throw new Error(`[${scenarioId}] seatTemplate has invalid required fields`);
  }
  if (!['standard', 'premium', 'couple'].includes(defaultType)) {
    throw new Error(`[${scenarioId}] seatTemplate.defaultType is invalid`);
  }
  if (defaultStatus && !['available', 'occupied'].includes(defaultStatus)) {
    throw new Error(`[${scenarioId}] seatTemplate.defaultStatus is invalid`);
  }
  assertUniqueIds(rows, 'seat row', scenarioId);

  let rowRules: ScenarioSeatTemplateRowRule[] | undefined;
  if (record.rowRules !== undefined) {
    if (!Array.isArray(record.rowRules)) {
      throw new Error(`[${scenarioId}] seatTemplate.rowRules must be an array`);
    }

    rowRules = record.rowRules.map((entry, index) => {
      const rowRule = toObject(entry);
      if (!rowRule) {
        throw new Error(`[${scenarioId}] seatTemplate.rowRules[${index}] must be an object`);
      }
      const row = readString(rowRule.row);
      const type = rowRule.type === undefined ? undefined : (readString(rowRule.type) as SeatType | null);
      const price = rowRule.price === undefined ? undefined : readPositiveInteger(rowRule.price);

      if (!row) {
        throw new Error(`[${scenarioId}] seatTemplate.rowRules[${index}].row is required`);
      }
      if (!rows.includes(row)) {
        throw new Error(`[${scenarioId}] seatTemplate.rowRules[${index}] references unknown row`);
      }
      if (type && !['standard', 'premium', 'couple'].includes(type)) {
        throw new Error(`[${scenarioId}] seatTemplate.rowRules[${index}].type is invalid`);
      }
      if (rowRule.price !== undefined && price === null) {
        throw new Error(`[${scenarioId}] seatTemplate.rowRules[${index}].price is invalid`);
      }

      return {
        row,
        ...(type ? { type } : {}),
        ...(typeof price === 'number' ? { price } : {}),
      };
    });

    assertUniqueIds(
      rowRules.map((item) => item.row),
      'seatTemplate rowRules',
      scenarioId
    );
  }

  return {
    rows,
    seatsPerRow,
    defaultType,
    defaultPrice,
    ...(defaultStatus ? { defaultStatus } : {}),
    ...(rowRules ? { rowRules } : {}),
  };
}

function parseSeatOverrides(raw: unknown, scenarioId: string): ScenarioSeatOverride[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`[${scenarioId}] seatOverrides must be an array`);
  }

  return raw.map((entry, index) => {
    const record = toObject(entry);
    if (!record) {
      throw new Error(`[${scenarioId}] seatOverrides[${index}] must be an object`);
    }
    const showingId = readString(record.showingId);
    const row = readString(record.row);
    const occupiedNumbers = record.occupiedNumbers;
    const availableNumbers = record.availableNumbers;

    const normalizeNumberArray = (value: unknown, label: string): number[] | undefined => {
      if (value === undefined) return undefined;
      if (!Array.isArray(value)) {
        throw new Error(`[${scenarioId}] seatOverrides[${index}].${label} must be an array`);
      }
      const parsed = value.map((item) => readPositiveInteger(item));
      if (parsed.some((item) => item === null)) {
        throw new Error(`[${scenarioId}] seatOverrides[${index}].${label} must contain integers`);
      }
      const numbers = parsed as number[];
      assertUniqueIds(
        numbers.map((item) => String(item)),
        `seatOverrides[${index}].${label}`,
        scenarioId
      );
      return numbers;
    };

    if (!showingId || !row) {
      throw new Error(`[${scenarioId}] seatOverrides[${index}] has invalid required fields`);
    }

    const parsedOccupied = normalizeNumberArray(occupiedNumbers, 'occupiedNumbers');
    const parsedAvailable = normalizeNumberArray(availableNumbers, 'availableNumbers');

    if (!parsedOccupied && !parsedAvailable) {
      throw new Error(`[${scenarioId}] seatOverrides[${index}] must include occupiedNumbers or availableNumbers`);
    }

    return {
      showingId,
      row,
      ...(parsedOccupied ? { occupiedNumbers: parsedOccupied } : {}),
      ...(parsedAvailable ? { availableNumbers: parsedAvailable } : {}),
    };
  });
}

function parseAssertions(raw: unknown, scenarioId: string): ScenarioDatasetAssertions {
  const record = toObject(raw);
  if (!record) {
    throw new Error(`[${scenarioId}] assertions must be an object`);
  }

  const expectedMovieIds = readStringArray(record.expectedMovieIds);
  const expectedTheaterIds = readStringArray(record.expectedTheaterIds);
  if (!expectedMovieIds || !expectedTheaterIds) {
    throw new Error(`[${scenarioId}] assertions.expectedMovieIds/expectedTheaterIds are required`);
  }

  const parseDateRules = (value: unknown): ScenarioDateRule[] => {
    if (!Array.isArray(value)) {
      throw new Error(`[${scenarioId}] assertions.dateRules must be an array`);
    }
    return value.map((entry, index) => {
      const item = toObject(entry);
      if (!item) {
        throw new Error(`[${scenarioId}] assertions.dateRules[${index}] must be an object`);
      }
      const movieId = readString(item.movieId);
      const theaterId = readString(item.theaterId);
      const expectedDates = readStringArray(item.expectedDates);
      if (!movieId || !theaterId || !expectedDates) {
        throw new Error(`[${scenarioId}] assertions.dateRules[${index}] has invalid fields`);
      }
      if (!expectedDates.every(validateDate)) {
        throw new Error(`[${scenarioId}] assertions.dateRules[${index}].expectedDates has invalid date`);
      }
      return { movieId, theaterId, expectedDates };
    });
  };

  const parseAdjacencyRules = (value: unknown): ScenarioAdjacencyRule[] => {
    if (!Array.isArray(value)) {
      throw new Error(`[${scenarioId}] assertions.adjacencyRules must be an array`);
    }
    return value.map((entry, index) => {
      const item = toObject(entry);
      if (!item) {
        throw new Error(`[${scenarioId}] assertions.adjacencyRules[${index}] must be an object`);
      }
      const showingId = readString(item.showingId);
      const row = readString(item.row);
      const parsedMin =
        item.minAdjacentAvailable === undefined
          ? undefined
          : readPositiveInteger(item.minAdjacentAvailable);
      const parsedMax =
        item.maxAdjacentAvailable === undefined
          ? undefined
          : readPositiveInteger(item.maxAdjacentAvailable);

      if (!showingId || !row) {
        throw new Error(`[${scenarioId}] assertions.adjacencyRules[${index}] has invalid fields`);
      }
      if (item.minAdjacentAvailable !== undefined && parsedMin === null) {
        throw new Error(`[${scenarioId}] assertions.adjacencyRules[${index}].minAdjacentAvailable is invalid`);
      }
      if (item.maxAdjacentAvailable !== undefined && parsedMax === null) {
        throw new Error(`[${scenarioId}] assertions.adjacencyRules[${index}].maxAdjacentAvailable is invalid`);
      }
      const minAdjacentAvailable = parsedMin ?? undefined;
      const maxAdjacentAvailable = parsedMax ?? undefined;
      if (minAdjacentAvailable === undefined && maxAdjacentAvailable === undefined) {
        throw new Error(`[${scenarioId}] assertions.adjacencyRules[${index}] requires min or max adjacent`);
      }
      return {
        showingId,
        row,
        ...(minAdjacentAvailable !== undefined ? { minAdjacentAvailable } : {}),
        ...(maxAdjacentAvailable !== undefined ? { maxAdjacentAvailable } : {}),
      };
    });
  };

  const parseDistanceChecks = (value: unknown): ScenarioTheaterDistanceCheck[] | undefined => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
      throw new Error(`[${scenarioId}] assertions.theaterDistanceChecks must be an array`);
    }
    return value.map((entry, index) => {
      const item = toObject(entry);
      if (!item) {
        throw new Error(`[${scenarioId}] assertions.theaterDistanceChecks[${index}] must be an object`);
      }
      const theaterId = readString(item.theaterId);
      const distanceMiles = readNonNegativeNumber(item.distanceMiles);
      if (!theaterId || distanceMiles === null) {
        throw new Error(`[${scenarioId}] assertions.theaterDistanceChecks[${index}] has invalid fields`);
      }
      return { theaterId, distanceMiles };
    });
  };

  const theaterDistanceChecks = parseDistanceChecks(record.theaterDistanceChecks);

  return {
    expectedMovieIds,
    expectedTheaterIds,
    dateRules: parseDateRules(record.dateRules),
    adjacencyRules: parseAdjacencyRules(record.adjacencyRules),
    ...(theaterDistanceChecks ? { theaterDistanceChecks } : {}),
  };
}

function validateReferences(dataset: ScenarioDataset, scenarioId: string): void {
  const movieIds = dataset.movies.map((movie) => movie.id);
  const theaterIds = dataset.theaters.map((theater) => theater.id);
  const showingIds = dataset.showings.map((showing) => showing.id);

  assertUniqueIds(movieIds, 'movie', scenarioId);
  assertUniqueIds(theaterIds, 'theater', scenarioId);
  assertUniqueIds(showingIds, 'showing', scenarioId);

  const movieSet = new Set(movieIds);
  const theaterSet = new Set(theaterIds);
  const showingSet = new Set(showingIds);
  const rowSet = new Set(dataset.seatTemplate.rows);

  for (const showing of dataset.showings) {
    if (!movieSet.has(showing.movieId)) {
      throw new Error(`[${scenarioId}] showing ${showing.id} references unknown movieId ${showing.movieId}`);
    }
    if (!theaterSet.has(showing.theaterId)) {
      throw new Error(`[${scenarioId}] showing ${showing.id} references unknown theaterId ${showing.theaterId}`);
    }
  }

  for (const override of dataset.seatOverrides) {
    if (!showingSet.has(override.showingId)) {
      throw new Error(`[${scenarioId}] seatOverride references unknown showingId ${override.showingId}`);
    }
    if (!rowSet.has(override.row)) {
      throw new Error(`[${scenarioId}] seatOverride references unknown row ${override.row}`);
    }
    for (const number of [...(override.occupiedNumbers ?? []), ...(override.availableNumbers ?? [])]) {
      if (number < 1 || number > dataset.seatTemplate.seatsPerRow) {
        throw new Error(`[${scenarioId}] seatOverride has out-of-range seat number ${number}`);
      }
    }
  }

  for (const movieId of dataset.assertions.expectedMovieIds) {
    if (!movieSet.has(movieId)) {
      throw new Error(`[${scenarioId}] assertions.expectedMovieIds references unknown id ${movieId}`);
    }
  }
  for (const theaterId of dataset.assertions.expectedTheaterIds) {
    if (!theaterSet.has(theaterId)) {
      throw new Error(`[${scenarioId}] assertions.expectedTheaterIds references unknown id ${theaterId}`);
    }
  }

  for (const rule of dataset.assertions.dateRules) {
    if (!movieSet.has(rule.movieId) || !theaterSet.has(rule.theaterId)) {
      throw new Error(`[${scenarioId}] assertions.dateRules references unknown movie/theater`);
    }
  }

  for (const rule of dataset.assertions.adjacencyRules) {
    if (!showingSet.has(rule.showingId)) {
      throw new Error(`[${scenarioId}] assertions.adjacencyRules references unknown showingId ${rule.showingId}`);
    }
    if (!rowSet.has(rule.row)) {
      throw new Error(`[${scenarioId}] assertions.adjacencyRules references unknown row ${rule.row}`);
    }
  }

  for (const check of dataset.assertions.theaterDistanceChecks ?? []) {
    if (!theaterSet.has(check.theaterId)) {
      throw new Error(`[${scenarioId}] assertions.theaterDistanceChecks references unknown theaterId ${check.theaterId}`);
    }
  }
}

function parseScenarioDataset(raw: unknown, scenarioId: string): ScenarioDataset {
  const record = toObject(raw);
  if (!record) {
    throw new Error(`[${scenarioId}] seed dataset must be an object`);
  }
  if (!Array.isArray(record.movies) || !Array.isArray(record.theaters) || !Array.isArray(record.showings)) {
    throw new Error(`[${scenarioId}] seed dataset requires movies, theaters, showings arrays`);
  }

  const dataset: ScenarioDataset = {
    movies: record.movies.map((movie, index) => parseMovie(movie, index, scenarioId)),
    theaters: record.theaters.map((theater, index) => parseTheater(theater, index, scenarioId)),
    showings: record.showings.map((showing, index) => parseShowing(showing, index, scenarioId)),
    seatTemplate: parseSeatTemplate(record.seatTemplate, scenarioId),
    seatOverrides: parseSeatOverrides(record.seatOverrides, scenarioId),
    assertions: parseAssertions(record.assertions, scenarioId),
  };

  validateReferences(dataset, scenarioId);
  return dataset;
}

export function resolveScenarioSeedDataPath(scenario: ScenarioDefinition): string | null {
  if (!scenario.seedDataFile) return null;
  const catalogPath = resolveScenarioCatalogPath();
  return path.resolve(path.dirname(catalogPath), scenario.seedDataFile);
}

export function loadScenarioDataset(scenario: ScenarioDefinition): ScenarioDataset {
  const dataPath = resolveScenarioSeedDataPath(scenario);
  if (!dataPath) {
    throw new Error(`[${scenario.id}] seedDataFile is required for dataset loading`);
  }
  if (!fs.existsSync(dataPath)) {
    throw new Error(`[${scenario.id}] seed dataset not found: ${dataPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as unknown;
  return parseScenarioDataset(parsed, scenario.id);
}
