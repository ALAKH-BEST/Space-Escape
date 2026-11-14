import assert from "node:assert/strict";
import test from "node:test";
import { createMovementKeys, isMovementKey, normalizeKey, releaseAllKeys } from "./input-keys";

test("letters are folded to lowercase, other keys are left alone", () => {
  assert.equal(normalizeKey("W"), "w");
  assert.equal(normalizeKey("w"), "w");
  assert.equal(normalizeKey("D"), "d");
  assert.equal(normalizeKey("ArrowUp"), "ArrowUp");
  assert.equal(normalizeKey("Shift"), "Shift");
  assert.equal(normalizeKey(" "), " ");
});

test("holding W through a Shift press still releases the same key", () => {
  const keys = createMovementKeys();
  // Press w, then Shift while holding, then release w while Shift is down (reports "W").
  const press = normalizeKey("w");
  const release = normalizeKey("W");
  assert.equal(press, release);
  assert.ok(isMovementKey(keys, press));
  keys[press as "w"] = true;
  keys[release as "w"] = false;
  assert.equal(keys.w, false);
});

test("Caps Lock letters still count as movement keys", () => {
  const keys = createMovementKeys();
  for (const key of ["W", "A", "S", "D"]) assert.ok(isMovementKey(keys, normalizeKey(key)), key);
});

test("unrelated keys are not movement keys", () => {
  const keys = createMovementKeys();
  for (const key of ["q", "Enter", "constructor", "toString"]) assert.equal(isMovementKey(keys, normalizeKey(key)), false, key);
});

test("releasing everything clears every held key", () => {
  const keys = createMovementKeys();
  keys.ArrowLeft = true;
  keys.w = true;
  keys.d = true;
  releaseAllKeys(keys);
  assert.deepEqual(keys, createMovementKeys());
});
