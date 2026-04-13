// ─────────────────────────────────────────────────────────────
// § State Management Layer
//
// Single source of truth for the entire application.
// All mutations go through this class so that:
//   • Dirty flags are set consistently.
//   • The QuadTree stays in sync with scene changes.
//   • The Sync layer can observe every mutation (future).
// ─────────────────────────────────────────────────────────────
import { QuadTree } from './quadtree.js';
const NOTE_COLORS = [
    '#FFEB3B', '#FF9800', '#E91E63', '#9C27B0',
    '#3F51B5', '#03A9F4', '#009688', '#8BC34A',
];
const QUADTREE_HALF_EXTENT = 50000;
export class AppState {
    constructor() {
        this.camera = {
            x: 0,
            y: 0,
            zoom: 1,
            MIN_ZOOM: 0.05,
            MAX_ZOOM: 20,
            ZOOM_SENSITIVITY: 0.001,
        };
        this.scene = [];
        this.dirty = { objects: true, interaction: true };
        this.quadTree = this.freshQuadTree();
        this.nextId = 1;
        this.addNote(-300, -200, 'Drag me!');
        this.addNote(-50, -100, 'Zoom with\nscroll wheel');
        this.addNote(200, -180, 'Space + drag\nto pan');
        this.addNote(-200, 100, 'Middle-click\ndrag also pans');
        this.addNote(100, 150, 'Click to select');
        this.addNote(350, 30, 'Delete to\nremove');
    }
    // ── Coordinate Mapping ──────────────────────────────────────
    screenToWorld(sx, sy) {
        return {
            x: (sx - this.camera.x) / this.camera.zoom,
            y: (sy - this.camera.y) / this.camera.zoom,
        };
    }
    worldToScreen(wx, wy) {
        return {
            x: wx * this.camera.zoom + this.camera.x,
            y: wy * this.camera.zoom + this.camera.y,
        };
    }
    /** World-space rect currently visible on screen. */
    getViewportWorld(screenW, screenH) {
        const tl = this.screenToWorld(0, 0);
        const br = this.screenToWorld(screenW, screenH);
        return { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };
    }
    // ── Scene Mutations ─────────────────────────────────────────
    addNote(x, y, text = 'Hello!') {
        const note = {
            id: this.nextId++,
            x, y,
            width: 180,
            height: 140,
            color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
            text,
            selected: false,
        };
        this.scene.push(note);
        this.rebuildQuadTree();
        this.dirty.objects = true;
        return note;
    }
    removeNote(id) {
        const idx = this.scene.findIndex(o => o.id === id);
        if (idx > -1) {
            this.scene.splice(idx, 1);
            this.rebuildQuadTree();
            this.dirty.objects = true;
        }
    }
    deselectAll() {
        let changed = false;
        for (const o of this.scene) {
            if (o.selected) {
                o.selected = false;
                changed = true;
            }
        }
        if (changed)
            this.dirty.interaction = true;
    }
    selectNote(note) {
        this.deselectAll();
        note.selected = true;
        this.bringToFront(note);
        this.dirty.interaction = true;
    }
    bringToFront(obj) {
        const idx = this.scene.indexOf(obj);
        if (idx > -1 && idx < this.scene.length - 1) {
            this.scene.splice(idx, 1);
            this.scene.push(obj);
            this.dirty.objects = true;
        }
    }
    moveNote(note, x, y) {
        note.x = x;
        note.y = y;
        this.dirty.objects = true;
    }
    markObjectsDirty() { this.dirty.objects = true; }
    markInteractionDirty() { this.dirty.interaction = true; }
    // ── Spatial Queries (QuadTree) ──────────────────────────────
    rebuildQuadTree() {
        this.quadTree = this.freshQuadTree();
        for (const obj of this.scene)
            this.quadTree.insert(obj);
    }
    /**
     * Returns only the objects that overlap the current viewport.
     * A small world-space padding avoids popping at edges.
     */
    getVisibleObjects(screenW, screenH) {
        const vp = this.getViewportWorld(screenW, screenH);
        const pad = 50;
        return this.quadTree.queryUnique({
            x: vp.x - pad,
            y: vp.y - pad,
            width: vp.width + pad * 2,
            height: vp.height + pad * 2,
        });
    }
    /**
     * Hit-test using the QuadTree: queries a tiny rect at (worldX, worldY),
     * then picks the topmost candidate by scene order.
     */
    hitTest(worldX, worldY) {
        const candidates = this.quadTree.queryUnique({
            x: worldX, y: worldY, width: 1, height: 1,
        });
        let best = null;
        let bestIdx = -1;
        for (const obj of candidates) {
            if (worldX >= obj.x && worldX <= obj.x + obj.width &&
                worldY >= obj.y && worldY <= obj.y + obj.height) {
                const idx = this.scene.indexOf(obj);
                if (idx > bestIdx) {
                    best = obj;
                    bestIdx = idx;
                }
            }
        }
        return best;
    }
    // ── Camera Mutations ────────────────────────────────────────
    setCameraPosition(x, y) {
        this.camera.x = x;
        this.camera.y = y;
        this.dirty.objects = true;
        this.dirty.interaction = true;
    }
    /**
     * Zoom-to-cursor math:
     *   P_world = (P_screen − camera) / oldZoom
     *   camera' = P_screen − P_world × newZoom
     *
     * This keeps the world point under the cursor fixed after zoom.
     */
    zoomToPoint(screenX, screenY, deltaY) {
        const worldBefore = this.screenToWorld(screenX, screenY);
        const delta = -deltaY * this.camera.ZOOM_SENSITIVITY;
        const factor = Math.exp(delta);
        const newZoom = Math.min(this.camera.MAX_ZOOM, Math.max(this.camera.MIN_ZOOM, this.camera.zoom * factor));
        this.camera.zoom = newZoom;
        this.camera.x = screenX - worldBefore.x * newZoom;
        this.camera.y = screenY - worldBefore.y * newZoom;
        this.dirty.objects = true;
        this.dirty.interaction = true;
    }
    resetView(screenW, screenH) {
        this.camera.x = screenW / 2;
        this.camera.y = screenH / 2;
        this.camera.zoom = 1;
        this.dirty.objects = true;
        this.dirty.interaction = true;
    }
    // ── Internal ────────────────────────────────────────────────
    freshQuadTree() {
        return new QuadTree({
            x: -QUADTREE_HALF_EXTENT,
            y: -QUADTREE_HALF_EXTENT,
            width: QUADTREE_HALF_EXTENT * 2,
            height: QUADTREE_HALF_EXTENT * 2,
        });
    }
}
//# sourceMappingURL=state.js.map