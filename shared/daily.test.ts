import assert from "node:assert/strict";
import { test } from "node:test";

import { dailyDate, dailyEndsAt, dailySeed, isDailyDate } from "./daily";

test("the day is the UTC calendar day, whatever the local time zone", () => {
  assert.equal(dailyDate(Date.UTC(2026, 10, 20, 0, 0, 0)), "2026-11-20");
  assert.equal(dailyDate(Date.UTC(2026, 10, 20, 23, 59, 59)), "2026-11-20");
  assert.equal(dailyDate(Date.UTC(2026, 10, 21, 0, 0, 0)), "2026-11-21");
});

test("a day always gives the same seed, and different days give different ones", () => {
  assert.equal(dailySeed("2026-11-20"), dailySeed("2026-11-20"));
  const seeds = new Set<number>();
  for (let day = 1; day <= 365; day++) {
    seeds.add(dailySeed(dailyDate(Date.UTC(2027, 0, day))));
  }
  assert.equal(seeds.size, 365);
});

test("seeds stay inside the range the game's generator expects", () => {
  for (let day = 1; day <= 2000; day++) {
    const seed = dailySeed(dailyDate(Date.UTC(2026, 0, day)));
    assert.ok(Number.isInteger(seed) && seed >= 1 && seed < 2_147_483_647, `seed ${seed}`);
  }
});

test("only real calendar dates are accepted", () => {
  assert.equal(isDailyDate("2026-11-20"), true);
  assert.equal(isDailyDate("2026-02-30"), false);
  assert.equal(isDailyDate("2026-13-01"), false);
  assert.equal(isDailyDate("20-11-2026"), false);
  assert.equal(isDailyDate(20261120), false);
  assert.equal(isDailyDate(undefined), false);
});

test("a day ends at the next UTC midnight", () => {
  assert.equal(dailyEndsAt("2026-11-20"), Date.UTC(2026, 10, 21));
  assert.equal(dailyEndsAt("2026-12-31"), Date.UTC(2027, 0, 1));
});
