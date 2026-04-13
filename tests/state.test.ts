import { describe, it, expect, beforeEach } from 'vitest';
import { AppState } from '../src/state';

describe('AppState', () => {
  let state: AppState;

  beforeEach(() => {
    state = new AppState();
  });

  // ── Initial State ──

  describe('constructor', () => {
    it('creates 6 default sticky notes', () => {
      expect(state.scene).toHaveLength(6);
    });

    it('each note has a unique id', () => {
      const ids = state.scene.map(n => n.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(6);
    });

    it('starts with dirty flags set', () => {
      expect(state.dirty.objects).toBe(true);
      expect(state.dirty.interaction).toBe(true);
    });

    it('camera starts at origin with zoom 1', () => {
      expect(state.camera.zoom).toBe(1);
    });
  });

  // ── Coordinate Mapping ──

  describe('screenToWorld / worldToScreen', () => {
    it('are inverse operations at default camera', () => {
      state.setCameraPosition(0, 0);
      const screen = { x: 150, y: 200 };
      const world = state.screenToWorld(screen.x, screen.y);
      const back = state.worldToScreen(world.x, world.y);

      expect(back.x).toBeCloseTo(screen.x);
      expect(back.y).toBeCloseTo(screen.y);
    });

    it('are inverse operations with offset camera', () => {
      state.setCameraPosition(300, 400);
      const screen = { x: 500, y: 600 };
      const world = state.screenToWorld(screen.x, screen.y);
      const back = state.worldToScreen(world.x, world.y);

      expect(back.x).toBeCloseTo(screen.x);
      expect(back.y).toBeCloseTo(screen.y);
    });

    it('are inverse operations at non-1 zoom', () => {
      state.setCameraPosition(100, 100);
      state.zoomToPoint(100, 100, -500); // zoom in

      const screen = { x: 250, y: 350 };
      const world = state.screenToWorld(screen.x, screen.y);
      const back = state.worldToScreen(world.x, world.y);

      expect(back.x).toBeCloseTo(screen.x);
      expect(back.y).toBeCloseTo(screen.y);
    });

    it('screenToWorld accounts for camera offset', () => {
      state.setCameraPosition(100, 200);
      const world = state.screenToWorld(100, 200);
      expect(world.x).toBeCloseTo(0);
      expect(world.y).toBeCloseTo(0);
    });

    it('worldToScreen accounts for zoom', () => {
      state.setCameraPosition(0, 0);
      // Force zoom to 2
      state.zoomToPoint(0, 0, -693); // ln(2) ≈ 0.693, delta = 693 * 0.001 = 0.693

      const screen = state.worldToScreen(100, 100);
      // At zoom ~2: screen = world * 2 + camera
      expect(screen.x).toBeCloseTo(100 * state.camera.zoom);
      expect(screen.y).toBeCloseTo(100 * state.camera.zoom);
    });
  });

  // ── Scene Mutations ──

  describe('addNote', () => {
    it('increases scene length by 1', () => {
      const before = state.scene.length;
      state.addNote(0, 0, 'test');
      expect(state.scene.length).toBe(before + 1);
    });

    it('returns the created note with correct properties', () => {
      const note = state.addNote(42, 99, 'hello');
      expect(note.x).toBe(42);
      expect(note.y).toBe(99);
      expect(note.text).toBe('hello');
      expect(note.selected).toBe(false);
      expect(note.width).toBe(180);
      expect(note.height).toBe(140);
    });

    it('sets dirty.objects to true', () => {
      state.dirty.objects = false;
      state.addNote(0, 0);
      expect(state.dirty.objects).toBe(true);
    });

    it('assigns unique ids to each note', () => {
      const a = state.addNote(0, 0);
      const b = state.addNote(10, 10);
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('removeNote', () => {
    it('removes a note by id', () => {
      const note = state.addNote(0, 0);
      const before = state.scene.length;
      state.removeNote(note.id);
      expect(state.scene.length).toBe(before - 1);
      expect(state.scene.find(n => n.id === note.id)).toBeUndefined();
    });

    it('does nothing for a non-existent id', () => {
      const before = state.scene.length;
      state.removeNote(999999);
      expect(state.scene.length).toBe(before);
    });

    it('sets dirty.objects to true', () => {
      const note = state.addNote(0, 0);
      state.dirty.objects = false;
      state.removeNote(note.id);
      expect(state.dirty.objects).toBe(true);
    });
  });

  describe('selectNote / deselectAll', () => {
    it('selectNote marks the note as selected', () => {
      const note = state.scene[0];
      state.selectNote(note);
      expect(note.selected).toBe(true);
    });

    it('selectNote deselects all other notes', () => {
      state.scene[0].selected = true;
      state.scene[1].selected = true;

      const target = state.scene[2];
      state.selectNote(target);

      // bringToFront may reorder the array, so check by reference
      const others = state.scene.filter(n => n !== target);
      expect(others.every(n => !n.selected)).toBe(true);
      expect(target.selected).toBe(true);
    });

    it('deselectAll clears all selections', () => {
      state.scene[0].selected = true;
      state.scene[1].selected = true;

      state.deselectAll();

      expect(state.scene.every(n => !n.selected)).toBe(true);
    });

    it('deselectAll sets dirty.interaction when something was selected', () => {
      state.scene[0].selected = true;
      state.dirty.interaction = false;
      state.deselectAll();
      expect(state.dirty.interaction).toBe(true);
    });

    it('deselectAll does not set dirty flag when nothing was selected', () => {
      state.deselectAll(); // clear first
      state.dirty.interaction = false;
      state.deselectAll();
      expect(state.dirty.interaction).toBe(false);
    });
  });

  describe('bringToFront', () => {
    it('moves the note to the end of the scene array', () => {
      const first = state.scene[0];
      state.bringToFront(first);
      expect(state.scene[state.scene.length - 1]).toBe(first);
    });

    it('does not duplicate the note', () => {
      const before = state.scene.length;
      state.bringToFront(state.scene[0]);
      expect(state.scene.length).toBe(before);
    });

    it('is a no-op if the note is already last', () => {
      const last = state.scene[state.scene.length - 1];
      state.dirty.objects = false;
      state.bringToFront(last);
      // Should not set dirty since nothing changed
      expect(state.dirty.objects).toBe(false);
    });
  });

  describe('moveNote', () => {
    it('updates the note coordinates', () => {
      const note = state.scene[0];
      state.moveNote(note, 777, 888);
      expect(note.x).toBe(777);
      expect(note.y).toBe(888);
    });

    it('sets dirty.objects to true', () => {
      state.dirty.objects = false;
      state.moveNote(state.scene[0], 0, 0);
      expect(state.dirty.objects).toBe(true);
    });
  });

  // ── Hit Testing ──

  describe('hitTest', () => {
    it('returns the note at the given world coordinates', () => {
      const note = state.addNote(100, 100, 'target');
      state.rebuildQuadTree();

      const hit = state.hitTest(150, 150);
      expect(hit).not.toBeNull();
      expect(hit!.id).toBe(note.id);
    });

    it('returns null when no object is at the coordinates', () => {
      const hit = state.hitTest(9999, 9999);
      expect(hit).toBeNull();
    });

    it('returns the topmost (last in scene order) when objects overlap', () => {
      const bottom = state.addNote(0, 0, 'bottom');
      const top = state.addNote(0, 0, 'top');
      state.rebuildQuadTree();

      const hit = state.hitTest(50, 50);
      expect(hit).not.toBeNull();
      expect(hit!.id).toBe(top.id);
      expect(hit!.id).not.toBe(bottom.id);
    });

    it('does not match outside the note bounds', () => {
      state.addNote(100, 100, 'note');
      state.rebuildQuadTree();

      // Just outside bottom-right corner (100+180=280, 100+140=240)
      expect(state.hitTest(281, 241)).toBeNull();
    });
  });

  // ── Viewport ──

  describe('getVisibleObjects', () => {
    it('returns objects within the viewport', () => {
      state.setCameraPosition(500, 500);

      // At camera (500,500) zoom 1, viewport top-left in world = screenToWorld(0,0) = (-500,-500)
      // Add a note that's visible
      state.addNote(-450, -450, 'visible');
      state.rebuildQuadTree();

      const visible = state.getVisibleObjects(1000, 800);
      const found = visible.find(n => n.text === 'visible');
      expect(found).toBeDefined();
    });

    it('excludes objects far outside the viewport', () => {
      state.setCameraPosition(500, 500);

      const far = state.addNote(5000, 5000, 'far away');
      state.rebuildQuadTree();

      const visible = state.getVisibleObjects(1000, 800);
      const found = visible.find(n => n.id === far.id);
      expect(found).toBeUndefined();
    });
  });

  // ── Camera ──

  describe('setCameraPosition', () => {
    it('updates camera x and y', () => {
      state.setCameraPosition(123, 456);
      expect(state.camera.x).toBe(123);
      expect(state.camera.y).toBe(456);
    });

    it('marks both dirty flags', () => {
      state.dirty.objects = false;
      state.dirty.interaction = false;
      state.setCameraPosition(0, 0);
      expect(state.dirty.objects).toBe(true);
      expect(state.dirty.interaction).toBe(true);
    });
  });

  describe('zoomToPoint', () => {
    it('changes the zoom level', () => {
      const before = state.camera.zoom;
      state.zoomToPoint(500, 500, -100); // negative deltaY = zoom in
      expect(state.camera.zoom).toBeGreaterThan(before);
    });

    it('keeps the world point under the cursor fixed', () => {
      state.setCameraPosition(500, 400);
      const sx = 300, sy = 250;

      const worldBefore = state.screenToWorld(sx, sy);
      state.zoomToPoint(sx, sy, -200);
      const worldAfter = state.screenToWorld(sx, sy);

      expect(worldAfter.x).toBeCloseTo(worldBefore.x, 5);
      expect(worldAfter.y).toBeCloseTo(worldBefore.y, 5);
    });

    it('clamps zoom to MIN_ZOOM', () => {
      // Zoom out aggressively
      for (let i = 0; i < 100; i++) {
        state.zoomToPoint(0, 0, 1000);
      }
      expect(state.camera.zoom).toBeGreaterThanOrEqual(state.camera.MIN_ZOOM);
    });

    it('clamps zoom to MAX_ZOOM', () => {
      // Zoom in aggressively
      for (let i = 0; i < 100; i++) {
        state.zoomToPoint(0, 0, -1000);
      }
      expect(state.camera.zoom).toBeLessThanOrEqual(state.camera.MAX_ZOOM);
    });
  });

  describe('resetView', () => {
    it('centers camera and resets zoom to 1', () => {
      state.zoomToPoint(0, 0, -500);
      state.setCameraPosition(999, 888);

      state.resetView(1024, 768);

      expect(state.camera.x).toBe(512);
      expect(state.camera.y).toBe(384);
      expect(state.camera.zoom).toBe(1);
    });

    it('marks both dirty flags', () => {
      state.dirty.objects = false;
      state.dirty.interaction = false;
      state.resetView(1000, 800);
      expect(state.dirty.objects).toBe(true);
      expect(state.dirty.interaction).toBe(true);
    });
  });

  // ── Dirty Flags ──

  describe('dirty flags', () => {
    it('markObjectsDirty sets objects flag', () => {
      state.dirty.objects = false;
      state.markObjectsDirty();
      expect(state.dirty.objects).toBe(true);
    });

    it('markInteractionDirty sets interaction flag', () => {
      state.dirty.interaction = false;
      state.markInteractionDirty();
      expect(state.dirty.interaction).toBe(true);
    });
  });
});
