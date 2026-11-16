import assert from "node:assert/strict";
import test from "node:test";
import { HttpError, isRetryableError, withRetries } from "./retry";

const noWait = async () => {};

test("which failures are worth retrying", () => {
  for (const status of [500, 502, 503, 408, 429]) assert.equal(isRetryableError(new HttpError(status)), true, String(status));
  for (const status of [400, 401, 403, 404, 409]) assert.equal(isRetryableError(new HttpError(status)), false, String(status));
  assert.equal(isRetryableError(new TypeError("Failed to fetch")), true);
  const abort = new Error("aborted");
  abort.name = "AbortError";
  assert.equal(isRetryableError(abort), true);
  assert.equal(isRetryableError(new Error("bad json")), false);
});

test("succeeds on the first try without waiting", async () => {
  const waits: number[] = [];
  const result = await withRetries(async () => "ok", { delaysMs: [1000, 2000], sleep: async (ms) => void waits.push(ms) });
  assert.deepEqual(result, { value: "ok", attempts: 1 });
  assert.deepEqual(waits, []);
});

test("keeps trying through a bad connection and reports the attempts", async () => {
  let calls = 0;
  const waits: number[] = [];
  const result = await withRetries(
    async () => {
      if (++calls < 3) throw new TypeError("Failed to fetch");
      return "ok";
    },
    { delaysMs: [1000, 2500, 5000], sleep: async (ms) => void waits.push(ms) },
  );
  assert.deepEqual(result, { value: "ok", attempts: 3 });
  assert.deepEqual(waits, [1000, 2500]);
});

test("gives up after the last delay and throws the last error", async () => {
  let calls = 0;
  await assert.rejects(
    withRetries(async () => {
      calls++;
      throw new HttpError(503);
    }, { delaysMs: [1, 1], sleep: noWait }),
    (error: unknown) => error instanceof HttpError && error.status === 503,
  );
  assert.equal(calls, 3);
});

test("does not retry a rejection that would fail again", async () => {
  let calls = 0;
  await assert.rejects(
    withRetries(async () => {
      calls++;
      throw new HttpError(403);
    }, { delaysMs: [1, 1, 1], sleep: noWait }),
  );
  assert.equal(calls, 1);
});
