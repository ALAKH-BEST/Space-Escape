import { useMotionAllowed } from "@/hooks/use-motion";
import { Starfield } from "./Starfield";
import "./space-backdrop.css";

/**
 * Slow, quiet motion behind a screen: soft theme-coloured light drifting like aurora, an
 * interactive star field, now and then a shooting star, and a ship passing far away. It sits
 * behind everything and ignores the pointer's clicks. Nothing renders when motion is switched off.
 */
export function SpaceBackdrop({ shipColor }: { shipColor?: string }) {
  const allowed = useMotionAllowed();
  if (!allowed) return null;
  return (
    <div className="space-backdrop" aria-hidden="true" style={shipColor ? ({ "--backdrop-ship": shipColor } as React.CSSProperties) : undefined}>
      <div className="space-aurora space-aurora-a" />
      <div className="space-aurora space-aurora-b" />
      <div className="space-aurora space-aurora-c" />
      <Starfield />
      <span className="space-backdrop-streak" style={{ top: "14%", animationDelay: "3s" }} />
      <span className="space-backdrop-streak" style={{ top: "38%", animationDelay: "11s", animationDuration: "31s" }} />
      <svg className="space-backdrop-ship" viewBox="0 0 64 32" width="64" height="32">
        <path d="M2 16 L26 6 L50 12 L62 16 L50 20 L26 26 Z" fill="currentColor" opacity="0.55" />
        <path d="M0 16 L-22 14 L-22 18 Z" fill="currentColor" opacity="0.25" />
      </svg>
    </div>
  );
}
