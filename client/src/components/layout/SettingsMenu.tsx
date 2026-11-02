import { useSyncExternalStore } from "react";
import { Settings } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { setVisualEffectsEnabled, subscribeVisualEffects, visualEffectsEnabled } from "@/lib/game-effects";

export function SettingsMenu() {
  const effects = useSyncExternalStore(subscribeVisualEffects, visualEffectsEnabled, () => true);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-background/40 text-primary transition-colors hover:bg-primary/10"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 font-mono">
        <div className="mb-3 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Settings</div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <label htmlFor="visual-effects" className="block cursor-pointer text-sm text-foreground">
              Visual effects
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Engine trail, crash effects and score pop. Always off if your device asks for reduced motion.
            </p>
          </div>
          <Switch id="visual-effects" checked={effects} onCheckedChange={setVisualEffectsEnabled} aria-label="Visual effects" />
        </div>
      </PopoverContent>
    </Popover>
  );
}
