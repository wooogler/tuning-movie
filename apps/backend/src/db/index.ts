import '../env';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { ensureDbSchema } from './ensureSchema';

const dbPath = process.env.DATABASE_URL || 'tuning-movie.db';
const sqlite = new Database(dbPath);
ensureDbSchema(sqlite);
export const db = drizzle(sqlite, { schema });

export * from './schema';
