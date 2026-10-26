import { useEffect, useSyncExternalStore } from "react";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import {
  getAudioVolume,
  isMusicMuted,
  setAudioVolume,
  setMusicMuted,
  subscribeAudioVolume,
  subscribeMusicMuted,
  toggleMusicMuted,
} from "@/lib/background-music";

// Mute/unmute. If the volume has been dragged to zero, bring sound back at a
// comfortable level instead of appearing to do nothing.
function toggleSound() {
  if (getAudioVolume() === 0) {
    setAudioVolume(0.6);
    setMusicMuted(false);
  } else {
    toggleMusicMuted();
  }
}

export function MusicToggle({
  className = "absolute left-4 top-4 z-20",
  popoverAlign = "left",
}: {
  className?: string;
  /** Which side the volume slider opens on: "left" opens it to the right of the button, "right" to its left (use near the right edge). */
  popoverAlign?: "left" | "right";
}) {
  const muted = useSyncExternalStore(subscribeMusicMuted, isMusicMuted, () => false);
  const volume = useSyncExternalStore(subscribeAudioVolume, getAudioVolume, () => 1);
  const silent = muted || volume === 0;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "m" && event.key !== "M") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      toggleSound();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const VolumeIcon = silent ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className={`${className} group`}>
      <button
        type="button"
        onClick={(event) => {
          toggleSound();
          event.currentTarget.blur();
        }}
        aria-label={silent ? "Unmute sound" : "Mute sound"}
        aria-pressed={silent}
        title={silent ? "Sound off (M)" : "Sound on (M) — hover for volume"}
        className={`flex h-10 w-10 items-center justify-center rounded-lg border bg-black/60 backdrop-blur-md transition-colors hover:border-white/40 ${
          silent ? "border-white/20 text-muted-foreground" : "border-primary/50 text-cyan-300"
        }`}
      >
        <VolumeIcon className="h-5 w-5" aria-hidden="true" />
      </button>

      <div
        className={`pointer-events-none absolute top-0 z-30 flex h-10 items-center opacity-0 transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 ${
          popoverAlign === "right" ? "right-full pr-2" : "left-full pl-2"
        }`}
      >
        <div className="w-40 rounded-lg border border-white/15 bg-black/80 px-3 py-3 shadow-lg backdrop-blur-md">
          <Slider
            aria-label="Volume"
            min={0}
            max={100}
            step={1}
            value={[Math.round((muted ? 0 : volume) * 100)]}
            onValueChange={([next]) => {
              const level = next / 100;
              setAudioVolume(level);
              if (level > 0 && muted) setMusicMuted(false);
            }}
          />
        </div>
      </div>
    </div>
  );
}
