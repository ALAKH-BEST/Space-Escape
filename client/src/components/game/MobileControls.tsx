import { useCallback, useEffect, useState, type PointerEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

type DirectionKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";
type DirectionKeys = Record<DirectionKey, boolean>;

const directions: Array<{
  key: DirectionKey;
  label: string;
  Icon: typeof ChevronUp;
  placement: string;
}> = [
  { key: "ArrowUp", label: "Move up", Icon: ChevronUp, placement: "col-start-2 row-start-1" },
  { key: "ArrowLeft", label: "Move left", Icon: ChevronLeft, placement: "col-start-1 row-start-2" },
  { key: "ArrowDown", label: "Move down", Icon: ChevronDown, placement: "col-start-2 row-start-2" },
  { key: "ArrowRight", label: "Move right", Icon: ChevronRight, placement: "col-start-3 row-start-2" },
];

export function MobileControls({ keys }: { keys: DirectionKeys }) {
  const [pressedKeys, setPressedKeys] = useState<Set<DirectionKey>>(() => new Set());

  const releaseAll = useCallback(() => {
    directions.forEach(({ key }) => {
      keys[key] = false;
    });
    setPressedKeys(new Set());
  }, [keys]);

  useEffect(() => {
    const releaseWhenHidden = () => {
      if (document.hidden) releaseAll();
    };
    document.addEventListener("visibilitychange", releaseWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", releaseWhenHidden);
      directions.forEach(({ key }) => {
        keys[key] = false;
      });
    };
  }, [keys, releaseAll]);

  const press = (key: DirectionKey, event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    keys[key] = true;
    setPressedKeys((current) => new Set(current).add(key));
  };

  const release = (key: DirectionKey) => {
    keys[key] = false;
    setPressedKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  };

  return (
    <div className="game-mobile-dpad" role="group" aria-label="Touch movement controls">
      {directions.map(({ key, label, Icon, placement }) => (
        <button
          key={key}
          type="button"
          aria-label={label}
          aria-pressed={pressedKeys.has(key)}
          className={`flex h-14 w-14 touch-none select-none items-center justify-center rounded-xl border border-white/25 text-white shadow-lg backdrop-blur-md transition-colors ${placement} ${
            pressedKeys.has(key)
              ? "bg-primary/80 shadow-primary/40"
              : "bg-slate-950/65 active:bg-primary/70"
          }`}
          onPointerDown={(event) => press(key, event)}
          onPointerUp={() => release(key)}
          onPointerCancel={() => release(key)}
          onLostPointerCapture={() => release(key)}
          onContextMenu={(event) => event.preventDefault()}
          onDragStart={(event) => event.preventDefault()}
        >
          <Icon className="h-7 w-7" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
