import type { EpisodicRecord, PerceivedContext } from '../types';

const MAX_EPISODIC_RECORDS = 200;
const INFRA_ERROR_CODES = new Set(['SESSION_NOT_ACTIVE', 'RELAY_ERROR']);

export class AgentMemory {
  private context: PerceivedContext | null = null;
  private episodic: EpisodicRecord[] = [];
  private preferences: string[] = [];
  private constraints: string[] = [];
  private conflicts: string[] = [];

  reset(): void {
    this.context = null;
    this.episodic = [];
    this.preferences = [];
    this.constraints = [];
    this.conflicts = [];
  }

  getPreferences(): string[] {
    return this.preferences.slice();
  }

  getConstraints(): string[] {
    return this.constraints.slice();
  }

  getConflicts(): string[] {
    return this.conflicts.slice();
  }

  setPreferences(items: string[]): void {
    this.preferences = this.normalizeList(items);
  }

  setConstraints(items: string[]): void {
    this.constraints = this.normalizeList(items);
  }

  setConflicts(items: string[]): void {
    this.conflicts = this.normalizeList(items);
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

  private normalizeList(items: string[]): string[] {
    const normalized: string[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const trimmed = item.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      normalized.push(trimmed);
    }
    return normalized;
  }
}
