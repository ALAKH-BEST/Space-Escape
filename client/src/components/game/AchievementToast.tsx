import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles, Trophy } from "lucide-react";
import { playAchievementChime } from "@/lib/achievement-audio";
import { achievementCatalog, type AchievementNotice } from "@/lib/game-achievements";

interface AchievementToastProps {
  notice: AchievementNotice | null;
  onDismiss: () => void;
}

export function AchievementToast({ notice, onDismiss }: AchievementToastProps) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!notice) return;
    playAchievementChime();
    const timeout = window.setTimeout(onDismiss, 4400);
    return () => window.clearTimeout(timeout);
  }, [notice?.sequence, onDismiss]);

  return (
    <div className="pointer-events-none absolute left-1/2 top-5 z-30 w-[min(92%,420px)] -translate-x-1/2">
      <AnimatePresence mode="wait" initial={false}>
        {notice && (
          <motion.div
            key={notice.sequence}
            role="status"
            aria-live="polite"
            initial={reduceMotion
              ? { opacity: 0 }
              : { opacity: 0, y: -16, scale: 0.94, filter: "blur(5px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={reduceMotion
              ? { opacity: 0 }
              : { opacity: 0, y: -10, scale: 0.97, filter: "blur(3px)" }}
            transition={{ duration: reduceMotion ? 0.12 : 0.32, ease: "easeOut" }}
            className="relative overflow-hidden rounded-xl border border-amber-200/35 bg-slate-950/90 px-4 py-3 shadow-[0_0_28px_rgba(251,191,36,0.18)] backdrop-blur-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-200/25 bg-amber-300/10 text-amber-200">
                <Trophy className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.22em] text-amber-200/75">
                  <Sparkles className="h-3 w-3" />
                  Reward unlocked
                </div>
                <div className="mt-0.5 font-display text-base font-bold uppercase tracking-wide text-white">
                  {achievementCatalog[notice.id].title}
                </div>
                <p className="mt-0.5 text-xs text-slate-300">
                  {achievementCatalog[notice.id].description}
                </p>
              </div>
            </div>
            {!reduceMotion && (
              <motion.div
                aria-hidden="true"
                className="absolute bottom-0 left-0 h-0.5 w-full origin-left bg-gradient-to-r from-amber-300 via-violet-300 to-cyan-300"
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 4.1, ease: "linear" }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
