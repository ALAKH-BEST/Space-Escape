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

test("the daily board keeps each pilot's best run and ranks pilots", options, async () => {
  const date = `${3000 + Math.floor(Math.random() * 5000)}-01-${String(1 + Math.floor(Math.random() * 28)).padStart(2, "0")}`;
  const [a, b, c] = [await newUser(), await newUser(), await newUser()];
  const play = (userId: number, score: number, challengeDate?: string) =>
    storage.createScore({ userId, runId: crypto.randomUUID(), score, challengeDate });

  await play(a.id, 300, date);
  await play(a.id, 900, date); // a's best
  await play(a.id, 100, date);
  await play(b.id, 600, date);
  await play(c.id, 5000); // an ordinary run: not on any daily board

  const board = (await storage.getDailyScores(date)).filter((e) => [a.id, b.id, c.id].includes(e.userId));
  assert.deepEqual(board.map((e) => [e.userId, e.score]), [[a.id, 900], [b.id, 600]]);

  const standingA = await storage.getDailyStanding(date, a.id);
  const standingB = await storage.getDailyStanding(date, b.id);
  assert.equal(standingA?.score, 900);
  assert.equal(standingB?.score, 600);
  assert.equal(standingB!.rank, standingA!.rank + 1);
  assert.equal(await storage.getDailyStanding(date, c.id), null);
});

test("a daily day only shows its own runs, and a tie goes to whoever scored first", options, async () => {
  const [a, b] = [await newUser(), await newUser()];
  // A far-future day nobody else uses, so reruns against the same database stay independent.
  const year = 3000 + Math.floor(Math.random() * 5000);
  const day1 = `${year}-03-01`;
  const day2 = `${year}-03-02`;
  await storage.createScore({ userId: a.id, runId: crypto.randomUUID(), score: 480, challengeDate: day1 });
  await storage.createScore({ userId: b.id, runId: crypto.randomUUID(), score: 480, challengeDate: day1 });
  await storage.createScore({ userId: b.id, runId: crypto.randomUUID(), score: 1200, challengeDate: day2 });

  assert.deepEqual((await storage.getDailyScores(day1)).map((e) => e.userId), [a.id, b.id]);
  assert.deepEqual((await storage.getDailyScores(day2)).map((e) => e.userId), [b.id]);
  assert.equal((await storage.getDailyStanding(day2, a.id)), null);
});
