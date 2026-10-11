import assert from "node:assert/strict";
import test from "node:test";
import { isLastPilotStanding, isNearMiss } from "./game-achievements";

test("near-miss detection only recognizes safe passes inside the close-call window", () => {
  assert.equal(isNearMiss(45, 30), true);
  assert.equal(isNearMiss(54, 30), true);
  assert.equal(isNearMiss(55, 30), false);
  assert.equal(isNearMiss(30, 30), false);
  assert.equal(isNearMiss(Number.NaN, 30), false);
});

test("last-pilot recognition requires the local pilot alive and at least one eliminated rival", () => {
  assert.equal(
    isLastPilotStanding(
      [{ id: "local", alive: true }, { id: "rival", alive: false }],
      "local",
    ),
    true,
  );
  assert.equal(
    isLastPilotStanding(
      [{ id: "local", alive: true }, { id: "rival", alive: true }],
      "local",
    ),
    false,
  );
  assert.equal(isLastPilotStanding([{ id: "local", alive: true }], "local"), false);
  assert.equal(
    isLastPilotStanding(
      [{ id: "local", alive: false }, { id: "rival", alive: false }],
      "local",
    ),
    false,
  );
});
