// ─────────────────────────────────────────────────────────────
// § Real-time Sync Layer
//
// Defines the contract for synchronising state across clients.
// The architecture is adapter-based: swap LocalSyncAdapter for
// a WebSocketSyncAdapter (or WebRTC, CRDT, etc.) to go live.
//
// Every state mutation in AppState can emit a SyncEvent.
// Remote events arrive via onRemoteEvent and are applied to
// the local state, closing the replication loop.
// ─────────────────────────────────────────────────────────────

export type SyncEventType =
  | 'note_added'
  | 'note_removed'
  | 'note_moved'
  | 'note_updated'
  | 'viewport_changed';

export interface SyncEvent {
  type: SyncEventType;
  payload: unknown;
  timestamp: number;
}

export type SyncEventCallback = (event: SyncEvent) => void;

/** Abstract interface every sync adapter must implement. */
export interface SyncAdapter {
  connect(): void;
  disconnect(): void;
  broadcast(event: SyncEvent): void;
  onRemoteEvent(callback: SyncEventCallback): void;
}

// ─────────────────────────────────────────────────────────────
// § Local-only Adapter (single-user stub)
//
// No network — just satisfies the interface so the rest of the
// app can be wired up. Replace with a real adapter to enable
// multi-user collaboration.
// ─────────────────────────────────────────────────────────────

export class LocalSyncAdapter implements SyncAdapter {
  private listeners: SyncEventCallback[] = [];

  connect(): void    { /* no-op for local mode */ }
  disconnect(): void { /* no-op for local mode */ }

  broadcast(_event: SyncEvent): void {
    // In production: serialize and send to server / peers.
  }

  onRemoteEvent(callback: SyncEventCallback): void {
    this.listeners.push(callback);
  }

  /** Inject a synthetic remote event (useful for testing). */
  simulateRemote(event: SyncEvent): void {
    for (const cb of this.listeners) cb(event);
  }
}
