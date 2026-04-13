// ─────────────────────────────────────────────────────────────
// § Interaction Layer
//
// Translates raw DOM events into state mutations.
//
// Key design decisions:
//   • pointermove events are NOT processed inline — the latest
//     event is stored and consumed once per rAF frame via
//     processInput().  This avoids excessive recomputation
//     when the browser fires moves faster than the display
//     refresh rate.
//   • Hit testing delegates to AppState.hitTest() which uses
//     the QuadTree, so we never scan all 10 000 objects.
//   • The inline text editor (textarea overlay) is managed
//     here because it is fundamentally an interaction concern.
// ─────────────────────────────────────────────────────────────

import { AppState }  from './state.js';
import { Renderer }  from './renderer.js';
import { InputState, StickyNote } from './types.js';

const CORNER_RADIUS = 6;

export class InteractionEngine {
  private state: AppState;
  private canvas: HTMLCanvasElement;

  private input: InputState = {
    mode: 'idle',
    spaceHeld: false,
    mouseScreen:  { x: 0, y: 0 },
    dragStart:    { x: 0, y: 0 },
    cameraStart:  { x: 0, y: 0 },
    dragTarget:   null,
    dragOffset:   { x: 0, y: 0 },
  };

  // Inline text editor
  private editorEl: HTMLTextAreaElement;
  private editorTarget: StickyNote | null = null;
  private editorActive = false;

  /**
   * rAF-throttled mouse: we stash the latest PointerEvent and
   * process it exactly once per frame inside processInput().
   */
  private pendingPointerMove: PointerEvent | null = null;

  constructor(state: AppState, renderer: Renderer) {
    this.state    = state;
    this.canvas   = renderer.getTopCanvas();
    this.editorEl = document.getElementById('note-editor') as HTMLTextAreaElement;

    this.bindCanvasEvents();
    this.bindKeyboard();
    this.bindToolbar();
    this.bindEditor();
  }

  /** The id of the note currently being text-edited (or null). */
  getEditingNoteId(): number | null {
    return this.editorActive && this.editorTarget ? this.editorTarget.id : null;
  }

  /**
   * Called once per rAF frame from the main loop.
   * Drains the pending pointer-move event (if any) and
   * repositions the textarea overlay.
   */
  processInput(): void {
    if (this.pendingPointerMove) {
      this.handlePointerMove(this.pendingPointerMove);
      this.pendingPointerMove = null;
    }
    this.repositionEditor();
  }

  // ─────────────────────────────────────────────────────────────
  // Event Binding
  // ─────────────────────────────────────────────────────────────

  private bindCanvasEvents(): void {
    this.canvas.addEventListener('pointerdown',  (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove',  (e) => { this.pendingPointerMove = e; });
    this.canvas.addEventListener('pointerup',    ()  => this.onPointerUp());
    this.canvas.addEventListener('pointerleave', ()  => this.onPointerUp());
    this.canvas.addEventListener('wheel',        (e) => this.onWheel(e), { passive: false });
    this.canvas.addEventListener('dblclick',     (e) => this.onDblClick(e));
    this.canvas.addEventListener('contextmenu',  (e) => e.preventDefault());
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup',   (e) => this.onKeyUp(e));
  }

  private bindToolbar(): void {
    document.getElementById('btn-add')!.addEventListener('click', () => {
      const center = this.state.screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
      const jitter = (): number => (Math.random() - 0.5) * 60;
      const note = this.state.addNote(
        center.x - 90 + jitter(),
        center.y - 70 + jitter(),
        'New note',
      );
      this.state.selectNote(note);
    });

    document.getElementById('btn-reset')!.addEventListener('click', () => {
      this.state.resetView(window.innerWidth, window.innerHeight);
    });
  }

  private bindEditor(): void {
    this.editorEl.addEventListener('blur', () => this.closeEditor());

    this.editorEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Escape') { this.closeEditor(); e.preventDefault(); }
      e.stopPropagation();
    });

    this.editorEl.addEventListener('pointerdown', (e: PointerEvent) => {
      e.stopPropagation();
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Pointer Down
  // ─────────────────────────────────────────────────────────────

  private onPointerDown(e: PointerEvent): void {
    const sx = e.clientX;
    const sy = e.clientY;
    this.input.mouseScreen = { x: sx, y: sy };

    if (this.editorActive) this.closeEditor();

    // Pan trigger: Spacebar + drag  OR  middle-mouse drag
    if (this.input.spaceHeld || e.button === 1) {
      this.input.mode = 'panning';
      this.input.dragStart   = { x: sx, y: sy };
      this.input.cameraStart = { x: this.state.camera.x, y: this.state.camera.y };
      this.canvas.classList.add('grabbing');
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return;

    const world = this.state.screenToWorld(sx, sy);
    const hit   = this.state.hitTest(world.x, world.y);

    if (hit) {
      this.state.selectNote(hit);
      this.input.mode       = 'dragging';
      this.input.dragTarget = hit;
      this.input.dragOffset = { x: world.x - hit.x, y: world.y - hit.y };
    } else {
      this.state.deselectAll();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Pointer Move  (processed once per rAF via processInput)
  // ─────────────────────────────────────────────────────────────

  private handlePointerMove(e: PointerEvent): void {
    const sx = e.clientX;
    const sy = e.clientY;
    this.input.mouseScreen = { x: sx, y: sy };

    if (this.input.mode === 'panning') {
      this.state.setCameraPosition(
        this.input.cameraStart.x + (sx - this.input.dragStart.x),
        this.input.cameraStart.y + (sy - this.input.dragStart.y),
      );
      return;
    }

    if (this.input.mode === 'dragging' && this.input.dragTarget) {
      const world = this.state.screenToWorld(sx, sy);
      this.state.moveNote(
        this.input.dragTarget,
        world.x - this.input.dragOffset.x,
        world.y - this.input.dragOffset.y,
      );
      this.state.rebuildQuadTree();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Pointer Up
  // ─────────────────────────────────────────────────────────────

  private onPointerUp(): void {
    if (this.input.mode === 'panning') {
      this.canvas.classList.remove('grabbing');
    }
    this.input.mode       = 'idle';
    this.input.dragTarget = null;
  }

  // ─────────────────────────────────────────────────────────────
  // Zoom-to-Cursor
  // ─────────────────────────────────────────────────────────────

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.state.zoomToPoint(e.clientX, e.clientY, e.deltaY);
  }

  // ─────────────────────────────────────────────────────────────
  // Double-Click → Open Editor
  // ─────────────────────────────────────────────────────────────

  private onDblClick(e: MouseEvent): void {
    const world = this.state.screenToWorld(e.clientX, e.clientY);
    const hit   = this.state.hitTest(world.x, world.y);
    if (hit) {
      this.state.selectNote(hit);
      this.openEditor(hit);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Keyboard
  // ─────────────────────────────────────────────────────────────

  private onKeyDown(e: KeyboardEvent): void {
    if (this.editorActive) return;

    if (e.code === 'Space' && !e.repeat) {
      this.input.spaceHeld = true;
      this.canvas.classList.add('grab');
      e.preventDefault();
    }

    if (e.code === 'Delete' || e.code === 'Backspace') {
      const selected = this.state.scene.find(o => o.selected);
      if (selected) this.state.removeNote(selected.id);
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      this.input.spaceHeld = false;
      this.canvas.classList.remove('grab');
      if (this.input.mode === 'panning') this.onPointerUp();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Inline Text Editor
  // ─────────────────────────────────────────────────────────────

  private openEditor(note: StickyNote): void {
    this.editorActive = true;
    this.editorTarget = note;

    this.editorEl.value = note.text;
    this.editorEl.style.display    = 'block';
    this.editorEl.style.background = note.color;
    this.repositionEditor();
    this.state.markObjectsDirty();

    requestAnimationFrame(() => {
      this.editorEl.focus();
      this.editorEl.setSelectionRange(this.editorEl.value.length, this.editorEl.value.length);
    });
  }

  private closeEditor(): void {
    if (!this.editorActive || !this.editorTarget) return;

    this.editorTarget.text     = this.editorEl.value;
    this.editorEl.style.display = 'none';
    this.editorActive           = false;
    this.editorTarget           = null;
    this.state.markObjectsDirty();
    this.canvas.focus();
  }

  private repositionEditor(): void {
    if (!this.editorActive || !this.editorTarget) return;

    const note     = this.editorTarget;
    const { zoom } = this.state.camera;
    const s        = this.state.worldToScreen(note.x, note.y);
    const w        = note.width  * zoom;
    const h        = note.height * zoom;
    const padding  = 14 * zoom;
    const fontSize = Math.max(8, 14 * zoom);

    this.editorEl.style.left         = `${s.x}px`;
    this.editorEl.style.top          = `${s.y}px`;
    this.editorEl.style.width        = `${w}px`;
    this.editorEl.style.height       = `${h}px`;
    this.editorEl.style.fontSize     = `${fontSize}px`;
    this.editorEl.style.padding      = `${padding}px`;
    this.editorEl.style.borderRadius = `${CORNER_RADIUS * zoom}px`;
  }
}
