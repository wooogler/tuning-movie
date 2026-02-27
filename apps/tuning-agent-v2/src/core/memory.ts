import type { EpisodicRecord, PerceivedContext } from '../types';

const MAX_EPISODIC_RECORDS = 200;
const INFRA_ERROR_CODES = new Set(['SESSION_NOT_ACTIVE', 'RELAY_ERROR']);

export class AgentMemory {
  private context: PerceivedContext | null = null;
  private episodic: EpisodicRecord[] = [];
  private preferences: string[] = [];
  private constraints: string[] = [];

  reset(): void {
    this.context = null;
    this.episodic = [];
    this.preferences = [];
    this.constraints = [];
  }

  getPreferences(): string[] {
    return this.preferences.slice();
  }

  getConstraints(): string[] {
    return this.constraints.slice();
  }

  appendPreferences(items: string[]): void {
    const existing = new Set(this.preferences);
    for (const item of items) {
      const trimmed = item.trim();
      if (trimmed && !existing.has(trimmed)) {
        this.preferences.push(trimmed);
        existing.add(trimmed);
      }
    }
  }

  removePreferences(items: string[]): void {
    const toRemove = new Set(items.map((item) => item.trim().toLowerCase()));
    this.preferences = this.preferences.filter(
      (pref) => !toRemove.has(pref.toLowerCase())
    );
  }

  appendConstraints(items: string[]): void {
    const existing = new Set(this.constraints);
    for (const item of items) {
      const trimmed = item.trim();
      if (trimmed && !existing.has(trimmed)) {
        this.constraints.push(trimmed);
        existing.add(trimmed);
      }
    }
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
