// Tiny mutable bus connecting the DOM rotate controls (buttons + arrow keys)
// to the OrbitControls driver inside the Canvas — no React state per frame.

export const cameraBus = {
  rotate: 0 as -1 | 0 | 1, // ◀ ▶ / ← →  orbit left-right
  tilt: 0 as -1 | 0 | 1, // ▲ ▼ / ↑ ↓  orbit up-down
  fast: false,
};

export const ROTATE_SPEED = 1.1; // rad/s
export const TILT_SPEED = 0.75; // rad/s
export const ROTATE_FAST_MULTIPLIER = 2.6; // holding Shift
