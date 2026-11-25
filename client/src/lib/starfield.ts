/**
 * Maths for the interactive star field behind the home and login screens: where the stars are,
 * how they drift, how they shift with the pointer, and which of them the pointer links together.
 * Drawing lives in the component; everything here is plain numbers so it can be tested.
 */

/** A small, repeatable random number generator, so the stars are in the same places on every visit. */
export function starRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export type Star = {
  /** Position across the screen, 0 to 1. */
  x: number;
  y: number;
  /** Depth from 0.2 (far, slow, faint) to 1 (near, quicker, brighter). */
  z: number;
  /** Radius in CSS pixels. */
  r: number;
  /** Twinkle phase, in radians. */
  phase: number;
};

export type Point = { x: number; y: number };

export function makeStars(count: number, seed: number): Star[] {
  const random = starRandom(seed);
  return Array.from({ length: count }, () => {
    const z = 0.2 + random() * 0.8;
    return { x: random(), y: random(), z, r: 0.5 + z * 1.4, phase: random() * Math.PI * 2 };
  });
}

/** Screen widths a nearest star crosses in one second. */
const DRIFT_PER_SECOND = 0.012;

/** Drifts every star slowly to the left, nearer ones faster, wrapping round to the right edge. */
export function driftStars(stars: Star[], ms: number) {
  for (const star of stars) {
    star.x -= DRIFT_PER_SECOND * star.z * (ms / 1000);
    if (star.x < 0) star.x += 1;
  }
}

/** Where a star is drawn: nearer stars slide further against the pointer, which gives the field depth. */
export function starPosition(star: Star, width: number, height: number, pointer: Point | null): Point {
  const px = pointer ? pointer.x / width - 0.5 : 0;
  const py = pointer ? pointer.y / height - 0.5 : 0;
  const shift = 40 * star.z;
  return { x: star.x * width - px * shift, y: star.y * height - py * shift };
}

/** How strongly the pointer lights a point: 1 right under it, fading to 0 at `reach`. */
export function glowAt(point: Point, pointer: Point | null, reach: number) {
  if (!pointer) return 0;
  const d = Math.hypot(point.x - pointer.x, point.y - pointer.y);
  if (d >= reach) return 0;
  const t = 1 - d / reach;
  return t * t;
}

/** Pairs of stars, as indexes, that are both close to the pointer and close to each other. */
export function constellation(points: Point[], pointer: Point | null, reach: number, link: number): [number, number][] {
  if (!pointer) return [];
  const near: number[] = [];
  points.forEach((p, i) => {
    if (Math.hypot(p.x - pointer.x, p.y - pointer.y) < reach) near.push(i);
  });
  const pairs: [number, number][] = [];
  for (let a = 0; a < near.length; a++) {
    for (let b = a + 1; b < near.length; b++) {
      const p = points[near[a]];
      const q = points[near[b]];
      if (Math.hypot(p.x - q.x, p.y - q.y) < link) pairs.push([near[a], near[b]]);
    }
  }
  return pairs;
}

/** A slow, looping path the light follows when nobody is moving a pointer, so the screen never sits dead. */
export function wanderPoint(ms: number, width: number, height: number): Point {
  const t = ms / 1000;
  return {
    x: width * (0.5 + 0.34 * Math.sin(t * 0.21) + 0.08 * Math.sin(t * 0.53 + 1)),
    y: height * (0.46 + 0.26 * Math.sin(t * 0.17 + 2) + 0.06 * Math.cos(t * 0.47)),
  };
}
