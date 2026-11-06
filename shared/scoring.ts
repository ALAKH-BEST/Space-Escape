/**
 * The one scoring rule for a run: 12 points for every second of play, up to
 * MAX_RUN_SECONDS. The game shows this number live and the server records the
 * same rule, so the score on screen during a run is the score on the results
 * screen.
 */
export const SCORE_PER_SECOND = 12;
export const MAX_RUN_SECONDS = 15 * 60;
export const MAX_SCORE = SCORE_PER_SECOND * MAX_RUN_SECONDS;

export function scoreForPlayTime(playMs: number) {
  if (!Number.isFinite(playMs)) return 0;
  const seconds = Math.max(0, Math.min(MAX_RUN_SECONDS, playMs / 1000));
  return Math.min(MAX_SCORE, Math.floor(seconds * SCORE_PER_SECOND));
}
