import assert from "node:assert/strict";
import test from "node:test";
import { shiftClockForPause } from "./pause";

const base = { startedAt: 1000, lastSpawn: 4800, abilityActiveUntil: 0, abilityCooldownUntil: 0 };

test("time survived and the spawn timer do not grow during a pause", () => {
  const next = shiftClockForPause(base, 5000, 65000);
  // 60 seconds away: the run still reads as having started 4s before the pause, and the next spawn is as due as before.
  assert.equal(5000 - base.startedAt, 65000 - next.startedAt);
  assert.equal(5000 - base.lastSpawn, 65000 - next.lastSpawn);
});

test("an ability that was running keeps the same time left", () => {
  const running = { ...base, abilityActiveUntil: 7000, abilityCooldownUntil: 17000 };
  const next = shiftClockForPause(running, 5000, 35000);
  assert.equal(next.abilityActiveUntil - 35000, 7000 - 5000);
  assert.equal(next.abilityCooldownUntil - 35000, 17000 - 5000);
});

test("an ability that was not running does not switch on", () => {
  // Zero means "never used"; moving it forward would put it in the future and turn the ability on.
  const next = shiftClockForPause(base, 5000, 35000);
  assert.equal(next.abilityActiveUntil, 0);
  assert.equal(next.abilityCooldownUntil, 0);
  // An ability that already ended before the pause stays ended.
  const ended = shiftClockForPause({ ...base, abilityActiveUntil: 4000, abilityCooldownUntil: 4500 }, 5000, 35000);
  assert.equal(ended.abilityActiveUntil, 4000);
  assert.equal(ended.abilityCooldownUntil, 4500);
});

test("a clock that runs backwards never shifts anything backwards", () => {
  const next = shiftClockForPause({ ...base, abilityActiveUntil: 9000 }, 5000, 4000);
  assert.deepEqual(next, { ...base, abilityActiveUntil: 9000 });
});
