type Handler<T> = (event: T) => void | Promise<void>;

export class EventBus<T> {
  private readonly handlers = new Set<Handler<T>>();

  subscribe(handler: Handler<T>): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async emit(event: T): Promise<void> {
    for (const handler of this.handlers) {
      await handler(event);
    }
  }
}
