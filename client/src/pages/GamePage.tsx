import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { GameLayout } from "@/components/layout/GameLayout";
import { GameCanvas } from "@/components/game/GameCanvas";
import { MusicToggle } from "@/components/game/MusicToggle";
import { Card } from "@/components/ui/card";
import { Info, Play, Rocket, Trophy, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useProgression } from "@/hooks/use-progression";
import { getSectorEnvironmentById } from "@/lib/sector-environments";
import { ships } from "@shared/ships";
import { isPortal } from "@/lib/portal";

export default function GamePage() {
  const search = useSearch();
  const [launchRequest] = useState(() => {
    const query = new URLSearchParams(search);
    return {
      direct: query.get("launch") === "1",
      sector: getSectorEnvironmentById(query.get("sector")),
    };
  });
  const launchFromHangar = launchRequest.direct;
  const launchSector = launchRequest.sector;
  const [showGame, setShowGame] = useState(launchFromHangar);
  const { data: progression } = useProgression();
  const currentShip = ships[progression?.equippedShip ?? "vanguard"];

  useEffect(() => {
    if (launchFromHangar) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, [launchFromHangar]);

  return (
    <GameLayout>
      <div className={isPortal ? "h-full max-w-5xl mx-auto" : "max-w-5xl mx-auto space-y-8 pb-12"}>
        <AnimatePresence mode="wait">
          {!showGame ? (
            <motion.div
              key="home"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className={isPortal ? "relative flex flex-col items-center justify-center h-full text-center space-y-3 sm:space-y-5" : "relative flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8"}
            >
              <MusicToggle className="absolute right-0 top-0 z-20" popoverAlign="right" />
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
                <Rocket className={isPortal ? "w-10 h-10 sm:w-16 sm:h-16 text-primary relative z-10 animate-bounce" : "w-24 h-24 text-primary relative z-10 animate-bounce"} />
              </div>
              
              <div className="space-y-4">
                <h1 className={isPortal ? "text-3xl sm:text-5xl font-display font-bold text-foreground tracking-tighter" : "text-6xl font-display font-bold text-foreground tracking-tighter"}>
                  ASTRODODGE
                </h1>
                <p className={isPortal ? "text-sm sm:text-base text-muted-foreground font-mono max-w-lg mx-auto [@media(max-height:400px)]:hidden" : "text-xl text-muted-foreground font-mono max-w-lg mx-auto"}>
                  Master the void. Navigate the asteroid fields of Sector 7 and survive the cosmic onslaught.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
                <Button 
                  onClick={() => setShowGame(true)}
                  size="lg"
                  className={`flex-1 ${isPortal ? "h-12 text-lg" : "h-16 text-xl"} font-display tracking-widest bg-gradient-to-r from-primary to-accent hover:scale-105 transition-all shadow-xl shadow-primary/20`}
                >
                  <Play className="mr-2 h-6 w-6 fill-current" />
                  INITIATE MISSION
                </Button>
              </div>

              {!isPortal && (<>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full mt-8">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur">
                  <Target className="w-6 h-6 text-accent mx-auto mb-2" />
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">Objective</div>
                  <div className="text-sm font-bold text-foreground">Survive</div>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur">
                  <Rocket className="w-6 h-6 text-primary mx-auto mb-2" />
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">Ship</div>
                  <div className="text-sm font-bold text-foreground">{currentShip.name}</div>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur">
                  <Trophy className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">Status</div>
                  <div className="text-sm font-bold text-foreground">Ready</div>
                </div>
              </div>

              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em] mt-12">
                Made by Alakh
              </p>
              </>)}
            </motion.div>
          ) : (
            <motion.div
              key="game"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={isPortal ? "h-full flex items-center justify-center" : "space-y-8"}
            >
              {isPortal ? (
                // Fit the 16:9 game frame inside whatever space the portal gives, never taller than it.
                <div className="w-full" style={{ maxWidth: "calc((100dvh - 4rem) * 16 / 9)" }}>
                  <GameCanvas autoStart={launchFromHangar} initialSectorId={launchSector.id} />
                </div>
              ) : (
              <>
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-4xl font-display font-bold text-foreground mb-2">
                    STARTING SECTOR: {launchSector.name.toUpperCase()}
                  </h1>
                  <p className="text-muted-foreground font-mono">
                    OBJECTIVE: SURVIVE AS LONG AS POSSIBLE
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowGame(false)}
                  className="font-mono text-[10px] tracking-widest uppercase border-white/10"
                >
                  Abort Mission
                </Button>
              </div>

              <GameCanvas autoStart={launchFromHangar} initialSectorId={launchSector.id} />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatsCard label="CURRENT RANK" value="CADET" delay={0} />
                <StatsCard label="BEST SCORE" value="---" delay={100} />
                <StatsCard label="SHIP STATUS" value={`${currentShip.name} · OPERATIONAL`} delay={200} />
              </div>
              
              <div className="text-center">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
                  Made by Alakh
                </p>
              </div>
              </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GameLayout>
  );
}

function StatsCard({ label, value, delay }: { label: string; value: string; delay: number }) {
  return (
    <Card className="bg-card/30 backdrop-blur border-white/5 p-6 animate-in slide-in-from-bottom-4 fade-in duration-700" style={{ animationDelay: `${delay}ms` }}>
      <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2">
        {label}
      </div>
      <div className="text-2xl font-display font-bold text-foreground">
        {value}
      </div>
    </Card>
  );
}
