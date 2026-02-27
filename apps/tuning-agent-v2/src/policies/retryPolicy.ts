export class RetryPolicy {
  private readonly counts = new Map<string, number>();
  private readonly maxRetriesPerKey: number;

  constructor(maxRetriesPerKey = 1) {
    this.maxRetriesPerKey = maxRetriesPerKey;
  }

  canRetry(key: string): boolean {
    return (this.counts.get(key) ?? 0) < this.maxRetriesPerKey;
  }

  recordRetry(key: string): void {
    const current = this.counts.get(key) ?? 0;
    this.counts.set(key, current + 1);
  }

  reset(key: string): void {
    this.counts.delete(key);
  }
}
