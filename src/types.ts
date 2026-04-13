// ─────────────────────────────────────────────────────────────
// § Shared Types
// ─────────────────────────────────────────────────────────────

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  readonly MIN_ZOOM: number;
  readonly MAX_ZOOM: number;
  readonly ZOOM_SENSITIVITY: number;
}

export interface StickyNote {
  readonly id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  text: string;
  selected: boolean;
}

export type InteractionMode = 'idle' | 'panning' | 'dragging';

export interface InputState {
  mode: InteractionMode;
  spaceHeld: boolean;
  mouseScreen: Vec2;
  dragStart: Vec2;
  cameraStart: Vec2;
  dragTarget: StickyNote | null;
  dragOffset: Vec2;
}

export interface DirtyFlags {
  objects: boolean;
  interaction: boolean;
}
