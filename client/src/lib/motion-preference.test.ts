import assert from "node:assert/strict";
import { test } from "node:test";

import { setVisualEffectsEnabled } from "./game-effects";
import { motionAllowed, subscribeMotion } from "./motion-preference";

test("motion follows the visual effects setting", () => {
  setVisualEffectsEnabled(true);
  assert.equal(motionAllowed(), true);
  setVisualEffectsEnabled(false);
  assert.equal(motionAllowed(), false);
  setVisualEffectsEnabled(true);
  assert.equal(motionAllowed(), true);
});

test("listeners hear about a change in the setting, and stop when they unsubscribe", () => {
  setVisualEffectsEnabled(true);
  let calls = 0;
  const stop = subscribeMotion(() => {
    calls += 1;
  });
  setVisualEffectsEnabled(false);
  assert.equal(calls, 1);
  stop();
  setVisualEffectsEnabled(true);
  assert.equal(calls, 1);
});
