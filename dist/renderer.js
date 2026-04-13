// ─────────────────────────────────────────────────────────────
// § Rendering Layer — Multi-Canvas, Viewport-Culled
//
// Two stacked canvases avoid full redraws on every frame:
//
//   Layer 1 (bottom) — Objects canvas
//     Grid + sticky notes.  Re-rendered only when the viewport
//     pans/zooms or an object mutates (dirty.objects flag).
//
//   Layer 2 (top)    — Interaction canvas
//     Selection rings, drag outlines, cursor feedback.
//     Re-rendered on every interaction-state change
//     (dirty.interaction flag).
//
// Both layers handle Retina/HiDPI via devicePixelRatio scaling.
// Only objects inside the current viewport are drawn (the
// visible set comes from AppState.getVisibleObjects which
// queries the QuadTree).
// ─────────────────────────────────────────────────────────────
const CORNER_RADIUS = 6;
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.25)';
const GRID_BASE = 50;
export class Renderer {
    constructor(container) {
        this.objectCanvas = this.createCanvas(container, 1);
        this.objectCtx = this.objectCanvas.getContext('2d');
        this.interactionCanvas = this.createCanvas(container, 2);
        this.interactionCtx = this.interactionCanvas.getContext('2d');
        this.resize();
    }
    /** The topmost canvas — the one that should receive pointer events. */
    getTopCanvas() {
        return this.interactionCanvas;
    }
    resize() {
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;
        for (const cvs of [this.objectCanvas, this.interactionCanvas]) {
            cvs.width = w * dpr;
            cvs.height = h * dpr;
            cvs.style.width = `${w}px`;
            cvs.style.height = `${h}px`;
        }
        this.objectCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.interactionCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    /**
     * Called once per rAF frame.  Only redraws layers whose dirty
     * flag is set, so most frames touch only the interaction canvas.
     */
    render(state, editingNoteId) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (state.dirty.objects) {
            this.renderObjectLayer(state, w, h, editingNoteId);
            state.dirty.objects = false;
            state.dirty.interaction = true;
        }
        if (state.dirty.interaction) {
            this.renderInteractionLayer(state, w, h);
            state.dirty.interaction = false;
        }
    }
    // ─────────────────────────────────────────────────────────────
    // Layer 1 — Objects
    // ─────────────────────────────────────────────────────────────
    renderObjectLayer(state, w, h, editingNoteId) {
        const ctx = this.objectCtx;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#f5f5fa';
        ctx.fillRect(0, 0, w, h);
        this.drawGrid(ctx, state, w, h);
        const visible = this.getVisibleSorted(state, w, h);
        for (const obj of visible) {
            this.drawNote(ctx, state, obj, editingNoteId);
        }
        this.drawMinimap(ctx, state, w, h);
    }
    // ─────────────────────────────────────────────────────────────
    // Layer 2 — Interaction
    // ─────────────────────────────────────────────────────────────
    renderInteractionLayer(state, w, h) {
        const ctx = this.interactionCtx;
        ctx.clearRect(0, 0, w, h);
        const visible = this.getVisibleSorted(state, w, h);
        for (const obj of visible) {
            if (obj.selected)
                this.drawSelectionRing(ctx, state, obj);
        }
    }
    // ─────────────────────────────────────────────────────────────
    // Grid
    // ─────────────────────────────────────────────────────────────
    drawGrid(ctx, state, w, h) {
        const { zoom, x: camX, y: camY } = state.camera;
        let gridSize = GRID_BASE;
        while (gridSize * zoom < 30)
            gridSize *= 2;
        while (gridSize * zoom > 120)
            gridSize /= 2;
        const screenGridSize = gridSize * zoom;
        const offsetX = camX % screenGridSize;
        const offsetY = camY % screenGridSize;
        ctx.beginPath();
        for (let x = offsetX; x <= w; x += screenGridSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        for (let y = offsetY; y <= h; y += screenGridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }
        const alpha = Math.min(0.18, 0.08 + zoom * 0.03);
        ctx.strokeStyle = `rgba(180, 180, 220, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    // ─────────────────────────────────────────────────────────────
    // Sticky Note
    // ─────────────────────────────────────────────────────────────
    drawNote(ctx, state, obj, editingNoteId) {
        const { zoom } = state.camera;
        const s = state.worldToScreen(obj.x, obj.y);
        const w = obj.width * zoom;
        const h = obj.height * zoom;
        const r = CORNER_RADIUS * zoom;
        // Shadow + body
        ctx.save();
        ctx.shadowColor = SHADOW_COLOR;
        ctx.shadowBlur = 12 * zoom;
        ctx.shadowOffsetX = 2 * zoom;
        ctx.shadowOffsetY = 4 * zoom;
        roundRect(ctx, s.x, s.y, w, h, r);
        ctx.fillStyle = obj.color;
        ctx.fill();
        ctx.restore();
        // Fold accent
        const foldSize = 18 * zoom;
        ctx.beginPath();
        ctx.moveTo(s.x + w - foldSize, s.y + h);
        ctx.lineTo(s.x + w, s.y + h - foldSize);
        ctx.lineTo(s.x + w, s.y + h);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.fill();
        // Skip canvas-drawn text while the textarea overlay is active
        if (editingNoteId === obj.id)
            return;
        // Text with word-wrap
        const fontSize = Math.max(8, 14 * zoom);
        const padding = 14 * zoom;
        const maxTextWidth = w - padding * 2;
        ctx.font = `500 ${fontSize}px 'Segoe UI', system-ui, sans-serif`;
        ctx.fillStyle = '#333';
        ctx.textBaseline = 'top';
        let ty = s.y + padding;
        for (const line of obj.text.split('\n')) {
            let currentLine = '';
            for (const word of line.split(' ')) {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                if (ctx.measureText(testLine).width > maxTextWidth && currentLine) {
                    ctx.fillText(currentLine, s.x + padding, ty);
                    currentLine = word;
                    ty += fontSize * 1.35;
                }
                else {
                    currentLine = testLine;
                }
            }
            ctx.fillText(currentLine, s.x + padding, ty);
            ty += fontSize * 1.35;
        }
    }
    // ─────────────────────────────────────────────────────────────
    // Selection Ring  (interaction layer)
    // ─────────────────────────────────────────────────────────────
    drawSelectionRing(ctx, state, obj) {
        const { zoom } = state.camera;
        const s = state.worldToScreen(obj.x, obj.y);
        const w = obj.width * zoom;
        const h = obj.height * zoom;
        const r = CORNER_RADIUS * zoom + 2;
        roundRect(ctx, s.x - 3, s.y - 3, w + 6, h + 6, r);
        ctx.strokeStyle = '#4A90D9';
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }
    // ─────────────────────────────────────────────────────────────
    // Minimap
    // ─────────────────────────────────────────────────────────────
    drawMinimap(ctx, state, canvasW, canvasH) {
        if (state.scene.length === 0)
            return;
        const MAP_W = 160, MAP_H = 110, MAP_PAD = 16;
        const mx = canvasW - MAP_W - MAP_PAD;
        const my = canvasH - MAP_H - MAP_PAD - 60;
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        for (const obj of state.scene) {
            minX = Math.min(minX, obj.x);
            minY = Math.min(minY, obj.y);
            maxX = Math.max(maxX, obj.x + obj.width);
            maxY = Math.max(maxY, obj.y + obj.height);
        }
        const pad = 100;
        minX -= pad;
        minY -= pad;
        maxX += pad;
        maxY += pad;
        const worldW = maxX - minX || 1;
        const worldH = maxY - minY || 1;
        const scale = Math.min(MAP_W / worldW, MAP_H / worldH);
        ctx.fillStyle = 'rgba(15, 15, 35, 0.7)';
        roundRect(ctx, mx - 4, my - 4, MAP_W + 8, MAP_H + 8, 8);
        ctx.fill();
        for (const obj of state.scene) {
            ctx.fillStyle = obj.selected ? '#4A90D9' : obj.color;
            ctx.fillRect(mx + (obj.x - minX) * scale, my + (obj.y - minY) * scale, Math.max(2, obj.width * scale), Math.max(2, obj.height * scale));
        }
        const vpTL = state.screenToWorld(0, 0);
        const vpBR = state.screenToWorld(canvasW, canvasH);
        ctx.strokeStyle = 'rgba(74, 144, 217, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mx + (vpTL.x - minX) * scale, my + (vpTL.y - minY) * scale, (vpBR.x - vpTL.x) * scale, (vpBR.y - vpTL.y) * scale);
    }
    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────
    createCanvas(container, zIndex) {
        const cvs = document.createElement('canvas');
        cvs.style.position = 'fixed';
        cvs.style.top = '0';
        cvs.style.left = '0';
        cvs.style.zIndex = String(zIndex);
        cvs.style.display = 'block';
        if (zIndex === 1)
            cvs.style.pointerEvents = 'none';
        container.appendChild(cvs);
        return cvs;
    }
    /** Viewport-culled + scene-order sorted visible objects. */
    getVisibleSorted(state, w, h) {
        const visible = state.getVisibleObjects(w, h);
        const orderMap = new Map(state.scene.map((o, i) => [o.id, i]));
        visible.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
        return visible;
    }
}
// ── Module-level helper ──
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}
//# sourceMappingURL=renderer.js.map