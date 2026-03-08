import {
  normalizeActiveConflicts,
  normalizeDeadEnds,
  normalizePreferenceList,
} from './cpMemory';
import type {
  ActiveConflict,
  DeadEnd,
  EpisodicRecord,
  PerceivedContext,
  Preference,
} from '../types';

const MAX_EPISODIC_RECORDS = 200;
const INFRA_ERROR_CODES = new Set(['SESSION_NOT_ACTIVE', 'RELAY_ERROR']);

export class AgentMemory {
  private context: PerceivedContext | null = null;
  private episodic: EpisodicRecord[] = [];
  private preferences: Preference[] = [];
  private activeConflicts: ActiveConflict[] = [];
  private deadEnds: DeadEnd[] = [];

  reset(): void {
    this.context = null;
    this.episodic = [];
    this.preferences = [];
    this.activeConflicts = [];
    this.deadEnds = [];
  }

  getPreferences(): Preference[] {
    return this.preferences.map((item) => ({
      ...item,
      relevantStages: item.relevantStages.slice(),
    }));
  }

  getActiveConflicts(): ActiveConflict[] {
    return this.activeConflicts.map((item) => ({
      ...item,
      preferenceIds: item.preferenceIds.slice(),
      scope: { ...item.scope },
    }));
  }

  getBlockingActiveConflicts(): ActiveConflict[] {
    return this.getActiveConflicts().filter((item) => item.severity === 'blocking');
  }

  getDeadEnds(): DeadEnd[] {
    return this.deadEnds.map((item) => ({
      ...item,
      preferenceIds: item.preferenceIds.slice(),
      scope: { ...item.scope },
    }));
  }

  setPreferences(items: Preference[]): void {
    this.preferences = normalizePreferenceList(items);
  }

  setActiveConflicts(items: ActiveConflict[]): void {
    this.activeConflicts = normalizeActiveConflicts(items);
  }

  upsertDeadEnds(items: DeadEnd[]): void {
    const incoming = normalizeDeadEnds(items);
    if (incoming.length === 0) return;

    const byId = new Map<string, DeadEnd>(this.deadEnds.map((item) => [item.id, item]));
    for (const next of incoming) {
      const existing = byId.get(next.id);
      if (!existing) {
        byId.set(next.id, next);
        continue;
      }
      byId.set(next.id, {
        ...existing,
        lastSeenAt: next.lastSeenAt,
        count: existing.count + next.count,
      });
    }
    this.deadEnds = Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  setContext(context: PerceivedContext): void {
    this.context = context;
  }

  getContext(): PerceivedContext | null {
    return this.context;
  }

  addRecord(record: EpisodicRecord): void {
    this.episodic.push(record);
    if (this.episodic.length > MAX_EPISODIC_RECORDS) {
      this.episodic = this.episodic.slice(-MAX_EPISODIC_RECORDS);
    }
  }

  getRecentRecords(windowSize = 10): EpisodicRecord[] {
    return this.episodic.slice(-windowSize);
  }

  countRecentFailures(stage: string | null, windowSize = 8): number {
    return this.episodic
      .slice(-windowSize)
      .filter((entry) => entry.stage === stage && !entry.ok && !INFRA_ERROR_CODES.has(entry.code ?? ''))
      .length;
  }
}
