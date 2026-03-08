import { createHash } from 'node:crypto';
import type {
  ActiveConflict,
  ConflictScope,
  ConflictStage,
  DeadEnd,
  Preference,
} from '../types';
import { CONFLICT_STAGES as CONFLICT_STAGE_VALUES } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'item';
}

function shortHash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 10);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  if (!isRecord(value)) {
    return JSON.stringify(value);
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function normalizeScopeValue(value: unknown): string | undefined {
  const text = readTrimmedString(value);
  return text ? normalizeWhitespace(text) : undefined;
}

function scopeWithStage(stage: ConflictStage): ConflictScope {
  return { stage };
}

function normalizePreferenceStages(stages: readonly ConflictStage[] | undefined): ConflictStage[] {
  const normalized: ConflictStage[] = [];
  const seen = new Set<ConflictStage>();
  for (const stage of stages ?? []) {
    if (!CONFLICT_STAGE_VALUES.includes(stage) || seen.has(stage)) continue;
    seen.add(stage);
    normalized.push(stage);
  }
  return normalized.length > 0 ? normalized : CONFLICT_STAGE_VALUES.slice();
}

function readScopeField(
  selection: unknown,
  keys: string[]
): string | undefined {
  if (!isRecord(selection)) return undefined;
  for (const key of keys) {
    const value = normalizeScopeValue(selection[key]);
    if (value) return value;
  }
  return undefined;
}

export function buildConflictScope(
  stage: ConflictStage,
  state: Record<string, unknown> | null
): ConflictScope {
  const scope = scopeWithStage(stage);
  if (!state) return scope;

  const movie = readScopeField(state.movie, ['title', 'value', 'name', 'id']);
  const theater = readScopeField(state.theater, ['name', 'value', 'title', 'id']);
  const date = readScopeField(state.date, ['date', 'displayText', 'value', 'id']);
  const showing = readScopeField(state.showing, ['time', 'displayText', 'value', 'id']);

  if (movie) scope.movie = movie;
  if (theater) scope.theater = theater;
  if (date) scope.date = date;
  if (showing) scope.showing = showing;
  return scope;
}

export function normalizePreferenceList(preferences: Preference[]): Preference[] {
  const deduped = new Map<string, Preference>();
  for (const preference of preferences) {
    const description = normalizeWhitespace(preference.description);
    if (!description) continue;
    const strength = preference.strength === 'soft' ? 'soft' : 'hard';
    const id = preference.id.trim();
    if (!id) continue;
    const relevantStages = normalizePreferenceStages(preference.relevantStages);
    const existing = deduped.get(id);
    deduped.set(id, {
      id,
      description,
      strength,
      relevantStages: existing
        ? normalizePreferenceStages([...existing.relevantStages, ...relevantStages])
        : relevantStages,
    });
  }
  return Array.from(deduped.values());
}

export function normalizeActiveConflicts(conflicts: ActiveConflict[]): ActiveConflict[] {
  const deduped = new Map<string, ActiveConflict>();
  for (const conflict of conflicts) {
    const id = conflict.id.trim();
    const reason = normalizeWhitespace(conflict.reason);
    const preferenceIds = Array.from(
      new Set(conflict.preferenceIds.map((item) => item.trim()).filter(Boolean))
    );
    if (!id || !reason || preferenceIds.length === 0) continue;
    const severity = conflict.severity === 'soft' ? 'soft' : 'blocking';
    const scope = normalizeConflictScope(conflict.scope);
    deduped.set(id, {
      id,
      preferenceIds,
      scope,
      severity,
      reason,
    });
  }
  return Array.from(deduped.values());
}

export function normalizeDeadEnds(deadEnds: DeadEnd[]): DeadEnd[] {
  const deduped = new Map<string, DeadEnd>();
  for (const deadEnd of deadEnds) {
    const id = deadEnd.id.trim();
    const reason = normalizeWhitespace(deadEnd.reason);
    const preferenceIds = Array.from(
      new Set(deadEnd.preferenceIds.map((item) => item.trim()).filter(Boolean))
    );
    if (!id || !reason || preferenceIds.length === 0) continue;
    const normalized: DeadEnd = {
      id,
      preferenceIds,
      scope: normalizeConflictScope(deadEnd.scope),
      reason,
      createdAt: deadEnd.createdAt,
      lastSeenAt: deadEnd.lastSeenAt,
      count: Math.max(1, Math.floor(deadEnd.count)),
    };
    const existing = deduped.get(id);
    if (!existing) {
      deduped.set(id, normalized);
      continue;
    }
    deduped.set(id, {
      ...existing,
      count: Math.max(existing.count, normalized.count),
      createdAt: existing.createdAt <= normalized.createdAt ? existing.createdAt : normalized.createdAt,
      lastSeenAt: existing.lastSeenAt >= normalized.lastSeenAt ? existing.lastSeenAt : normalized.lastSeenAt,
    });
  }
  return Array.from(deduped.values());
}

export function buildPreferenceId(description: string, strength: Preference['strength']): string {
  const normalizedDescription = normalizeWhitespace(description).toLowerCase();
  const base = `${strength}:${normalizedDescription}`;
  return `pref_${slugify(normalizedDescription)}_${shortHash(base)}`;
}

export function normalizeConflictScope(scope: ConflictScope): ConflictScope {
  return {
    stage: scope.stage,
    ...(normalizeScopeValue(scope.movie) ? { movie: normalizeScopeValue(scope.movie) } : {}),
    ...(normalizeScopeValue(scope.theater) ? { theater: normalizeScopeValue(scope.theater) } : {}),
    ...(normalizeScopeValue(scope.date) ? { date: normalizeScopeValue(scope.date) } : {}),
    ...(normalizeScopeValue(scope.showing) ? { showing: normalizeScopeValue(scope.showing) } : {}),
  };
}

export function buildActiveConflictId(conflict: Omit<ActiveConflict, 'id'>): string {
  const normalized = {
    preferenceIds: Array.from(new Set(conflict.preferenceIds)).sort(),
    scope: normalizeConflictScope(conflict.scope),
    severity: conflict.severity,
    reason: normalizeWhitespace(conflict.reason),
  };
  const base = stableJson(normalized);
  return `conf_${shortHash(base)}`;
}

export function buildDeadEndId(deadEnd: Omit<DeadEnd, 'id' | 'createdAt' | 'lastSeenAt' | 'count'>): string {
  const normalized = {
    preferenceIds: Array.from(new Set(deadEnd.preferenceIds)).sort(),
    scope: normalizeConflictScope(deadEnd.scope),
    reason: normalizeWhitespace(deadEnd.reason),
  };
  const base = stableJson(normalized);
  return `dead_${shortHash(base)}`;
}

export function materializeDeadEndsFromConflicts(
  conflicts: ActiveConflict[],
  timestamp: string
): DeadEnd[] {
  return conflicts
    .filter((conflict) => conflict.severity === 'blocking')
    .map((conflict) => {
      const payload = {
        preferenceIds: conflict.preferenceIds,
        scope: conflict.scope,
        reason: conflict.reason,
      };
      return {
        id: buildDeadEndId(payload),
        ...payload,
        createdAt: timestamp,
        lastSeenAt: timestamp,
        count: 1,
      };
    });
}

export function summarizePreference(preference: Preference): string {
  return preference.strength === 'soft'
    ? `${preference.description} (soft preference)`
    : preference.description;
}

function summarizeScope(scope: ConflictScope): string {
  const parts = [
    normalizeScopeValue(scope.stage),
    normalizeScopeValue(scope.movie),
    normalizeScopeValue(scope.theater),
    normalizeScopeValue(scope.date),
    normalizeScopeValue(scope.showing),
  ].filter((value): value is string => Boolean(value));
  return parts.join(' | ');
}

export function summarizeActiveConflict(conflict: ActiveConflict): string {
  const prefix = conflict.severity === 'soft' ? 'Soft conflict' : 'Blocking conflict';
  const scope = summarizeScope(conflict.scope);
  return scope ? `${prefix} at ${scope}: ${conflict.reason}` : `${prefix}: ${conflict.reason}`;
}

export function summarizeDeadEnd(deadEnd: DeadEnd): string {
  const scope = summarizeScope(deadEnd.scope);
  const suffix = deadEnd.count > 1 ? ` (${deadEnd.count}x)` : '';
  return scope ? `${scope}: ${deadEnd.reason}${suffix}` : `${deadEnd.reason}${suffix}`;
}
