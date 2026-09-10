import { GameEvents } from '../types';

type EventCallback<T> = (data: T) => void;
type GenericCallback = (data: unknown) => void;

export class EventBus {
  private static instance: EventBus;
  private listeners: Map<keyof GameEvents, Set<GenericCallback>> = new Map();

  private constructor() {}

  public static get(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  public on<K extends keyof GameEvents>(event: K, callback: EventCallback<GameEvents[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as GenericCallback);
    return () => this.off(event, callback);
  }

  public off<K extends keyof GameEvents>(event: K, callback: EventCallback<GameEvents[K]>): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback as GenericCallback);
    }
  }

  public emit<K extends keyof GameEvents>(event: K, data: GameEvents[K]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in event listener for ${String(event)}:`, err);
        }
      });
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}
