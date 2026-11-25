import { effectsActive, subscribeVisualEffects } from "@/lib/game-effects";

/**
 * Whether decorative animation should play: the player's "visual effects" setting is on and the
 * device has not asked for reduced motion. This is the same rule the game's effects follow.
 */
export function motionAllowed() {
  return effectsActive();
}

/** Calls `listener` when either the setting or the device's reduced-motion preference changes. */
export function subscribeMotion(listener: () => void) {
  const stopSetting = subscribeVisualEffects(listener);
  let query: MediaQueryList | undefined;
  try {
    query = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : undefined;
    query?.addEventListener("change", listener);
  } catch {
    query = undefined;
  }
  return () => {
    stopSetting();
    query?.removeEventListener("change", listener);
  };
}
