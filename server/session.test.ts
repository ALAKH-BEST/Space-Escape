import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";

// Needs a real Postgres (DATABASE_URL) because sessions are stored there.
const enabled = Boolean(process.env.DATABASE_URL);
const options = { skip: enabled ? false : "DATABASE_URL is not set" };

async function startApp() {
  const { setupAuth } = await import("./auth");
  const app = express();
  app.use(express.json());
  setupAuth(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

after(async () => {
  if (enabled) await (await import("./db")).pool.end();
});

test("a login survives a server restart", options, async () => {
  const username = `sess-${Date.now()}`;
  const first = await startApp();
  const registered = await fetch(`${first.base}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "correct horse" }),
  });
  assert.equal(registered.status, 201);
  const cookie = registered.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  await new Promise((resolve) => first.server.close(resolve));

  // A brand new app instance, as after a redeploy, with an empty process memory.
  const second = await startApp();
  try {
    const me = await fetch(`${second.base}/api/user`, { headers: { cookie } });
    assert.equal(me.status, 200);
    const body = await me.json();
    assert.equal(body.username, username);
    assert.equal("password" in body, false);
  } finally {
    await new Promise((resolve) => second.server.close(resolve));
  }
});
