# MiroBoardLite

An infinite canvas prototype inspired by Miro, built with **TypeScript** and the **HTML5 Canvas API**. Demonstrates high-level engineering patterns for coordinate systems, layered rendering, spatial indexing, and performance optimization — all in vanilla code with zero framework dependencies.

![Vanilla JS](https://img.shields.io/badge/Vanilla-TypeScript-3178C6)
![Canvas API](https://img.shields.io/badge/Rendering-Canvas%20API-orange)
![No Frameworks](https://img.shields.io/badge/Frameworks-None-brightgreen)

---

## Architecture

The application is organized into **four decoupled layers**, each with a single responsibility:

```
┌─────────────────────────────────────────────────┐
│                   main.ts                       │
│            (Composition Root / rAF Loop)         │
├────────────┬────────────┬───────────┬───────────┤
│ Rendering  │ Interaction│   State   │   Sync    │
│   Layer    │   Layer    │   Layer   │   Layer   │
│renderer.ts │interaction │  state.ts │  sync.ts  │
│            │    .ts     │           │           │
├────────────┴────────────┴───────────┴───────────┤
│              Spatial Index: quadtree.ts          │
├─────────────────────────────────────────────────┤
│              Shared Types: types.ts              │
└─────────────────────────────────────────────────┘
```

### Rendering Layer (`renderer.ts`)

Two stacked `<canvas>` elements eliminate unnecessary full-scene redraws:

| Canvas | Content | Redraws when |
|--------|---------|-------------|
| **Layer 1** (bottom) | Grid + sticky notes | Viewport pans/zooms or objects mutate (`dirty.objects`) |
| **Layer 2** (top) | Selection rings, drag feedback | Any interaction state change (`dirty.interaction`) |

Key optimizations:
- **Viewport-based rendering** — only objects inside the visible area are drawn (via QuadTree spatial query).
- **Dirty-flag system** — each layer only redraws when its flag is set; idle frames do zero work.
- **HiDPI/Retina** — both canvases scale by `devicePixelRatio` for crisp rendering.

### State Management Layer (`state.ts`)

Single `AppState` class that owns all data: camera, scene, dirty flags. Every mutation (`addNote`, `moveNote`, `zoomToPoint`, etc.) flows through this class, which:
- Sets the correct dirty flags for the renderer.
- Keeps the QuadTree in sync after scene changes.
- Provides coordinate mapping (`screenToWorld` / `worldToScreen`).

### Interaction Layer (`interaction.ts`)

Translates raw DOM events into state mutations. Since canvas gives no DOM elements for individual objects, this layer builds its own input system:

- **rAF-throttled mouse** — `pointermove` events are stashed and consumed once per frame, preventing excessive computation when the browser fires events faster than the display refresh rate.
- **QuadTree hit testing** — click targets are resolved in `O(log n)` via spatial query instead of scanning all objects.
- **Inline text editing** — a `<textarea>` overlay that tracks note position through pan/zoom.

### Real-time Sync Layer (`sync.ts`)

Adapter-based interface (`SyncAdapter`) defining `connect()`, `disconnect()`, `broadcast()`, and `onRemoteEvent()`. The included `LocalSyncAdapter` is a single-user stub — swap it for a WebSocket or WebRTC adapter to enable multi-user collaboration without touching any other layer.

### Spatial Index (`quadtree.ts`)

A QuadTree used for two purposes:
1. **Viewport culling** before rendering — `getVisibleObjects()` returns only on-screen objects.
2. **Hit testing** on click — `hitTest()` resolves the topmost object at a point in `O(log n)`.

Auto-subdivides at capacity 10, up to 5 levels deep. Objects spanning a split boundary are inserted into all overlapping children and deduplicated at query time.

---

## Features

- **Infinite Pan** — `Space` + drag or middle-mouse drag
- **Zoom-to-Cursor** — scroll wheel, anchored on the mouse position
- **Object Selection & Dragging** — click to select, drag to move
- **Inline Text Editing** — double-click a note to edit its text
- **Delete** — `Delete` / `Backspace` removes the selected note
- **Add Notes** — toolbar button creates notes at the viewport center
- **Minimap** — bottom-right overview showing all objects and the viewport rectangle
- **Adaptive Grid** — scales with zoom level for a sense of infinite space

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)

### Install & Build

```bash
git clone https://github.com/volodyaserobyan/MiroBoardLite.git
cd MiroBoardLite
npm install
npm run build
```

### Run

Open `index.html` directly in your browser — no dev server required.

### Development

```bash
npm run watch
```

This starts esbuild in watch mode — it rebundles automatically on every file save. Just refresh the browser.

---

## Project Structure

```
MiroBoardLite/
├── index.html          HTML shell (HUD, toolbar, textarea overlay)
├── style.css           All styling
├── tsconfig.json       TypeScript compiler config (strict mode)
├── package.json        Build scripts (tsc + esbuild)
├── .gitignore
├── src/
│   ├── types.ts        Shared interfaces (Vec2, Rect, Camera, StickyNote, DirtyFlags)
│   ├── quadtree.ts     Spatial index for viewport culling + hit testing
│   ├── state.ts        State management layer (single source of truth)
│   ├── renderer.ts     Multi-canvas layered renderer
│   ├── interaction.ts  rAF-throttled interaction engine
│   ├── sync.ts         Real-time sync layer (adapter pattern)
│   └── main.ts         Bootstrap / composition root / game loop
└── dist/               Compiled bundle (gitignored)
    └── bundle.js
```

---

## Controls

| Action | Input |
|--------|-------|
| Pan | `Space` + drag / Middle mouse drag |
| Zoom | Scroll wheel (centers on cursor) |
| Select | Left click on a note |
| Drag | Left click + drag a selected note |
| Edit text | Double-click a note |
| Delete | `Delete` or `Backspace` |
| Add note | Click **+ Add Note** in toolbar |
| Reset view | Click **Reset View** in toolbar |

---

## Key Engineering Concepts

- **Coordinate systems** — bidirectional `screenToWorld` / `worldToScreen` mapping used consistently across all layers.
- **Zoom-to-cursor math** — `camera' = P_screen − P_world × newZoom` keeps the point under the cursor fixed.
- **Dirty-flag rendering** — decoupled update/draw phases; layers skip rendering when nothing changed.
- **Spatial partitioning** — QuadTree replaces O(n) scans with O(log n) spatial queries.
- **rAF input throttling** — mouse events are batched to one per frame, preventing jank.
- **Layered canvas architecture** — separates rarely-changing content from frequently-changing overlays.

---

## License

MIT
