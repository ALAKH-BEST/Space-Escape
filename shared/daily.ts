/**
 * The daily challenge: everyone who plays on the same UTC day gets the same
 * course of obstacles. The day, and the seed that makes the course, come from
 * the date alone, so the server and every client agree without storing anything.
 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The UTC calendar day for a moment, as YYYY-MM-DD. */
export function dailyDate(now: number = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function isDailyDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** A stable number from 1 to 2^31 - 2 for a day, the same on every machine. */
export function dailySeed(date: string) {
  // FNV-1a over the date text, then folded into the range the game's generator uses.
  let hash = 2166136261;
  for (let i = 0; i < date.length; i++) {
    hash ^= date.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash % 2_147_483_646) + 1;
}

/** When the given day ends (the next UTC midnight), in milliseconds since the epoch. */
export function dailyEndsAt(date: string) {
  return new Date(`${date}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000;
}
