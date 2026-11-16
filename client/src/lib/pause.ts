/**
 * Pausing a run: the animation stops, but the browser clock does not. Anything the game timed against
 * `performance.now()` has to be moved forward by the length of the pause, or an ability would run out,
 * a spawn would come due, and "time survived" would grow while the pilot was on a phone call.
 */

export type PauseClock = {
  /** When the run began. */
  startedAt: number;
  /** When the last obstacle spawned. */
  lastSpawn: number;
  /** When the active ability ends (0 or in the past when none is active). */
  abilityActiveUntil: number;
  /** When the ability can be used again (0 or in the past when it is ready). */
  abilityCooldownUntil: number;
};

/** A deadline still ahead when the pause began moves out by the pause; one already passed stays passed. */
function shiftDeadline(deadline: number, pausedAt: number, pausedMs: number) {
  return deadline > pausedAt ? deadline + pausedMs : deadline;
}

/** The run's clock after a pause from `pausedAt` to `resumedAt` (both `performance.now()` readings). */
export function shiftClockForPause(clock: PauseClock, pausedAt: number, resumedAt: number): PauseClock {
  const pausedMs = Math.max(0, resumedAt - pausedAt);
  return {
    startedAt: clock.startedAt + pausedMs,
    lastSpawn: clock.lastSpawn + pausedMs,
    abilityActiveUntil: shiftDeadline(clock.abilityActiveUntil, pausedAt, pausedMs),
    abilityCooldownUntil: shiftDeadline(clock.abilityCooldownUntil, pausedAt, pausedMs),
  };
}
