import assert from "node:assert/strict";
import { test } from "node:test";

import { constellation, driftStars, glowAt, makeStars, starPosition, starRandom, wanderPoint } from "./starfield";

test("the same seed always gives the same stars, and they all start on screen", () => {
  assert.deepEqual(makeStars(30, 7), makeStars(30, 7));
  assert.notDeepEqual(makeStars(30, 7), makeStars(30, 8));
  const a = starRandom(5);
  const b = starRandom(5);
  assert.deepEqual([a(), a()], [b(), b()]);
  for (const s of makeStars(300, 3)) {
    assert.ok(s.x >= 0 && s.x < 1 && s.y >= 0 && s.y < 1 && s.z >= 0.2 && s.z <= 1);
  }
});

test("stars drift left, nearer ones faster, and wrap round instead of vanishing", () => {
  const stars = [
    { x: 0.5, y: 0.5, z: 1, r: 1, phase: 0 },
    { x: 0.5, y: 0.5, z: 0.25, r: 1, phase: 0 },
    { x: 0.001, y: 0.5, z: 1, r: 1, phase: 0 },
  ];
  driftStars(stars, 1000);
  assert.ok(stars[0].x < 0.5 && stars[1].x < 0.5);
  assert.ok(0.5 - stars[0].x > (0.5 - stars[1].x) * 3);
  assert.ok(stars[2].x > 0.9 && stars[2].x < 1);
});

test("near stars slide further than far ones as the pointer moves, and nothing moves without a pointer", () => {
  const near = { x: 0.5, y: 0.5, z: 1, r: 1, phase: 0 };
  const far = { ...near, z: 0.2 };
  assert.deepEqual(starPosition(near, 1000, 800, null), { x: 500, y: 400 });
  const pointer = { x: 1000, y: 800 };
  const n = starPosition(near, 1000, 800, pointer);
  const f = starPosition(far, 1000, 800, pointer);
  assert.ok(n.x < 500 && f.x < 500);
  assert.ok(500 - n.x > 500 - f.x);
});

test("the glow is strongest under the pointer and gone at the edge of its reach", () => {
  const pointer = { x: 100, y: 100 };
  assert.equal(glowAt({ x: 100, y: 100 }, pointer, 200), 1);
  assert.equal(glowAt({ x: 300, y: 100 }, pointer, 200), 0);
  assert.ok(glowAt({ x: 150, y: 100 }, pointer, 200) > glowAt({ x: 250, y: 100 }, pointer, 200));
  assert.equal(glowAt({ x: 0, y: 0 }, null, 200), 0);
});

test("only stars close to the pointer and to each other are linked", () => {
  const points = [
    { x: 100, y: 100 },
    { x: 150, y: 100 },
    { x: 100, y: 160 },
    { x: 900, y: 900 },
    { x: 950, y: 900 },
    { x: 400, y: 100 },
  ];
  assert.deepEqual(constellation(points, { x: 110, y: 110 }, 120, 70), [[0, 1], [0, 2]]);
  assert.deepEqual(constellation(points, null, 120, 80), []);
  assert.deepEqual(constellation(points, { x: 920, y: 900 }, 120, 80), [[3, 4]]);
});

test("the idle light wanders but stays on screen", () => {
  let moved = false;
  let last = wanderPoint(0, 1000, 800);
  for (let ms = 0; ms < 600000; ms += 997) {
    const p = wanderPoint(ms, 1000, 800);
    assert.ok(p.x > 0 && p.x < 1000 && p.y > 0 && p.y < 800);
    if (p.x !== last.x) moved = true;
    last = p;
  }
  assert.ok(moved);
});
