import { useEffect, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Check, Gem, Gauge, LockKeyhole, Orbit, Rocket, Shield, Sparkles, Zap } from "lucide-react";
import { useLocation } from "wouter";
import { GameLayout } from "@/components/layout/GameLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEquipShip, useProgression, usePurchaseShip } from "@/hooks/use-progression";
import { sectorEnvironments, type SectorEnvironment } from "@/lib/sector-environments";
import { ships, type ShipDefinition, type ShipId } from "@shared/ships";
import "./hangar.css";

const shipOrder: ShipId[] = ["vanguard", "phantom", "titan", "nova"];

export default function HangarPage() {
  const { data: progression, isLoading } = useProgression();
  const purchase = usePurchaseShip();
  const equip = useEquipShip();
  const [, setLocation] = useLocation();
  const [previewShipId, setPreviewShipId] = useState<ShipId>("vanguard");
  const [selectedSectorIndex, setSelectedSectorIndex] = useState(0);

  useEffect(() => {
    if (progression?.equippedShip) setPreviewShipId(progression.equippedShip);
  }, [progression?.equippedShip]);

  const previewShip = ships[previewShipId];
  const selectedSector = sectorEnvironments[selectedSectorIndex];
  const equippedShip = progression?.equippedShip ?? "vanguard";
  const isPreviewShipOwned = progression?.ownedShips.includes(previewShipId) ?? false;
  const isPreviewShipEquipped = equippedShip === previewShipId;

  const launchMission = async () => {
    if (!progression || !isPreviewShipOwned || purchase.isPending || equip.isPending) return;

    try {
      if (progression.equippedShip !== previewShipId) {
        await equip.mutateAsync({ shipId: previewShipId });
      }
      setLocation("/game?launch=1");
    } catch {
      // The equip mutation displays the reason for a rejected Hangar command.
    }
  };

  return (
    <GameLayout>
      <div className="max-w-7xl mx-auto space-y-7 pb-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[10px] font-mono tracking-[0.35em] text-primary">FLEET COMMAND / SHIP SYSTEMS</p>
            <h1 className="text-4xl font-display font-bold neon-text sm:text-5xl">HANGAR</h1>
            <p className="mt-3 font-mono text-sm text-muted-foreground">Configure your vessel before entering the asteroid field.</p>
          </div>
          <div className="flex items-center gap-3 self-start rounded-xl border border-primary/30 bg-primary/10 px-5 py-3 shadow-[0_0_25px_hsl(var(--primary)/0.16)] sm:self-auto">
            <Gem className="h-6 w-6 text-primary" aria-hidden="true" />
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Gem balance</div>
              <div className="text-2xl font-display font-bold text-foreground">
                {isLoading ? "----" : (progression?.gems ?? 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <HangarScene
          ship={previewShip}
          sector={selectedSector}
          selectedSectorIndex={selectedSectorIndex}
          gems={progression?.gems ?? 0}
          loading={isLoading}
          owned={isPreviewShipOwned}
          equipped={isPreviewShipEquipped}
          canAfford={(progression?.gems ?? 0) >= previewShip.price}
          busy={purchase.isPending || equip.isPending}
          onPurchase={() => purchase.mutate({ shipId: previewShipId })}
          onEquip={() => equip.mutate({ shipId: previewShipId })}
          onLaunchMission={launchMission}
          onSelectSector={setSelectedSectorIndex}
        />

        <section aria-labelledby="fleet-roster-heading" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-mono tracking-[0.28em] text-muted-foreground">VESSEL REGISTRY</p>
              <h2 id="fleet-roster-heading" className="mt-1 text-2xl font-display font-bold text-foreground">YOUR FLEET</h2>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {progression?.ownedShips.length ?? 0} / {shipOrder.length} SHIPS UNLOCKED
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {shipOrder.map((shipId, index) => (
            <ShipCard
              key={shipId}
              ship={ships[shipId]}
              selected={previewShipId === shipId}
              owned={progression?.ownedShips.includes(shipId) ?? false}
              equipped={progression?.equippedShip === shipId}
              canAfford={(progression?.gems ?? 0) >= ships[shipId].price}
              onPreview={() => setPreviewShipId(shipId)}
              onPurchase={() => {
                setPreviewShipId(shipId);
                purchase.mutate({ shipId });
              }}
              onEquip={() => {
                setPreviewShipId(shipId);
                equip.mutate({ shipId });
              }}
              busy={purchase.isPending || equip.isPending}
              delay={index * 80}
            />
          ))}
          </div>
        </section>
      </div>
    </GameLayout>
  );
}

function HangarScene({
  ship,
  sector,
  selectedSectorIndex,
  gems,
  loading,
  owned,
  equipped,
  canAfford,
  busy,
  onPurchase,
  onEquip,
  onLaunchMission,
  onSelectSector,
}: {
  ship: ShipDefinition;
  sector: SectorEnvironment;
  selectedSectorIndex: number;
  gems: number;
  loading: boolean;
  owned: boolean;
  equipped: boolean;
  canAfford: boolean;
  busy: boolean;
  onPurchase: () => void;
  onEquip: () => void;
  onLaunchMission: () => void;
  onSelectSector: (index: number) => void;
}) {
  const sectorStyle = {
    "--sector-background": sector.palette.background,
    "--sector-deep": sector.palette.deep,
    "--sector-nebula": sector.palette.nebula,
    "--sector-planet": sector.palette.planet,
    "--sector-accent": sector.palette.accent,
    "--sector-debris": sector.palette.debris,
    "--ship-glow": ship.color,
  } as CSSProperties;

  return (
    <section
      className="hangar-scene"
      data-sector={sector.id}
      aria-label={`Hangar preview for ${ship.name} in ${sector.name}`}
      style={sectorStyle}
    >
      <div className="hangar-nebula" aria-hidden="true" />
      <div className="hangar-starfield" aria-hidden="true" />
      <div className="hangar-distant-planet" aria-hidden="true">
        <span className="hangar-planet-ring" />
      </div>
      <div className="hangar-debris" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => (
          <span
            key={index}
            className="hangar-debris-piece"
            style={{
              "--debris-x": `${(index * 29 + 7) % 96}%`,
              "--debris-y": `${(index * 41 + 11) % 88}%`,
              "--debris-delay": `${index * -1.9}s`,
              "--debris-scale": `${0.65 + (index % 4) * 0.22}`,
            } as CSSProperties}
          />
        ))}
      </div>

      <div className="hangar-scene-content">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.24em] text-primary">
            <Orbit className="h-4 w-4" aria-hidden="true" />
            <span>Sector visualizer</span>
          </div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-white/55">
            PREVIEW ONLY <span className="mx-2 text-white/25">/</span> SECTORS CHANGE IN FLIGHT
          </div>
        </div>

        <div className="hangar-scene-grid">
          <div className="hangar-vessel-info">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant={equipped ? "default" : owned ? "secondary" : "outline"} className="font-mono text-[10px] tracking-widest">
                {equipped ? "EQUIPPED" : owned ? "OWNED" : "LOCKED"}
              </Badge>
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/55">{ship.role}</span>
            </div>
            <p className="text-[10px] font-mono tracking-[0.3em] text-white/45">SELECTED HULL</p>
            <h2 className="mt-2 text-3xl font-display font-bold text-white sm:text-4xl">{ship.name}</h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/65">
              {ship.ability === "NONE" ? ship.role : ship.abilityDescription}
            </p>

            <div className="mt-6 grid grid-cols-3 gap-2">
              <Stat label="SPEED" value={ship.speed} icon={<Gauge className="h-3.5 w-3.5" />} />
              <Stat label="HANDLING" value={ship.handling} icon={<Zap className="h-3.5 w-3.5" />} />
              <Stat label="SHIELD" value={ship.shield} icon={<Shield className="h-3.5 w-3.5" />} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {equipped ? (
                <Button disabled variant="outline" className="font-mono text-xs tracking-widest">
                  <Check className="mr-2 h-4 w-4" /> SHIP READY
                </Button>
              ) : owned ? (
                <Button onClick={onEquip} disabled={busy} className="font-mono text-xs tracking-widest">
                  <Rocket className="mr-2 h-4 w-4" /> EQUIP THIS SHIP
                </Button>
              ) : (
                <Button
                  onClick={onPurchase}
                  disabled={!canAfford || busy || loading}
                  className="bg-gradient-to-r from-primary to-accent font-mono text-xs tracking-widest"
                >
                  {canAfford ? <><Gem className="mr-2 h-4 w-4" /> UNLOCK · {ship.price.toLocaleString()}</> : <><LockKeyhole className="mr-2 h-4 w-4" /> NEED {ship.price.toLocaleString()}</>}
                </Button>
              )}
              <Button
                type="button"
                onClick={onLaunchMission}
                disabled={!owned || loading || busy}
                variant="outline"
                className="border-white/20 bg-black/20 font-mono text-xs tracking-widest text-white hover:bg-white/10 hover:text-white"
              >
                {owned ? "LAUNCH MISSION" : "UNLOCK SHIP TO LAUNCH"}
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            {owned && !equipped && (
              <p className="mt-3 text-[10px] font-mono text-white/45">
                LAUNCHING WILL EQUIP {ship.name.toUpperCase()}
              </p>
            )}
            {!owned && (
              <p className="mt-3 text-[10px] font-mono text-white/45">
                UNLOCK THIS SHIP BEFORE LAUNCHING A MISSION
              </p>
            )}
          </div>

          <div className="hangar-ship-view" role="img" aria-label={`Rotating 3D preview of ${ship.name}`}>
            <div className="hangar-planet-glow" aria-hidden="true" />
            <div className="hangar-ship-orbit" aria-hidden="true" />
            <div className="hangar-ship-platform" aria-hidden="true" />
            <ShipModel shipId={ship.id} />
            <div className="hangar-view-label">
              <span className="hangar-live-dot" />
              ORBITAL PREVIEW <span className="mx-2 text-white/25">·</span> 360°
            </div>
          </div>
        </div>

        <div className="hangar-sector-row">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-mono tracking-[0.25em] text-white/45">EXPLORE THE SECTORS</p>
              <p className="mt-1 text-sm font-display text-white">{sector.shortName}</p>
            </div>
            <p className="max-w-md text-right text-xs text-white/55">{sector.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {sectorEnvironments.map((environment, index) => (
              <button
                key={environment.id}
                type="button"
                aria-pressed={selectedSectorIndex === index}
                onClick={() => onSelectSector(index)}
                className={`hangar-sector-button ${selectedSectorIndex === index ? "is-active" : ""}`}
                style={{ "--sector-accent": environment.palette.accent, "--sector-nebula": environment.palette.nebula } as CSSProperties}
              >
                <span className="hangar-sector-swatch" aria-hidden="true" />
                <span className="min-w-0 text-left">
                  <span className="block text-[9px] font-mono tracking-widest text-white/45">SECTOR {String(index + 1).padStart(2, "0")}</span>
                  <span className="mt-1 block truncate text-[10px] font-display font-semibold tracking-wide text-white">{environment.shortName}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ShipModel({ shipId }: { shipId: ShipId }) {
  const hulls: Record<ShipId, { body: string; wing: string }> = {
    vanguard: {
      body: "M374 130 98 38 142 130 98 222Z",
      wing: "M170 130 84 76 124 130 84 184Z",
    },
    phantom: {
      body: "M380 130 102 22 156 130 102 238Z",
      wing: "M193 130 98 48 140 130 98 212Z",
    },
    titan: {
      body: "M348 130 226 56 174 72 116 130 174 188 226 204Z",
      wing: "M245 86 314 104 348 130 314 156 245 174 174 130Z",
    },
    nova: {
      body: "M382 130 100 38 166 130 100 222Z",
      wing: "M218 130 128 42 150 130 128 218Z",
    },
  };
  const hull = hulls[shipId];
  const hullGradientId = `ship-hull-${shipId}`;

  return (
    <div className={`hangar-ship-model hangar-ship-model--${shipId}`} aria-hidden="true">
      <svg viewBox="0 0 420 260" className="hangar-ship-svg" fill="none">
        <defs>
          <linearGradient id={hullGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.42" stopColor={shipId === "titan" ? "#f8c76a" : "#cbd5e1"} />
            <stop offset="1" stopColor="#475569" />
          </linearGradient>
          <radialGradient id={`${hullGradientId}-core`}>
            <stop stopColor="#ffffff" />
            <stop offset="0.3" stopColor="var(--ship-glow)" />
            <stop offset="1" stopColor="#0b1020" />
          </radialGradient>
        </defs>
        <path d={hull.body} fill={`url(#${hullGradientId})`} stroke="rgba(255,255,255,.7)" strokeWidth="2" />
        <path d={hull.wing} fill="var(--ship-glow)" fillOpacity=".86" stroke="rgba(255,255,255,.68)" strokeWidth="2" />
        <path d="M114 130h197" stroke="#f8fafc" strokeOpacity=".54" strokeWidth="2" />
        <path d="M156 130 117 76M156 130l-39 54" stroke="rgba(15,23,42,.68)" strokeWidth="5" />
        <ellipse cx="248" cy="130" rx="31" ry="12" fill={`url(#${hullGradientId}-core)`} stroke="rgba(255,255,255,.72)" strokeWidth="2" />
        <path d="M74 109 42 130l32 21" stroke="var(--ship-glow)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M182 93 223 78M182 167l41 15" stroke="rgba(255,255,255,.62)" strokeWidth="3" strokeLinecap="round" />
        {shipId === "titan" && <><rect x="128" y="91" width="24" height="78" rx="7" fill="#78350f" stroke="#fbbf24" strokeWidth="3" /><path d="M276 101v58" stroke="#fbbf24" strokeWidth="5" /></>}
        {shipId === "nova" && <><path d="m252 103 53-27M252 157l53 27" stroke="var(--ship-glow)" strokeWidth="5" strokeLinecap="round" /><circle cx="319" cy="76" r="5" fill="#fff" /><circle cx="319" cy="184" r="5" fill="#fff" /></>}
        {shipId === "phantom" && <><path d="M223 103 180 43M223 157l-43 60" stroke="#e0f2fe" strokeOpacity=".75" strokeWidth="3" /><path d="M102 130H56" stroke="#22d3ee" strokeWidth="2" strokeDasharray="5 7" /></>}
      </svg>
    </div>
  );
}

function ShipCard({
  ship,
  selected,
  owned,
  equipped,
  canAfford,
  onPreview,
  onPurchase,
  onEquip,
  busy,
  delay,
}: {
  ship: ShipDefinition;
  selected: boolean;
  owned: boolean;
  equipped: boolean;
  canAfford: boolean;
  onPreview: () => void;
  onPurchase: () => void;
  onEquip: () => void;
  busy: boolean;
  delay: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay / 1000 }}>
      <Card className={`group relative overflow-hidden bg-card/50 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 ${selected ? "border-primary/80 ring-1 ring-primary/30 shadow-[0_0_35px_hsl(var(--primary)/0.18)]" : "border-white/10 hover:border-primary/40"} ${equipped ? "shadow-[0_0_28px_hsl(var(--primary)/0.14)]" : ""}`}>
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ background: `radial-gradient(circle at 75% 15%, ${ship.color}, transparent 45%)` }} />
        <CardHeader className="relative flex flex-row items-start justify-between pb-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={equipped ? "default" : owned ? "secondary" : "outline"} className="font-mono text-[10px] tracking-widest">
                {equipped ? "EQUIPPED" : owned ? "OWNED" : "LOCKED"}
              </Badge>
              {selected && <span className="text-[9px] font-mono tracking-widest text-primary">PREVIEW</span>}
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{ship.role}</span>
            </div>
            <h2 className="text-2xl font-display font-bold text-foreground">{ship.name}</h2>
          </div>
          <button
            type="button"
            onClick={onPreview}
            aria-label={`Preview ${ship.name}`}
            aria-pressed={selected}
            className="rounded-lg outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ShipVisual shipId={ship.id} color={ship.color} />
          </button>
        </CardHeader>
        <CardContent className="relative space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="SPEED" value={ship.speed} icon={<Gauge className="h-3.5 w-3.5" />} />
            <Stat label="HANDLING" value={ship.handling} icon={<Zap className="h-3.5 w-3.5" />} />
            <Stat label="SHIELD" value={ship.shield} icon={<Shield className="h-3.5 w-3.5" />} />
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-2 text-xs font-mono text-primary mb-1">
              <Sparkles className="h-3.5 w-3.5" /> {ship.ability}
            </div>
            <p className="text-sm text-muted-foreground">{ship.abilityDescription}</p>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 font-mono">
              {ship.price === 0 ? (
                <span className="text-sm text-emerald-300">FREE</span>
              ) : (
                <>
                  <Gem className="h-4 w-4 text-cyan-300" />
                  <span className="text-lg text-white">{ship.price.toLocaleString()}</span>
                </>
              )}
            </div>
            {equipped ? (
              <Button disabled variant="outline" className="font-mono tracking-widest text-xs">
                <Check className="mr-2 h-4 w-4" /> EQUIPPED
              </Button>
            ) : owned ? (
              <Button onClick={onEquip} disabled={busy} className="font-mono tracking-widest text-xs">
                EQUIP SHIP
              </Button>
            ) : (
              <Button onClick={onPurchase} disabled={!canAfford || busy} className="font-mono tracking-widest text-xs bg-gradient-to-r from-primary to-accent">
                {canAfford ? "PURCHASE" : <><LockKeyhole className="mr-2 h-4 w-4" /> LOCKED</>}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">{icon}{label}</div>
      <div className="flex gap-1 mt-2">
        {[1, 2, 3, 4, 5].map((dot) => <span key={dot} className={`h-1.5 flex-1 rounded-full ${dot <= value ? "bg-primary shadow-[0_0_7px_hsl(var(--primary))]" : "bg-white/10"}`} />)}
      </div>
      <div className="text-xs font-mono text-white/70 mt-1">{value}/5</div>
    </div>
  );
}

function ShipVisual({ shipId, color }: { shipId: ShipId; color: string }) {
  return (
    <div className="h-24 w-32 flex items-center justify-center" style={{ color }}>
      <svg viewBox="0 0 160 100" className="h-full w-full drop-shadow-[0_0_14px_currentColor]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
        {shipId === "vanguard" && <><path fill="#f8fafc" d="M142 50 56 20 68 50 56 80Z" /><path fill={color} d="M68 50 35 28 48 50 35 72Z" /><ellipse cx="98" cy="50" rx="16" ry="7" fill="#0ea5e9" /></>}
        {shipId === "phantom" && <><path fill="#e0f2fe" d="M145 50 47 18 65 50 47 82Z" /><path fill={color} d="M65 50 28 38 43 50 28 62Z" /><path d="M83 35 63 16M83 65 63 84" /></>}
        {shipId === "titan" && <><path fill="#fbbf24" d="M135 50 75 22 57 35 38 50 57 65 75 78Z" /><path fill="#78350f" d="M75 35h35l17 15-17 15H75l-12-15Z" /><rect x="43" y="39" width="12" height="22" rx="3" /></>}
        {shipId === "nova" && <><path fill="#fdf2f8" d="M148 50 52 22 72 50 52 78Z" /><path fill={color} d="M75 50 42 20 49 50 42 80Z" /><path d="m85 32 25-15M85 68l25 15" /><ellipse cx="103" cy="50" rx="12" ry="5" fill="#db2777" /></>}
      </svg>
    </div>
  );
}