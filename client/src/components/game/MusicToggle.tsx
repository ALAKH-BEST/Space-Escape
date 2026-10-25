import { useEffect, useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isMusicMuted, subscribeMusicMuted, toggleMusicMuted } from "@/lib/background-music";

export function MusicToggle({ className = "absolute left-4 top-4 z-20" }: { className?: string }) {
  const muted = useSyncExternalStore(subscribeMusicMuted, isMusicMuted, () => false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "m" && event.key !== "M") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      toggleMusicMuted();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <button
      type="button"
      onClick={(event) => {
        toggleMusicMuted();
        event.currentTarget.blur();
      }}
      aria-label={muted ? "Unmute music" : "Mute music"}
      aria-pressed={muted}
      title={muted ? "Music off (M)" : "Music on (M)"}
      className={`${className} flex h-10 w-10 items-center justify-center rounded-lg border bg-black/60 backdrop-blur-md transition-colors hover:border-white/40 ${
        muted ? "border-white/20 text-muted-foreground" : "border-primary/50 text-cyan-300"
      }`}
    >
      {muted ? <VolumeX className="h-5 w-5" aria-hidden="true" /> : <Volume2 className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}
