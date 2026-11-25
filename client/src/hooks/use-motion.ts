import { useEffect, useSyncExternalStore } from "react";
import { motionAllowed, subscribeMotion } from "@/lib/motion-preference";

/** True while decorative animation should play (effects setting on, no reduced-motion request). */
export function useMotionAllowed() {
  const allowed = useSyncExternalStore(subscribeMotion, motionAllowed, () => false);
  // Lets the stylesheet's own ambient animations follow the in-game "visual effects" setting too.
  useEffect(() => {
    document.documentElement.dataset.motion = allowed ? "on" : "off";
  }, [allowed]);
  return allowed;
}
