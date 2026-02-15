import type { EpisodicRecord, PerceivedContext } from '../types';

const MAX_EPISODIC_RECORDS = 200;
const INFRA_ERROR_CODES = new Set(['SESSION_NOT_ACTIVE', 'RELAY_ERROR']);

export class AgentMemory {
  private context: PerceivedContext | null = null;
  private episodic: EpisodicRecord[] = [];

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

  countRecentFailures(stage: string | null, windowSize = 8): number {
    return this.episodic
      .slice(-windowSize)
      .filter((entry) => entry.stage === stage && !entry.ok && !INFRA_ERROR_CODES.has(entry.code ?? ''))
      .length;
  }
}
