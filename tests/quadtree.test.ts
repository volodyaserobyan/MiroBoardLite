import { describe, it, expect, beforeEach } from 'vitest';
import { QuadTree } from '../src/quadtree';
import { StickyNote } from '../src/types';

// ── Helpers ──

let nextId = 1;

const makeNote = (x: number, y: number, w = 100, h = 80): StickyNote => ({
  id: nextId++,
  x, y,
  width: w,
  height: h,
  color: '#FFEB3B',
  text: `note-${nextId}`,
  selected: false,
});

const WORLD_BOUNDS = { x: -1000, y: -1000, width: 2000, height: 2000 };

describe('QuadTree', () => {
  let tree: QuadTree;

  beforeEach(() => {
    tree = new QuadTree(WORLD_BOUNDS);
    nextId = 1;
  });

  // ── Insert & Query ──

  it('returns empty array when tree is empty', () => {
    const results = tree.query({ x: 0, y: 0, width: 100, height: 100 });
    expect(results).toEqual([]);
  });

  it('finds an inserted object within the query range', () => {
    const note = makeNote(50, 50);
    tree.insert(note);

    const results = tree.query({ x: 0, y: 0, width: 200, height: 200 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(note.id);
  });

  it('does not return objects outside the query range', () => {
    tree.insert(makeNote(500, 500));

    const results = tree.query({ x: 0, y: 0, width: 100, height: 100 });
    expect(results).toHaveLength(0);
  });

  it('returns multiple objects when several overlap the range', () => {
    tree.insert(makeNote(10, 10));
    tree.insert(makeNote(20, 20));
    tree.insert(makeNote(30, 30));

    const results = tree.queryUnique({ x: 0, y: 0, width: 200, height: 200 });
    expect(results).toHaveLength(3);
  });

  // ── Subdivision ──

  it('handles more objects than MAX_OBJECTS by subdividing', () => {
    for (let i = 0; i < 15; i++) {
      tree.insert(makeNote(i * 10, i * 10, 20, 20));
    }

    const results = tree.queryUnique({ x: -1000, y: -1000, width: 2000, height: 2000 });
    expect(results).toHaveLength(15);
  });

  // ── Deduplication ──

  it('queryUnique deduplicates objects spanning quadrant boundaries', () => {
    // Place object right at the center of the tree so it spans all 4 quadrants
    const note = makeNote(-50, -50, 100, 100);
    tree.insert(note);

    const raw = tree.query({ x: -100, y: -100, width: 200, height: 200 });
    const unique = tree.queryUnique({ x: -100, y: -100, width: 200, height: 200 });

    // raw may have duplicates if tree has subdivided, unique should not
    expect(unique).toHaveLength(1);
    expect(unique[0].id).toBe(note.id);
    expect(raw.length).toBeGreaterThanOrEqual(1);
  });

  // ── Clear ──

  it('clear() empties the tree', () => {
    tree.insert(makeNote(10, 10));
    tree.insert(makeNote(20, 20));

    tree.clear();

    const results = tree.query({ x: -1000, y: -1000, width: 2000, height: 2000 });
    expect(results).toHaveLength(0);
  });

  // ── Edge Cases ──

  it('handles a point-sized query (hit testing)', () => {
    const note = makeNote(100, 100, 50, 50);
    tree.insert(note);

    const hit = tree.queryUnique({ x: 125, y: 125, width: 1, height: 1 });
    expect(hit).toHaveLength(1);
    expect(hit[0].id).toBe(note.id);

    const miss = tree.queryUnique({ x: 200, y: 200, width: 1, height: 1 });
    expect(miss).toHaveLength(0);
  });

  it('handles objects at negative coordinates', () => {
    const note = makeNote(-500, -500, 100, 100);
    tree.insert(note);

    const results = tree.queryUnique({ x: -600, y: -600, width: 300, height: 300 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(note.id);
  });

  it('handles overlapping objects correctly', () => {
    const note1 = makeNote(0, 0, 100, 100);
    const note2 = makeNote(50, 50, 100, 100);
    tree.insert(note1);
    tree.insert(note2);

    // Query the overlapping region
    const results = tree.queryUnique({ x: 60, y: 60, width: 10, height: 10 });
    expect(results).toHaveLength(2);
  });

  it('returns nothing for a query entirely outside the tree bounds', () => {
    tree.insert(makeNote(0, 0));

    const results = tree.query({ x: 5000, y: 5000, width: 100, height: 100 });
    expect(results).toHaveLength(0);
  });
});
