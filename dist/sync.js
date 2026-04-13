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
// ─────────────────────────────────────────────────────────────
// § Local-only Adapter (single-user stub)
//
// No network — just satisfies the interface so the rest of the
// app can be wired up. Replace with a real adapter to enable
// multi-user collaboration.
// ─────────────────────────────────────────────────────────────
export class LocalSyncAdapter {
    constructor() {
        this.listeners = [];
    }
    connect() { }
    disconnect() { }
    broadcast(_event) {
        // In production: serialize and send to server / peers.
    }
    onRemoteEvent(callback) {
        this.listeners.push(callback);
    }
    /** Inject a synthetic remote event (useful for testing). */
    simulateRemote(event) {
        for (const cb of this.listeners)
            cb(event);
    }
}
//# sourceMappingURL=sync.js.map