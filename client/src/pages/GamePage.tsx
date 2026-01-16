import { GameLayout } from "@/components/layout/GameLayout";
import { GameCanvas } from "@/components/game/GameCanvas";
import { Card } from "@/components/ui/card";
import { Info } from "lucide-react";

export default function GamePage() {
  return (
    <GameLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-4xl font-display font-bold text-white mb-2">
              SECTOR 7: ASTEROID FIELD
            </h1>
            <p className="text-muted-foreground font-mono">
              OBJECTIVE: SURVIVE AS LONG AS POSSIBLE
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs font-mono text-muted-foreground border border-white/10 px-3 py-1 rounded-full">
            <Info className="w-4 h-4" />
            <span>AVOID COLLISIONS. SPEED INCREASES OVER TIME.</span>
          </div>
        </div>

        <GameCanvas />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatsCard label="CURRENT RANK" value="CADET" delay={0} />
          <StatsCard label="BEST SCORE" value="---" delay={100} />
          <StatsCard label="SHIP STATUS" value="OPERATIONAL" delay={200} />
        </div>
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
      <div className="text-2xl font-display font-bold text-white">
        {value}
      </div>
    </Card>
  );
}
