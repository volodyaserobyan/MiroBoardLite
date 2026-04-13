// ─────────────────────────────────────────────────────────────
// § QuadTree — Spatial Index
//
// Used for two critical optimisations:
//   1. Viewport culling  — query(viewportRect) returns only
//      the objects visible on screen, avoiding a full-scene scan.
//   2. Hit testing       — query(pointRect) finds candidates at
//      a click position in O(log n) instead of O(n).
//
// The tree subdivides when a node exceeds MAX_OBJECTS, up to
// MAX_LEVELS deep. Objects that span a split boundary are
// inserted into every child they overlap (and deduplicated
// at query time via queryUnique).
// ─────────────────────────────────────────────────────────────
const MAX_OBJECTS = 10;
const MAX_LEVELS = 5;
export class QuadTree {
    constructor(bounds, level = 0) {
        this.objects = [];
        this.nodes = [];
        this.bounds = bounds;
        this.level = level;
    }
    clear() {
        this.objects = [];
        for (const node of this.nodes)
            node.clear();
        this.nodes = [];
    }
    insert(obj) {
        const rect = objToRect(obj);
        if (this.nodes.length > 0) {
            for (const i of this.getIndices(rect)) {
                this.nodes[i].insert(obj);
            }
            return;
        }
        this.objects.push(obj);
        if (this.objects.length > MAX_OBJECTS && this.level < MAX_LEVELS) {
            if (this.nodes.length === 0)
                this.split();
            const pending = this.objects;
            this.objects = [];
            for (const o of pending) {
                const r = objToRect(o);
                for (const i of this.getIndices(r)) {
                    this.nodes[i].insert(o);
                }
            }
        }
    }
    /** Return all objects whose bounding rect intersects `range`. May contain duplicates. */
    query(range) {
        const found = [];
        if (!rectsIntersect(this.bounds, range))
            return found;
        for (const obj of this.objects) {
            if (rectsIntersect(objToRect(obj), range)) {
                found.push(obj);
            }
        }
        for (const node of this.nodes) {
            found.push(...node.query(range));
        }
        return found;
    }
    /** Deduplicated query — filters by object id. */
    queryUnique(range) {
        const all = this.query(range);
        const seen = new Set();
        return all.filter(obj => {
            if (seen.has(obj.id))
                return false;
            seen.add(obj.id);
            return true;
        });
    }
    // ── Internal ──
    split() {
        const { x, y, width, height } = this.bounds;
        const hw = width / 2;
        const hh = height / 2;
        const nl = this.level + 1;
        this.nodes = [
            new QuadTree({ x: x + hw, y, width: hw, height: hh }, nl), // NE
            new QuadTree({ x, y, width: hw, height: hh }, nl), // NW
            new QuadTree({ x, y: y + hh, width: hw, height: hh }, nl), // SW
            new QuadTree({ x: x + hw, y: y + hh, width: hw, height: hh }, nl), // SE
        ];
    }
    /** Which child quadrants does `rect` overlap? */
    getIndices(rect) {
        const midX = this.bounds.x + this.bounds.width / 2;
        const midY = this.bounds.y + this.bounds.height / 2;
        const top = rect.y < midY;
        const bottom = rect.y + rect.height > midY;
        const left = rect.x < midX;
        const right = rect.x + rect.width > midX;
        const indices = [];
        if (top && right)
            indices.push(0);
        if (top && left)
            indices.push(1);
        if (bottom && left)
            indices.push(2);
        if (bottom && right)
            indices.push(3);
        return indices;
    }
}
// ── Helpers ──
function objToRect(obj) {
    return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
}
function rectsIntersect(a, b) {
    return !(a.x > b.x + b.width ||
        a.x + a.width < b.x ||
        a.y > b.y + b.height ||
        a.y + a.height < b.y);
}
//# sourceMappingURL=quadtree.js.map