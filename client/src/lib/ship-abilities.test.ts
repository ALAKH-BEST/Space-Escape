import assert from "node:assert/strict";
import { test } from "node:test";

import { shipIds, ships, shipsByPrice } from "../../../shared/ships";
import {
  BARRIER_MAX_CHARGES,
  BARRIER_REGEN_MS,
  TIME_WARP_FACTOR,
  hasButtonAbility,
  hasShield,
  movementBoost,
  obstacleSpeedFactor,
  regenerateBarrier,
  startingShields,
} from "./ship-abilities";

test("every ship id has a matching definition", () => {
  assert.deepEqual(Object.keys(ships).sort(), [...shipIds].sort());
  for (const id of shipIds) assert.equal(ships[id].id, id);
});

test("ships have distinct names, colours and prices, and only the starter is free", () => {
  const all = shipIds.map((id) => ships[id]);
  for (const field of ["name", "color", "price"] as const) {
    assert.equal(new Set(all.map((ship) => ship[field])).size, all.length, `two ships share a ${field}`);
  }
  assert.deepEqual(all.filter((ship) => ship.price === 0).map((ship) => ship.id), ["vanguard"]);
});

test("the hangar lists ships cheapest first, starting with the free one", () => {
  const prices = shipsByPrice.map((ship) => ship.price);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  assert.equal(shipsByPrice[0].id, "vanguard");
  assert.equal(shipsByPrice.length, shipIds.length);
});

test("stats stay within the 1 to 5 the hangar draws", () => {
  for (const id of shipIds) {
    for (const stat of ["speed", "handling", "shield"] as const) {
      const value = ships[id][stat];
      assert.ok(Number.isInteger(value) && value >= 1 && value <= 5, `${id} ${stat} ${value}`);
    }
  }
});

test("each ability has the timings its kind needs", () => {
  for (const id of shipIds) {
    const ship = ships[id];
    if (hasButtonAbility(ship)) {
      assert.ok(ship.abilityDuration > 0 && ship.abilityCooldown > ship.abilityDuration, `${id}: a button ability needs a duration and a longer cooldown`);
    } else {
      assert.equal(ship.abilityDuration, 0, `${id} has a duration but no button`);
      assert.equal(ship.abilityCooldown, 0, `${id} has a cooldown but no button`);
    }
    assert.equal(hasButtonAbility(ship) && hasShield(ship), false, `${id} is both a button and a shield ability`);
    assert.equal(ship.abilityKind === "none", ship.ability === "NONE", `${id}: the ability name and kind disagree`);
  }
});

test("shield ships start with their charges and others with none", () => {
  assert.equal(startingShields(ships.titan), 3);
  assert.equal(startingShields(ships.aegis), 1);
  for (const id of ["vanguard", "comet", "phantom", "nova", "eclipse"] as const) assert.equal(startingShields(ships[id]), 0);
});

test("speed boosts apply only while the ability is active", () => {
  assert.equal(movementBoost(ships.nova, true), 1.5);
  assert.equal(movementBoost(ships.comet, true), 1.4);
  assert.equal(movementBoost(ships.nova, false), 1);
  assert.equal(movementBoost(ships.phantom, true), 1);
  assert.equal(movementBoost(ships.eclipse, true), 1);
});

test("Time Warp slows asteroids only for the Eclipse and only while active", () => {
  assert.equal(obstacleSpeedFactor(ships.eclipse, true), TIME_WARP_FACTOR);
  assert.equal(obstacleSpeedFactor(ships.eclipse, false), 1);
  assert.equal(obstacleSpeedFactor(ships.nova, true), 1);
});

test("a barrier rebuilds one charge per interval and stops at the maximum", () => {
  assert.deepEqual(regenerateBarrier(0, 0, BARRIER_REGEN_MS - 1), { charges: 0, progressMs: BARRIER_REGEN_MS - 1 });
  assert.deepEqual(regenerateBarrier(0, BARRIER_REGEN_MS - 1, 1), { charges: 1, progressMs: 0 });
  assert.deepEqual(regenerateBarrier(1, 0, BARRIER_REGEN_MS * 5), { charges: BARRIER_MAX_CHARGES, progressMs: 0 });
  assert.deepEqual(regenerateBarrier(BARRIER_MAX_CHARGES, 4000, 1000), { charges: BARRIER_MAX_CHARGES, progressMs: 0 });
  // Progress carries over, so a run of small frames rebuilds as fast as one long one.
  let state = { charges: 0, progressMs: 0 };
  for (let ms = 0; ms < BARRIER_REGEN_MS * 2; ms += 16) state = regenerateBarrier(state.charges, state.progressMs, 16);
  assert.equal(state.charges, BARRIER_MAX_CHARGES);
  assert.deepEqual(regenerateBarrier(0, 0, -500), { charges: 0, progressMs: 0 });
});
