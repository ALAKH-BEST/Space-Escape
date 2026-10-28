import assert from "node:assert/strict";
import test from "node:test";
import { equipShip, purchaseShip, readProgression, recordRun, type StorageLike } from "./local-game-store";

function memoryStorage(initial?: string): StorageLike & { value: string | null } {
  const box = { value: initial ?? null as string | null };
  return {
    get value() {
      return box.value;
    },
    getItem: () => box.value,
    setItem: (_key, value) => {
      box.value = value;
    },
  };
}

test("a new pilot starts with the Vanguard, no gems", () => {
  assert.deepEqual(readProgression(memoryStorage()), { gems: 0, ownedShips: ["vanguard"], equippedShip: "vanguard" });
});

test("a finished run earns one gem per ten points, rounded down, and is saved", () => {
  const storage = memoryStorage();
  assert.deepEqual(recordRun(259, storage), { score: 259, gemsEarned: 25, totalGems: 25 });
  assert.equal(recordRun(1000, storage).totalGems, 125);
  assert.equal(readProgression(storage).gems, 125);
});

test("nonsense scores earn nothing", () => {
  const storage = memoryStorage();
  assert.equal(recordRun(-50, storage).gemsEarned, 0);
  assert.equal(recordRun(Number.NaN, storage).gemsEarned, 0);
  assert.equal(recordRun(Number.POSITIVE_INFINITY, storage).gemsEarned, 0);
});

test("buying a ship spends gems and owns it, without equipping it (like the server)", () => {
  const storage = memoryStorage();
  recordRun(10_000, storage); // 1000 gems
  const next = purchaseShip("phantom", storage);
  assert.equal(next.gems, 0);
  assert.deepEqual(next.ownedShips, ["vanguard", "phantom"]);
  assert.equal(next.equippedShip, "vanguard");
});

test("a ship cannot be bought without enough gems or twice", () => {
  const storage = memoryStorage();
  assert.throws(() => purchaseShip("phantom", storage), /1,000 gems/);
  recordRun(20_000, storage);
  purchaseShip("phantom", storage);
  assert.throws(() => purchaseShip("phantom", storage), /already owned/);
});

test("only owned ships can be equipped", () => {
  const storage = memoryStorage();
  assert.throws(() => equipShip("titan", storage), /Purchase this ship/);
  recordRun(10_000, storage);
  purchaseShip("phantom", storage);
  assert.equal(equipShip("phantom", storage).equippedShip, "phantom");
  assert.equal(readProgression(storage).equippedShip, "phantom");
});

test("corrupt or tampered saved data falls back safely", () => {
  assert.equal(readProgression(memoryStorage("not json")).gems, 0);
  const tampered = memoryStorage(JSON.stringify({ gems: -5, ownedShips: ["nova", "bogus"], equippedShip: "titan" }));
  assert.deepEqual(readProgression(tampered), { gems: 0, ownedShips: ["vanguard", "nova"], equippedShip: "vanguard" });
});
