import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateAuthoritativeScore,
  issueRun,
  MAX_AUTHORITATIVE_SCORE,
  verifyRun,
} from "./run-authority";

process.env.SESSION_SECRET = "run-authority-test-secret";

test("scores are calculated from the signed server run, not client input", () => {
  const run = issueRun(42, "solo");
  const claims = verifyRun(run.runId, run.runToken, 42, run.startedAt + 10_000);

  assert.equal(claims.runId, run.runId);
  assert.equal(calculateAuthoritativeScore(claims.startedAt, claims.startedAt + 10_000), 120);
  assert.equal(
    calculateAuthoritativeScore(claims.startedAt, claims.startedAt + 60 * 60 * 1_000),
    MAX_AUTHORITATIVE_SCORE,
  );
});

test("tampered or cross-user run tokens are rejected", () => {
  const run = issueRun(42, "solo");
  const [payload, signature] = run.runToken.split(".");
  assert(payload && signature);
  const replacement = signature.endsWith("a") ? "b" : "a";

  assert.throws(() => verifyRun(run.runId, `${payload}.${signature.slice(0, -1)}${replacement}`, 42));
  assert.throws(() => verifyRun(run.runId, run.runToken, 99));
});

// ---------------------------------------------------------------------------
// Heartbeats: a run is only credited for time it was genuinely being played.
// ---------------------------------------------------------------------------

import {
  calculateRunScore,
  MAX_HEARTBEAT_GAP_MS,
  refreshRun,
} from "./run-authority";

const USER_ID = 42;

/** Plays a run: a heartbeat every `everyMs` until `untilMs`, then returns the latest token. */
function playRun(startedAt: number, untilMs: number, everyMs = 2_000) {
  const run = issueRun(USER_ID, "solo");
  let token = run.runToken;
  for (let at = everyMs; at <= untilMs; at += everyMs) {
    token = refreshRun(run.runId, token, USER_ID, run.startedAt + at).runToken;
  }
  return { run, token };
}

test("an honest run with regular heartbeats scores exactly its wall-clock time", () => {
  const { run, token } = playRun(0, 60_000);
  const submittedAt = run.startedAt + 61_300;
  const claims = verifyRun(run.runId, token, USER_ID, submittedAt);

  assert.equal(calculateRunScore(claims, submittedAt), calculateAuthoritativeScore(run.startedAt, submittedAt));
  assert.equal(calculateRunScore(claims, submittedAt), Math.floor(61.3 * 12));
});

test("a run that is started and left idle earns at most one heartbeat gap of credit", () => {
  const run = issueRun(USER_ID, "solo");
  const submittedAt = run.startedAt + 15 * 60 * 1_000;
  const claims = verifyRun(run.runId, run.runToken, USER_ID, submittedAt);

  assert.equal(calculateRunScore(claims, submittedAt), (MAX_HEARTBEAT_GAP_MS / 1000) * 12);
});

test("time while the game is hidden or silent is not credited beyond one gap", () => {
  const { run, token } = playRun(0, 20_000);
  const returnedAt = run.startedAt + 20_000 + 5 * 60 * 1_000;
  const resumed = refreshRun(run.runId, token, USER_ID, returnedAt).runToken;
  const claims = verifyRun(run.runId, resumed, USER_ID, returnedAt);

  // 20s of real play + one capped gap, not the five idle minutes.
  assert.equal(calculateRunScore(claims, returnedAt), (20 + MAX_HEARTBEAT_GAP_MS / 1000) * 12);
});

test("replaying one token cannot add credit; a fork of an old token earns nothing extra", () => {
  const { run, token } = playRun(0, 10_000);
  const at = run.startedAt + 10_000 + 6_000;
  const once = verifyRun(run.runId, refreshRun(run.runId, token, USER_ID, at).runToken, USER_ID, at);
  const again = verifyRun(run.runId, refreshRun(run.runId, token, USER_ID, at).runToken, USER_ID, at);

  assert.equal(calculateRunScore(once, at), calculateRunScore(again, at));
  assert.equal(calculateRunScore(once, at), 16 * 12);
});

test("credited time can never exceed real elapsed time, however often heartbeats are sent", () => {
  const run = issueRun(USER_ID, "solo");
  let token = run.runToken;
  for (let index = 0; index < 500; index += 1) {
    token = refreshRun(run.runId, token, USER_ID, run.startedAt + 1_000).runToken;
  }
  const claims = verifyRun(run.runId, token, USER_ID, run.startedAt + 1_000);

  assert.equal(calculateRunScore(claims, run.startedAt + 1_000), 12);
});

test("heartbeat tokens cannot be edited to claim more play time", () => {
  const { run, token } = playRun(0, 4_000);
  const [payload, signature] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  claims.activeMs += 600_000;
  const forged = `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${signature}`;

  assert.throws(() => verifyRun(run.runId, forged, USER_ID, run.startedAt + 5_000));
});

test("old-style run tokens still work briefly for runs in flight, then expire", () => {
  const legacy = issueRun(USER_ID, "solo", { legacy: true });
  const soon = legacy.startedAt + 60_000;
  const later = legacy.startedAt + 21 * 60 * 1_000;

  assert.equal(calculateRunScore(verifyRun(legacy.runId, legacy.runToken, USER_ID, soon), soon), 720);
  assert.throws(() => verifyRun(legacy.runId, legacy.runToken, USER_ID, later), /expired/);
  assert.throws(() => refreshRun(legacy.runId, legacy.runToken, USER_ID, soon), /heartbeats/);

  process.env.ALLOW_LEGACY_RUN_TOKENS = "1";
  try {
    assert.doesNotThrow(() => verifyRun(legacy.runId, legacy.runToken, USER_ID, later));
  } finally {
    delete process.env.ALLOW_LEGACY_RUN_TOKENS;
  }
});

// ---------------------------------------------------------------------------
// End to end over HTTP: the real routes, with only the database faked.
// ---------------------------------------------------------------------------

import { mock } from "node:test";
import type { AddressInfo } from "node:net";

async function startTestServer() {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:1/test";
  const express = (await import("express")).default;
  const { createServer } = await import("node:http");
  const { registerRoutes } = await import("./routes");
  const { storage } = await import("./storage");

  const submitted: Array<{ userId: number; runId: string; score: number }> = [];
  const user = { id: 7, username: "pilot", password: "x", gems: 0, ownedShips: ["vanguard"], equippedShip: "vanguard" };
  Object.assign(storage, {
    getUser: async () => user,
    getUserByUsername: async () => undefined,
    createUser: async () => user,
    createScore: async (input: { userId: number; runId: string; score: number }) => {
      submitted.push(input);
      return { score: { id: submitted.length, ...input }, gemsEarned: Math.floor(input.score / 10), totalGems: 0, duplicate: false };
    },
  });

  const app = express();
  app.use(express.json());
  const server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const registered = await fetch(`${base}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "pilot", password: "hunter2hunter2" }),
  });
  const cookie = (registered.headers.get("set-cookie") ?? "").split(";")[0];

  const call = (path: string, body: unknown, withCookie = true) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(withCookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });

  return { call, submitted, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test("end to end: honest, idle and hidden-tab runs are scored by real play time", async (t) => {
  const { call, submitted, close } = await startTestServer();
  mock.timers.enable({ apis: ["Date"], now: Date.now() });
  t.after(async () => {
    mock.timers.reset();
    await close();
  });

  const start = async (body: object = { mode: "solo", heartbeat: true }) => {
    const res = await call("/api/runs/start", body);
    assert.equal(res.status, 201);
    return (await res.json()) as { runId: string; runToken: string };
  };
  const beat = async (run: { runId: string }, token: string) => {
    const res = await call("/api/runs/heartbeat", { runId: run.runId, runToken: token });
    assert.equal(res.status, 200);
    return ((await res.json()) as { runToken: string }).runToken;
  };
  const submit = async (run: { runId: string }, token: string) => {
    const res = await call("/api/scores", { runId: run.runId, runToken: token });
    assert.equal(res.status, 201);
    return submitted[submitted.length - 1].score;
  };

  // Honest run: 60s of play with a heartbeat every 2s, dies 1.5s after the last one.
  const honest = await start();
  let token = honest.runToken;
  for (let index = 0; index < 30; index += 1) {
    mock.timers.tick(2_000);
    token = await beat(honest, token);
  }
  mock.timers.tick(1_500);
  assert.equal(await submit(honest, token), Math.floor(61.5 * 12));

  // Start a run, walk away, submit fifteen minutes later.
  const idle = await start();
  mock.timers.tick(15 * 60 * 1_000);
  assert.equal(await submit(idle, idle.runToken), (MAX_HEARTBEAT_GAP_MS / 1000) * 12);

  // Play 20s, hide the tab for five minutes (no heartbeats), come back, die.
  const hidden = await start();
  token = hidden.runToken;
  for (let index = 0; index < 10; index += 1) {
    mock.timers.tick(2_000);
    token = await beat(hidden, token);
  }
  mock.timers.tick(5 * 60 * 1_000);
  assert.equal(await submit(hidden, token), (20 + MAX_HEARTBEAT_GAP_MS / 1000) * 12);

  // An older build that never announces heartbeat support still plays and is
  // scored by the same rules (its score is capped until it is updated).
  const oldBuild = await start({ mode: "solo" });
  mock.timers.tick(10 * 60 * 1_000);
  assert.equal(await submit(oldBuild, oldBuild.runToken), (MAX_HEARTBEAT_GAP_MS / 1000) * 12);
});

test("end to end: heartbeats require a signed-in pilot and a valid token", async (t) => {
  const { call, close } = await startTestServer();
  t.after(close);

  const started = await call("/api/runs/start", { mode: "solo", heartbeat: true });
  const run = (await started.json()) as { runId: string; runToken: string };

  assert.equal((await call("/api/runs/heartbeat", { runId: run.runId, runToken: run.runToken }, false)).status, 401);
  assert.equal((await call("/api/runs/heartbeat", { runId: run.runId, runToken: "not.valid" })).status, 400);
  assert.equal((await call("/api/runs/heartbeat", { runId: "nope", runToken: run.runToken })).status, 400);
  assert.equal((await call("/api/runs/heartbeat", { runId: run.runId, runToken: run.runToken })).status, 200);
});
