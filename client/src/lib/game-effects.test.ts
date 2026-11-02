import assert from "node:assert/strict";
import test from "node:test";
import {
  effectsActive,
  emitBurst,
  emitTrail,
  MAX_PARTICLES,
  setVisualEffectsEnabled,
  stepParticles,
  subscribeVisualEffects,
  visualEffectsEnabled,
  type Particle,
} from "./game-effects";

test("particles fade out and are removed", () => {
  const particles: Particle[] = [];
  emitBurst(particles, 100, 100, "#fff", 20, () => 0.5);
  assert.equal(particles.length, 20);
  stepParticles(particles, 200);
  assert.equal(particles.length, 0);
});

test("particles move away from where they started", () => {
  const particles: Particle[] = [];
  emitBurst(particles, 0, 0, "#fff", 1, () => 0);
  stepParticles(particles, 1);
  assert.ok(particles[0].x > 0);
});

test("the particle count never exceeds the cap", () => {
  const particles: Particle[] = [];
  for (let index = 0; index < MAX_PARTICLES * 3; index++) emitTrail(particles, 0, 0, "#fff");
  assert.equal(particles.length, MAX_PARTICLES);
});

test("visual effects are on by default and can be switched off and on", () => {
  assert.equal(visualEffectsEnabled(), true);
  assert.equal(effectsActive(), true);
  let notified = 0;
  const unsubscribe = subscribeVisualEffects(() => notified++);
  setVisualEffectsEnabled(false);
  assert.equal(visualEffectsEnabled(), false);
  assert.equal(effectsActive(), false);
  setVisualEffectsEnabled(false);
  setVisualEffectsEnabled(true);
  assert.equal(effectsActive(), true);
  assert.equal(notified, 2);
  unsubscribe();
});
