import assert from "node:assert/strict";
import { test } from "node:test";
import { isUniqueViolation, registerInputSchema, toPublicUser } from "./auth-input";

test("registration keeps only username and password", () => {
  const parsed = registerInputSchema.parse({
    username: "  Pilot  ",
    password: "correct horse",
    gems: 999_999,
    ownedShips: ["vanguard", "phantom", "titan", "nova"],
    equippedShip: "nova",
    id: 1,
  });
  assert.deepEqual(parsed, { username: "Pilot", password: "correct horse" });
});

test("registration rejects missing, short and oversized credentials", () => {
  for (const body of [
    {},
    { username: "ab", password: "longenough" },
    { username: "Pilot", password: "short" },
    { username: "Pilot" },
    { username: "x".repeat(25), password: "longenough" },
    { username: "Pilot", password: "x".repeat(129) },
    { username: 5, password: "longenough" },
  ]) {
    assert.equal(registerInputSchema.safeParse(body).success, false, JSON.stringify(body));
  }
});

test("the public user never carries the password hash", () => {
  const user = { id: 1, username: "Pilot", password: "hash.salt", gems: 5, ownedShips: ["vanguard"], equippedShip: "vanguard" };
  const out = toPublicUser(user);
  assert.equal("password" in out, false);
  assert.equal(out.username, "Pilot");
  assert.equal(out.gems, 5);
});

test("recognises a Postgres unique violation", () => {
  assert.equal(isUniqueViolation({ code: "23505" }), true);
  assert.equal(isUniqueViolation(new Error("x")), false);
  assert.equal(isUniqueViolation(null), false);
});
