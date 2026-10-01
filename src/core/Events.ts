type Handler = (...args: any[]) => void;

/** Minimal event bus used to keep systems decoupled. */
export class EventBus {
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: Handler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, ...args: any[]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of Array.from(set)) {
      try {
        h(...args);
      } catch (err) {
        console.error(`[EventBus] handler for "${event}" failed`, err);
      }
    }
  }
}

export const bus = new EventBus();
