import { describe, it, expect, vi } from 'vitest';
import { LocalSyncAdapter, SyncEvent } from '../src/sync';

const makeEvent = (type: SyncEvent['type'] = 'note_added'): SyncEvent => ({
  type,
  payload: { id: 1 },
  timestamp: Date.now(),
});

describe('LocalSyncAdapter', () => {
  it('connect and disconnect do not throw', () => {
    const adapter = new LocalSyncAdapter();
    expect(() => adapter.connect()).not.toThrow();
    expect(() => adapter.disconnect()).not.toThrow();
  });

  it('broadcast does not throw', () => {
    const adapter = new LocalSyncAdapter();
    expect(() => adapter.broadcast(makeEvent())).not.toThrow();
  });

  it('onRemoteEvent registers a callback', () => {
    const adapter = new LocalSyncAdapter();
    const callback = vi.fn();

    adapter.onRemoteEvent(callback);
    adapter.simulateRemote(makeEvent());

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('simulateRemote delivers the event to all registered listeners', () => {
    const adapter = new LocalSyncAdapter();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    adapter.onRemoteEvent(cb1);
    adapter.onRemoteEvent(cb2);

    const event = makeEvent('note_moved');
    adapter.simulateRemote(event);

    expect(cb1).toHaveBeenCalledWith(event);
    expect(cb2).toHaveBeenCalledWith(event);
  });

  it('simulateRemote passes the correct event payload', () => {
    const adapter = new LocalSyncAdapter();
    const callback = vi.fn();
    adapter.onRemoteEvent(callback);

    const event = makeEvent('note_removed');
    adapter.simulateRemote(event);

    const received = callback.mock.calls[0][0] as SyncEvent;
    expect(received.type).toBe('note_removed');
    expect(received.payload).toEqual({ id: 1 });
  });

  it('does not call listeners when no event is simulated', () => {
    const adapter = new LocalSyncAdapter();
    const callback = vi.fn();
    adapter.onRemoteEvent(callback);

    expect(callback).not.toHaveBeenCalled();
  });

  it('handles multiple simulated events sequentially', () => {
    const adapter = new LocalSyncAdapter();
    const callback = vi.fn();
    adapter.onRemoteEvent(callback);

    adapter.simulateRemote(makeEvent('note_added'));
    adapter.simulateRemote(makeEvent('note_moved'));
    adapter.simulateRemote(makeEvent('note_removed'));

    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback.mock.calls[0][0].type).toBe('note_added');
    expect(callback.mock.calls[1][0].type).toBe('note_moved');
    expect(callback.mock.calls[2][0].type).toBe('note_removed');
  });
});
