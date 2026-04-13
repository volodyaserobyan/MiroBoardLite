"use strict";
(() => {
  // src/quadtree.ts
  var MAX_OBJECTS = 10;
  var MAX_LEVELS = 5;
  var QuadTree = class _QuadTree {
    constructor(bounds, level = 0) {
      this.objects = [];
      this.nodes = [];
      this.bounds = bounds;
      this.level = level;
    }
    clear() {
      this.objects = [];
      for (const node of this.nodes) node.clear();
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
        if (this.nodes.length === 0) this.split();
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
      if (!rectsIntersect(this.bounds, range)) return found;
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
      const seen = /* @__PURE__ */ new Set();
      return all.filter((obj) => {
        if (seen.has(obj.id)) return false;
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
        new _QuadTree({ x: x + hw, y, width: hw, height: hh }, nl),
        // NE
        new _QuadTree({ x, y, width: hw, height: hh }, nl),
        // NW
        new _QuadTree({ x, y: y + hh, width: hw, height: hh }, nl),
        // SW
        new _QuadTree({ x: x + hw, y: y + hh, width: hw, height: hh }, nl)
        // SE
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
      if (top && right) indices.push(0);
      if (top && left) indices.push(1);
      if (bottom && left) indices.push(2);
      if (bottom && right) indices.push(3);
      return indices;
    }
  };
  function objToRect(obj) {
    return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
  }
  function rectsIntersect(a, b) {
    return !(a.x > b.x + b.width || a.x + a.width < b.x || a.y > b.y + b.height || a.y + a.height < b.y);
  }

  // src/state.ts
  var NOTE_COLORS = [
    "#FFEB3B",
    "#FF9800",
    "#E91E63",
    "#9C27B0",
    "#3F51B5",
    "#03A9F4",
    "#009688",
    "#8BC34A"
  ];
  var QUADTREE_HALF_EXTENT = 5e4;
  var AppState = class {
    constructor() {
      this.camera = {
        x: 0,
        y: 0,
        zoom: 1,
        MIN_ZOOM: 0.05,
        MAX_ZOOM: 20,
        ZOOM_SENSITIVITY: 1e-3
      };
      this.scene = [];
      this.dirty = { objects: true, interaction: true };
      this.quadTree = this.freshQuadTree();
      this.nextId = 1;
      this.addNote(-300, -200, "Drag me!");
      this.addNote(-50, -100, "Zoom with\nscroll wheel");
      this.addNote(200, -180, "Space + drag\nto pan");
      this.addNote(-200, 100, "Middle-click\ndrag also pans");
      this.addNote(100, 150, "Click to select");
      this.addNote(350, 30, "Delete to\nremove");
    }
    // ── Coordinate Mapping ──────────────────────────────────────
    screenToWorld(sx, sy) {
      return {
        x: (sx - this.camera.x) / this.camera.zoom,
        y: (sy - this.camera.y) / this.camera.zoom
      };
    }
    worldToScreen(wx, wy) {
      return {
        x: wx * this.camera.zoom + this.camera.x,
        y: wy * this.camera.zoom + this.camera.y
      };
    }
    /** World-space rect currently visible on screen. */
    getViewportWorld(screenW, screenH) {
      const tl = this.screenToWorld(0, 0);
      const br = this.screenToWorld(screenW, screenH);
      return { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };
    }
    // ── Scene Mutations ─────────────────────────────────────────
    addNote(x, y, text = "Hello!") {
      const note = {
        id: this.nextId++,
        x,
        y,
        width: 180,
        height: 140,
        color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
        text,
        selected: false
      };
      this.scene.push(note);
      this.rebuildQuadTree();
      this.dirty.objects = true;
      return note;
    }
    removeNote(id) {
      const idx = this.scene.findIndex((o) => o.id === id);
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
      if (changed) this.dirty.interaction = true;
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
    markObjectsDirty() {
      this.dirty.objects = true;
    }
    markInteractionDirty() {
      this.dirty.interaction = true;
    }
    // ── Spatial Queries (QuadTree) ──────────────────────────────
    rebuildQuadTree() {
      this.quadTree = this.freshQuadTree();
      for (const obj of this.scene) this.quadTree.insert(obj);
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
        height: vp.height + pad * 2
      });
    }
    /**
     * Hit-test using the QuadTree: queries a tiny rect at (worldX, worldY),
     * then picks the topmost candidate by scene order.
     */
    hitTest(worldX, worldY) {
      const candidates = this.quadTree.queryUnique({
        x: worldX,
        y: worldY,
        width: 1,
        height: 1
      });
      let best = null;
      let bestIdx = -1;
      for (const obj of candidates) {
        if (worldX >= obj.x && worldX <= obj.x + obj.width && worldY >= obj.y && worldY <= obj.y + obj.height) {
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
      const newZoom = Math.min(
        this.camera.MAX_ZOOM,
        Math.max(this.camera.MIN_ZOOM, this.camera.zoom * factor)
      );
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
        height: QUADTREE_HALF_EXTENT * 2
      });
    }
  };

  // src/renderer.ts
  var CORNER_RADIUS = 6;
  var SHADOW_COLOR = "rgba(0, 0, 0, 0.25)";
  var GRID_BASE = 50;
  var Renderer = class {
    constructor(container) {
      this.objectCanvas = this.createCanvas(container, 1);
      this.objectCtx = this.objectCanvas.getContext("2d");
      this.interactionCanvas = this.createCanvas(container, 2);
      this.interactionCtx = this.interactionCanvas.getContext("2d");
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
    render(state2, editingNoteId) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (state2.dirty.objects) {
        this.renderObjectLayer(state2, w, h, editingNoteId);
        state2.dirty.objects = false;
        state2.dirty.interaction = true;
      }
      if (state2.dirty.interaction) {
        this.renderInteractionLayer(state2, w, h);
        state2.dirty.interaction = false;
      }
    }
    // ─────────────────────────────────────────────────────────────
    // Layer 1 — Objects
    // ─────────────────────────────────────────────────────────────
    renderObjectLayer(state2, w, h, editingNoteId) {
      const ctx = this.objectCtx;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#f5f5fa";
      ctx.fillRect(0, 0, w, h);
      this.drawGrid(ctx, state2, w, h);
      const visible = this.getVisibleSorted(state2, w, h);
      for (const obj of visible) {
        this.drawNote(ctx, state2, obj, editingNoteId);
      }
      this.drawMinimap(ctx, state2, w, h);
    }
    // ─────────────────────────────────────────────────────────────
    // Layer 2 — Interaction
    // ─────────────────────────────────────────────────────────────
    renderInteractionLayer(state2, w, h) {
      const ctx = this.interactionCtx;
      ctx.clearRect(0, 0, w, h);
      const visible = this.getVisibleSorted(state2, w, h);
      for (const obj of visible) {
        if (obj.selected) this.drawSelectionRing(ctx, state2, obj);
      }
    }
    // ─────────────────────────────────────────────────────────────
    // Grid
    // ─────────────────────────────────────────────────────────────
    drawGrid(ctx, state2, w, h) {
      const { zoom, x: camX, y: camY } = state2.camera;
      let gridSize = GRID_BASE;
      while (gridSize * zoom < 30) gridSize *= 2;
      while (gridSize * zoom > 120) gridSize /= 2;
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
    drawNote(ctx, state2, obj, editingNoteId) {
      const { zoom } = state2.camera;
      const s = state2.worldToScreen(obj.x, obj.y);
      const w = obj.width * zoom;
      const h = obj.height * zoom;
      const r = CORNER_RADIUS * zoom;
      ctx.save();
      ctx.shadowColor = SHADOW_COLOR;
      ctx.shadowBlur = 12 * zoom;
      ctx.shadowOffsetX = 2 * zoom;
      ctx.shadowOffsetY = 4 * zoom;
      roundRect(ctx, s.x, s.y, w, h, r);
      ctx.fillStyle = obj.color;
      ctx.fill();
      ctx.restore();
      const foldSize = 18 * zoom;
      ctx.beginPath();
      ctx.moveTo(s.x + w - foldSize, s.y + h);
      ctx.lineTo(s.x + w, s.y + h - foldSize);
      ctx.lineTo(s.x + w, s.y + h);
      ctx.closePath();
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fill();
      if (editingNoteId === obj.id) return;
      const fontSize = Math.max(8, 14 * zoom);
      const padding = 14 * zoom;
      const maxTextWidth = w - padding * 2;
      ctx.font = `500 ${fontSize}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillStyle = "#333";
      ctx.textBaseline = "top";
      let ty = s.y + padding;
      for (const line of obj.text.split("\n")) {
        let currentLine = "";
        for (const word of line.split(" ")) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          if (ctx.measureText(testLine).width > maxTextWidth && currentLine) {
            ctx.fillText(currentLine, s.x + padding, ty);
            currentLine = word;
            ty += fontSize * 1.35;
          } else {
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
    drawSelectionRing(ctx, state2, obj) {
      const { zoom } = state2.camera;
      const s = state2.worldToScreen(obj.x, obj.y);
      const w = obj.width * zoom;
      const h = obj.height * zoom;
      const r = CORNER_RADIUS * zoom + 2;
      roundRect(ctx, s.x - 3, s.y - 3, w + 6, h + 6, r);
      ctx.strokeStyle = "#4A90D9";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    // ─────────────────────────────────────────────────────────────
    // Minimap
    // ─────────────────────────────────────────────────────────────
    drawMinimap(ctx, state2, canvasW, canvasH) {
      if (state2.scene.length === 0) return;
      const MAP_W = 160, MAP_H = 110, MAP_PAD = 16;
      const mx = canvasW - MAP_W - MAP_PAD;
      const my = canvasH - MAP_H - MAP_PAD - 60;
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;
      for (const obj of state2.scene) {
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
      ctx.fillStyle = "rgba(15, 15, 35, 0.7)";
      roundRect(ctx, mx - 4, my - 4, MAP_W + 8, MAP_H + 8, 8);
      ctx.fill();
      for (const obj of state2.scene) {
        ctx.fillStyle = obj.selected ? "#4A90D9" : obj.color;
        ctx.fillRect(
          mx + (obj.x - minX) * scale,
          my + (obj.y - minY) * scale,
          Math.max(2, obj.width * scale),
          Math.max(2, obj.height * scale)
        );
      }
      const vpTL = state2.screenToWorld(0, 0);
      const vpBR = state2.screenToWorld(canvasW, canvasH);
      ctx.strokeStyle = "rgba(74, 144, 217, 0.7)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        mx + (vpTL.x - minX) * scale,
        my + (vpTL.y - minY) * scale,
        (vpBR.x - vpTL.x) * scale,
        (vpBR.y - vpTL.y) * scale
      );
    }
    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────
    createCanvas(container, zIndex) {
      const cvs = document.createElement("canvas");
      cvs.style.position = "fixed";
      cvs.style.top = "0";
      cvs.style.left = "0";
      cvs.style.zIndex = String(zIndex);
      cvs.style.display = "block";
      if (zIndex === 1) cvs.style.pointerEvents = "none";
      container.appendChild(cvs);
      return cvs;
    }
    /** Viewport-culled + scene-order sorted visible objects. */
    getVisibleSorted(state2, w, h) {
      const visible = state2.getVisibleObjects(w, h);
      const orderMap = new Map(state2.scene.map((o, i) => [o.id, i]));
      visible.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      return visible;
    }
  };
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

  // src/interaction.ts
  var CORNER_RADIUS2 = 6;
  var InteractionEngine = class {
    constructor(state2, renderer2) {
      this.input = {
        mode: "idle",
        spaceHeld: false,
        mouseScreen: { x: 0, y: 0 },
        dragStart: { x: 0, y: 0 },
        cameraStart: { x: 0, y: 0 },
        dragTarget: null,
        dragOffset: { x: 0, y: 0 }
      };
      this.editorTarget = null;
      this.editorActive = false;
      /**
       * rAF-throttled mouse: we stash the latest PointerEvent and
       * process it exactly once per frame inside processInput().
       */
      this.pendingPointerMove = null;
      this.state = state2;
      this.canvas = renderer2.getTopCanvas();
      this.editorEl = document.getElementById("note-editor");
      this.bindCanvasEvents();
      this.bindKeyboard();
      this.bindToolbar();
      this.bindEditor();
    }
    /** The id of the note currently being text-edited (or null). */
    getEditingNoteId() {
      return this.editorActive && this.editorTarget ? this.editorTarget.id : null;
    }
    /**
     * Called once per rAF frame from the main loop.
     * Drains the pending pointer-move event (if any) and
     * repositions the textarea overlay.
     */
    processInput() {
      if (this.pendingPointerMove) {
        this.handlePointerMove(this.pendingPointerMove);
        this.pendingPointerMove = null;
      }
      this.repositionEditor();
    }
    // ─────────────────────────────────────────────────────────────
    // Event Binding
    // ─────────────────────────────────────────────────────────────
    bindCanvasEvents() {
      this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
      this.canvas.addEventListener("pointermove", (e) => {
        this.pendingPointerMove = e;
      });
      this.canvas.addEventListener("pointerup", () => this.onPointerUp());
      this.canvas.addEventListener("pointerleave", () => this.onPointerUp());
      this.canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
      this.canvas.addEventListener("dblclick", (e) => this.onDblClick(e));
      this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    bindKeyboard() {
      window.addEventListener("keydown", (e) => this.onKeyDown(e));
      window.addEventListener("keyup", (e) => this.onKeyUp(e));
    }
    bindToolbar() {
      document.getElementById("btn-add").addEventListener("click", () => {
        const center = this.state.screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
        const jitter = () => (Math.random() - 0.5) * 60;
        const note = this.state.addNote(
          center.x - 90 + jitter(),
          center.y - 70 + jitter(),
          "New note"
        );
        this.state.selectNote(note);
      });
      document.getElementById("btn-reset").addEventListener("click", () => {
        this.state.resetView(window.innerWidth, window.innerHeight);
      });
    }
    bindEditor() {
      this.editorEl.addEventListener("blur", () => this.closeEditor());
      this.editorEl.addEventListener("keydown", (e) => {
        if (e.code === "Escape") {
          this.closeEditor();
          e.preventDefault();
        }
        e.stopPropagation();
      });
      this.editorEl.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
      });
    }
    // ─────────────────────────────────────────────────────────────
    // Pointer Down
    // ─────────────────────────────────────────────────────────────
    onPointerDown(e) {
      const sx = e.clientX;
      const sy = e.clientY;
      this.input.mouseScreen = { x: sx, y: sy };
      if (this.editorActive) this.closeEditor();
      if (this.input.spaceHeld || e.button === 1) {
        this.input.mode = "panning";
        this.input.dragStart = { x: sx, y: sy };
        this.input.cameraStart = { x: this.state.camera.x, y: this.state.camera.y };
        this.canvas.classList.add("grabbing");
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;
      const world = this.state.screenToWorld(sx, sy);
      const hit = this.state.hitTest(world.x, world.y);
      if (hit) {
        this.state.selectNote(hit);
        this.input.mode = "dragging";
        this.input.dragTarget = hit;
        this.input.dragOffset = { x: world.x - hit.x, y: world.y - hit.y };
      } else {
        this.state.deselectAll();
      }
    }
    // ─────────────────────────────────────────────────────────────
    // Pointer Move  (processed once per rAF via processInput)
    // ─────────────────────────────────────────────────────────────
    handlePointerMove(e) {
      const sx = e.clientX;
      const sy = e.clientY;
      this.input.mouseScreen = { x: sx, y: sy };
      if (this.input.mode === "panning") {
        this.state.setCameraPosition(
          this.input.cameraStart.x + (sx - this.input.dragStart.x),
          this.input.cameraStart.y + (sy - this.input.dragStart.y)
        );
        return;
      }
      if (this.input.mode === "dragging" && this.input.dragTarget) {
        const world = this.state.screenToWorld(sx, sy);
        this.state.moveNote(
          this.input.dragTarget,
          world.x - this.input.dragOffset.x,
          world.y - this.input.dragOffset.y
        );
        this.state.rebuildQuadTree();
      }
    }
    // ─────────────────────────────────────────────────────────────
    // Pointer Up
    // ─────────────────────────────────────────────────────────────
    onPointerUp() {
      if (this.input.mode === "panning") {
        this.canvas.classList.remove("grabbing");
      }
      this.input.mode = "idle";
      this.input.dragTarget = null;
    }
    // ─────────────────────────────────────────────────────────────
    // Zoom-to-Cursor
    // ─────────────────────────────────────────────────────────────
    onWheel(e) {
      e.preventDefault();
      this.state.zoomToPoint(e.clientX, e.clientY, e.deltaY);
    }
    // ─────────────────────────────────────────────────────────────
    // Double-Click → Open Editor
    // ─────────────────────────────────────────────────────────────
    onDblClick(e) {
      const world = this.state.screenToWorld(e.clientX, e.clientY);
      const hit = this.state.hitTest(world.x, world.y);
      if (hit) {
        this.state.selectNote(hit);
        this.openEditor(hit);
      }
    }
    // ─────────────────────────────────────────────────────────────
    // Keyboard
    // ─────────────────────────────────────────────────────────────
    onKeyDown(e) {
      if (this.editorActive) return;
      if (e.code === "Space" && !e.repeat) {
        this.input.spaceHeld = true;
        this.canvas.classList.add("grab");
        e.preventDefault();
      }
      if (e.code === "Delete" || e.code === "Backspace") {
        const selected = this.state.scene.find((o) => o.selected);
        if (selected) this.state.removeNote(selected.id);
      }
    }
    onKeyUp(e) {
      if (e.code === "Space") {
        this.input.spaceHeld = false;
        this.canvas.classList.remove("grab");
        if (this.input.mode === "panning") this.onPointerUp();
      }
    }
    // ─────────────────────────────────────────────────────────────
    // Inline Text Editor
    // ─────────────────────────────────────────────────────────────
    openEditor(note) {
      this.editorActive = true;
      this.editorTarget = note;
      this.editorEl.value = note.text;
      this.editorEl.style.display = "block";
      this.editorEl.style.background = note.color;
      this.repositionEditor();
      this.state.markObjectsDirty();
      requestAnimationFrame(() => {
        this.editorEl.focus();
        this.editorEl.setSelectionRange(this.editorEl.value.length, this.editorEl.value.length);
      });
    }
    closeEditor() {
      if (!this.editorActive || !this.editorTarget) return;
      this.editorTarget.text = this.editorEl.value;
      this.editorEl.style.display = "none";
      this.editorActive = false;
      this.editorTarget = null;
      this.state.markObjectsDirty();
      this.canvas.focus();
    }
    repositionEditor() {
      if (!this.editorActive || !this.editorTarget) return;
      const note = this.editorTarget;
      const { zoom } = this.state.camera;
      const s = this.state.worldToScreen(note.x, note.y);
      const w = note.width * zoom;
      const h = note.height * zoom;
      const padding = 14 * zoom;
      const fontSize = Math.max(8, 14 * zoom);
      this.editorEl.style.left = `${s.x}px`;
      this.editorEl.style.top = `${s.y}px`;
      this.editorEl.style.width = `${w}px`;
      this.editorEl.style.height = `${h}px`;
      this.editorEl.style.fontSize = `${fontSize}px`;
      this.editorEl.style.padding = `${padding}px`;
      this.editorEl.style.borderRadius = `${CORNER_RADIUS2 * zoom}px`;
    }
  };

  // src/sync.ts
  var LocalSyncAdapter = class {
    constructor() {
      this.listeners = [];
    }
    connect() {
    }
    disconnect() {
    }
    broadcast(_event) {
    }
    onRemoteEvent(callback) {
      this.listeners.push(callback);
    }
    /** Inject a synthetic remote event (useful for testing). */
    simulateRemote(event) {
      for (const cb of this.listeners) cb(event);
    }
  };

  // src/main.ts
  var state = new AppState();
  var renderer = new Renderer(document.body);
  var interaction = new InteractionEngine(state, renderer);
  var sync = new LocalSyncAdapter();
  state.setCameraPosition(window.innerWidth / 2, window.innerHeight / 2);
  window.addEventListener("resize", () => {
    renderer.resize();
    state.markObjectsDirty();
  });
  var hudX = document.getElementById("hud-x");
  var hudY = document.getElementById("hud-y");
  var hudZoom = document.getElementById("hud-zoom");
  var hudCount = document.getElementById("hud-count");
  var updateHUD = () => {
    const world = state.screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
    hudX.textContent = String(Math.round(world.x));
    hudY.textContent = String(Math.round(world.y));
    hudZoom.textContent = String(Math.round(state.camera.zoom * 100));
    hudCount.textContent = String(state.scene.length);
  };
  var loop = () => {
    interaction.processInput();
    updateHUD();
    renderer.render(state, interaction.getEditingNoteId());
    requestAnimationFrame(loop);
  };
  sync.connect();
  requestAnimationFrame(loop);
})();
//# sourceMappingURL=bundle.js.map
