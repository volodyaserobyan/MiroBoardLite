// ─────────────────────────────────────────────────────────────
// § Main — Bootstrap & Game Loop
//
// Wires the four layers together and runs the rAF loop:
//
//   1. Interaction.processInput()  — drain throttled mouse
//   2. updateHUD()                 — sync DOM readouts
//   3. Renderer.render()           — redraw dirty layers only
//
// The loop is intentionally thin: all logic lives in the
// layer modules, keeping this file a pure composition root.
// ─────────────────────────────────────────────────────────────

import { AppState }          from './state.js';
import { Renderer }          from './renderer.js';
import { InteractionEngine } from './interaction.js';
import { LocalSyncAdapter }  from './sync.js';

// ── Instantiate layers ──

const state       = new AppState();
const renderer    = new Renderer(document.body);
const interaction = new InteractionEngine(state, renderer);
const sync        = new LocalSyncAdapter();

// Center camera on startup
state.setCameraPosition(window.innerWidth / 2, window.innerHeight / 2);

// ── Resize handling ──

window.addEventListener('resize', () => {
  renderer.resize();
  state.markObjectsDirty();
});

// ── HUD ──

const hudX     = document.getElementById('hud-x')!;
const hudY     = document.getElementById('hud-y')!;
const hudZoom  = document.getElementById('hud-zoom')!;
const hudCount = document.getElementById('hud-count')!;

const updateHUD = (): void => {
  const world = state.screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
  hudX.textContent     = String(Math.round(world.x));
  hudY.textContent     = String(Math.round(world.y));
  hudZoom.textContent  = String(Math.round(state.camera.zoom * 100));
  hudCount.textContent = String(state.scene.length);
};

// ── Main Loop ──

const loop = (): void => {
  interaction.processInput();
  updateHUD();
  renderer.render(state, interaction.getEditingNoteId());
  requestAnimationFrame(loop);
};

sync.connect();
requestAnimationFrame(loop);
