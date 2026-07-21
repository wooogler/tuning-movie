import { db as defaultDb } from '../db';
import type { StudyDb } from './types';

export function getDbFromRequest(request: { study?: { db: StudyDb } }): StudyDb {
  return request.study?.db ?? defaultDb;
}
