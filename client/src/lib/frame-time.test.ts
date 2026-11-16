import assert from "node:assert/strict";
import test from "node:test";
import { frameScaleFor, MAX_FRAME_SCALE, REFERENCE_FRAME_MS } from "./frame-time";

/** Distance an obstacle covers in `seconds` on a screen refreshing at `hz`, using the same stepping the game loop uses. */
function distance(hz: number, seconds: number, speedPerFrame: number, scaled: boolean) {
  const frameMs = 1000 / hz;
  let x = 0;
  let last = 0;
  for (let t = frameMs; t <= seconds * 1000 + 1e-6; t += frameMs) {
    const scale = last ? frameScaleFor(t - last) : 1;
    x += speedPerFrame * (scaled ? scale : 1);
    last = t;
  }
  return x;
}

test("a 60Hz screen is exactly as before", () => {
  assert.ok(Math.abs(frameScaleFor(REFERENCE_FRAME_MS) - 1) < 1e-12);
});

test("every refresh rate covers the same distance in the same time", () => {
  const expected = distance(60, 10, 6, true);
  for (const hz of [30, 48, 75, 90, 120, 144, 165]) {
    const got = distance(hz, 10, 6, true);
    // One frame of rounding at the start is the most any rate can be off by.
    assert.ok(Math.abs(got - expected) / expected < 0.02, `${hz}Hz: ${got} vs ${expected}`);
  }
});

test("without scaling a 144Hz screen runs about 2.4 times too fast (the bug being fixed)", () => {
  const ratio = distance(144, 10, 6, false) / distance(60, 10, 6, false);
  assert.ok(ratio > 2.3 && ratio < 2.5, String(ratio));
});

test("a very late frame slows the game down instead of jumping", () => {
  assert.equal(frameScaleFor(500), MAX_FRAME_SCALE);
  assert.equal(frameScaleFor(50), 3);
  assert.ok(frameScaleFor(33.4) > 1.99 && frameScaleFor(33.4) < 2.01);
});

test("a repeated or odd timestamp never moves things backwards or by NaN", () => {
  assert.equal(frameScaleFor(0), 0);
  assert.equal(frameScaleFor(-5), 0);
  assert.equal(frameScaleFor(Number.NaN), 1);
  assert.equal(frameScaleFor(Number.POSITIVE_INFINITY), 1);
});
