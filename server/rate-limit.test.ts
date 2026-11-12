import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createAuthLimiters } from "./rate-limit";

async function withApp(run: (base: string) => Promise<void>) {
  const limiters = createAuthLimiters({ loginMax: 3, registerMax: 2 });
  const app = express();
  app.use(express.json());
  app.post("/login", limiters.login, (req, res) =>
    req.body.password === "right" ? res.json({ ok: true }) : res.status(401).json({ message: "no" }),
  );
  app.post("/register", limiters.register, (_req, res) => res.status(201).json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const post = (url: string, body: object) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("repeated failed logins are throttled with a JSON message", async () => {
  await withApp(async (base) => {
    for (let i = 0; i < 3; i++) assert.equal((await post(`${base}/login`, { password: "wrong" })).status, 401);
    const blocked = await post(`${base}/login`, { password: "wrong" });
    assert.equal(blocked.status, 429);
    assert.match((await blocked.json()).message, /Too many login attempts/);
  });
});

test("successful logins never count toward the limit", async () => {
  await withApp(async (base) => {
    for (let i = 0; i < 10; i++) assert.equal((await post(`${base}/login`, { password: "right" })).status, 200);
  });
});

test("signups are throttled too", async () => {
  await withApp(async (base) => {
    assert.equal((await post(`${base}/register`, {})).status, 201);
    assert.equal((await post(`${base}/register`, {})).status, 201);
    assert.equal((await post(`${base}/register`, {})).status, 429);
  });
});
