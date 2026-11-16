/**
 * The game was tuned at 60 frames a second, with every movement written as "pixels per frame".
 * On a 120Hz phone that runs twice as fast, and on a 30Hz one half as fast. Multiplying each
 * frame's movement by how long the frame really took makes the speed the same on every screen,
 * and leaves a 60Hz screen exactly as it was.
 */
export const REFERENCE_FRAME_MS = 1000 / 60;

/**
 * A frame that arrives very late (a busy phone, a throttled tab) is treated as at most this many
 * reference frames long, so the game slows down for a moment instead of jumping obstacles through the ship.
 */
export const MAX_FRAME_SCALE = 3;

/** How many 60Hz frames of movement to apply for a frame that took `deltaMs`. */
export function frameScaleFor(deltaMs: number): number {
  if (!Number.isFinite(deltaMs)) return 1;
  if (deltaMs <= 0) return 0;
  return Math.min(MAX_FRAME_SCALE, deltaMs / REFERENCE_FRAME_MS);
}
