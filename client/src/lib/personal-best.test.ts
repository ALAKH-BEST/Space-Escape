import assert from "node:assert/strict";
import test from "node:test";
import { readPersonalBest, recordPersonalBest, type StorageLike } from "./personal-best";

function memoryStorage(initial?: string): StorageLike & { value: string | null } {
  const box = { value: initial ?? (null as string | null) };
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

test("a new pilot has no best", () => {
  assert.equal(readPersonalBest(memoryStorage()), null);
});

test("the first scoring run becomes the best, with nothing before it", () => {
  const storage = memoryStorage();
  assert.deepEqual(recordPersonalBest(1200, storage), { best: 1200, previous: null, isNewBest: true });
  assert.equal(readPersonalBest(storage), 1200);
});

test("a higher score replaces the best and reports the old one", () => {
  const storage = memoryStorage("1200");
  assert.deepEqual(recordPersonalBest(1850, storage), { best: 1850, previous: 1200, isNewBest: true });
  assert.equal(readPersonalBest(storage), 1850);
});

test("a lower or equal score leaves the best alone", () => {
  const storage = memoryStorage("1200");
  assert.deepEqual(recordPersonalBest(900, storage), { best: 1200, previous: 1200, isNewBest: false });
  assert.deepEqual(recordPersonalBest(1200, storage), { best: 1200, previous: 1200, isNewBest: false });
  assert.equal(readPersonalBest(storage), 1200);
});

test("a zero or nonsense score never counts, and never overwrites a best", () => {
  const empty = memoryStorage();
  assert.deepEqual(recordPersonalBest(0, empty), { best: 0, previous: null, isNewBest: false });
  assert.equal(readPersonalBest(empty), null);
  const storage = memoryStorage("500");
  for (const bad of [-10, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(recordPersonalBest(bad, storage).isNewBest, false);
  }
  assert.equal(readPersonalBest(storage), 500);
});

test("scores are whole numbers", () => {
  const storage = memoryStorage();
  assert.equal(recordPersonalBest(99.9, storage).best, 99);
});

test("a corrupted saved value is treated as no best", () => {
  for (const junk of ["abc", "-5", "0", "NaN", ""]) {
    assert.equal(readPersonalBest(memoryStorage(junk)), null, junk);
  }
  assert.equal(recordPersonalBest(300, memoryStorage("abc")).isNewBest, true);
});

test("storage that throws does not break the run", () => {
  const broken: StorageLike = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readPersonalBest(broken), null);
  assert.equal(recordPersonalBest(700, broken).isNewBest, true);
});
