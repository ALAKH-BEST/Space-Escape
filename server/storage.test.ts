import assert from "node:assert/strict";
import { after, before, test } from "node:test";

// These tests need a real Postgres (DATABASE_URL) with the schema pushed (npm run db:push).
const enabled = Boolean(process.env.DATABASE_URL);
const options = { skip: enabled ? false : "DATABASE_URL is not set" };

let storage: typeof import("./storage").storage;
let pool: typeof import("./db").pool;

before(async () => {
  if (!enabled) return;
  ({ storage } = await import("./storage"));
  ({ pool } = await import("./db"));
});
after(async () => {
  if (enabled) await pool.end();
});

async function newUser() {
  return storage.createUser({ username: `t-${Date.now()}-${Math.random().toString(36).slice(2)}`, password: "x" });
}

test("the same run submitted many times at once pays out once", options, async () => {
  const user = await newUser();
  const runId = crypto.randomUUID();
  const results = await Promise.all(
    Array.from({ length: 10 }, () => storage.createScore({ userId: user.id, runId, score: 600 })),
  );
  assert.equal(results.filter((r) => !r.duplicate).length, 1);
  assert.equal(results.reduce((sum, r) => sum + r.gemsEarned, 0), 60);
  assert.equal((await storage.getProgression(user.id)).gems, 60);
});

test("different runs each pay out", options, async () => {
  const user = await newUser();
  await storage.createScore({ userId: user.id, runId: crypto.randomUUID(), score: 100 });
  await storage.createScore({ userId: user.id, runId: crypto.randomUUID(), score: 100 });
  assert.equal((await storage.getProgression(user.id)).gems, 20);
});

test("a purchase made while a score pays out keeps both", options, async () => {
  const user = await newUser();
  // Enough gems for the cheapest ship plus a margin.
  const { ships } = await import("@shared/ships");
  const [shipId, ship] = Object.entries(ships).filter(([id]) => id !== "vanguard").sort((a, b) => a[1].price - b[1].price)[0];
  await storage.createScore({ userId: user.id, runId: crypto.randomUUID(), score: ship.price * 10 });
  const before = (await storage.getProgression(user.id)).gems;

  const [, scored] = await Promise.all([
    storage.purchaseShip(user.id, shipId as never),
    storage.createScore({ userId: user.id, runId: crypto.randomUUID(), score: 500 }),
  ]);
  const after = await storage.getProgression(user.id);
  assert.ok(after.ownedShips.includes(shipId as never));
  assert.equal(after.gems, before - ship.price + scored.gemsEarned);
});
