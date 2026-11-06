// The player's best solo score on this device, shown on the results screen.
// Display only: it never touches scoring, the leaderboard or what the server stores.

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

const STORAGE_KEY = "astrododge:personal-best:v1";

const memory = new Map<string, string>();
const memoryStorage: StorageLike = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => void memory.set(key, value),
};

function defaultStorage(): StorageLike {
  try {
    // Touching localStorage can throw (private mode, blocked storage in an iframe).
    const probe = "__astrododge_best_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memoryStorage;
  }
}

function cleanScore(value: unknown): number | null {
  const score = typeof value === "string" ? Number(value) : value;
  return typeof score === "number" && Number.isFinite(score) && score > 0 ? Math.floor(score) : null;
}

/** The saved best score, or null if the player has none yet. */
export function readPersonalBest(storage: StorageLike = defaultStorage()): number | null {
  try {
    return cleanScore(storage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export type PersonalBestResult = {
  /** The best score after this run. */
  best: number;
  /** The best score before this run, or null if this was the first scoring run. */
  previous: number | null;
  /** True when this run beat the previous best. */
  isNewBest: boolean;
};

/** Compares a finished run with the saved best and saves it if it is higher. */
export function recordPersonalBest(score: number, storage: StorageLike = defaultStorage()): PersonalBestResult {
  const previous = readPersonalBest(storage);
  const run = cleanScore(score);
  if (run === null || (previous !== null && run <= previous)) {
    return { best: previous ?? 0, previous, isNewBest: false };
  }
  try {
    storage.setItem(STORAGE_KEY, String(run));
  } catch {
    // The best still shows for this session if saving fails.
    memoryStorage.setItem(STORAGE_KEY, String(run));
  }
  return { best: run, previous, isNewBest: true };
}
