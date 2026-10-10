import { useState, type CSSProperties, type ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Gem,
  Gauge,
  LockKeyhole,
  RotateCcw,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import { ships, type ShipId } from "./ships";

const shipOrder: ShipId[] = ["vanguard", "phantom", "titan", "nova"];
const startingGems = 1_280;
const startingOwned: ShipId[] = ["vanguard", "phantom"];

const environments = [
  {
    id: "deep-space",
    label: "Deep Space",
    short: "01",
    accent: "#a989ff",
    haze: "rgba(114, 63, 210, .28)",
    planet: "#7960c3",
    subtitle: "DEEP SPACE / DEFAULT THEME",
  },
  {
    id: "starlight-white",
    label: "Starlight White",
    short: "02",
    accent: "#d5bd94",
    haze: "rgba(203, 177, 138, .22)",
    planet: "#d4c3a8",
    subtitle: "STARLIGHT WHITE / ALTERNATE THEME",
  },
  {
    id: "nebula-green",
    label: "Nebula Green",
    short: "03",
    accent: "#58d5a1",
    haze: "rgba(29, 173, 125, .23)",
    planet: "#387966",
    subtitle: "NEBULA GREEN / ALTERNATE THEME",
  },
] as const;

type EnvironmentId = (typeof environments)[number]["id"];

export function SectorShowcase() {
  const [selectedShip, setSelectedShip] = useState<ShipId>("vanguard");
  const [equippedShip, setEquippedShip] = useState<ShipId>("vanguard");
  const [ownedShips, setOwnedShips] = useState<ShipId[]>(startingOwned);
  const [gems, setGems] = useState(startingGems);
  const [environmentId, setEnvironmentId] = useState<EnvironmentId>("deep-space");
  const [shipAngle, setShipAngle] = useState(-16);
  const [notice, setNotice] = useState("");

  const ship = ships[selectedShip];
  const environment = environments.find((item) => item.id === environmentId) ?? environments[0];
  const owned = ownedShips.includes(selectedShip);
  const equipped = equippedShip === selectedShip;
  const canAfford = gems >= ship.price;
  const themeStyle = {
    "--sector-accent": environment.accent,
    "--sector-haze": environment.haze,
    "--planet-color": environment.planet,
  } as CSSProperties;

  function selectShip(shipId: ShipId) {
    setSelectedShip(shipId);
    setShipAngle(-16);
    setNotice("");
  }

  function changeShip(direction: -1 | 1) {
    const currentIndex = shipOrder.indexOf(selectedShip);
    const nextIndex = (currentIndex + direction + shipOrder.length) % shipOrder.length;
    selectShip(shipOrder[nextIndex]);
  }

  function purchaseShip() {
    if (owned || !canAfford) return;
    setGems((current) => current - ship.price);
    setOwnedShips((current) => [...current, selectedShip]);
    setNotice(`${ship.name} added to your fleet.`);
  }

  function equipShip() {
    if (!owned) return;
    setEquippedShip(selectedShip);
    setNotice(`${ship.name} is ready for your next run.`);
  }

  function resetView() {
    setShipAngle(-16);
  }

  return (
    <div className="astro-hangar" data-environment={environmentId} style={themeStyle}>
      <style>{styles}</style>

      <header className="hangar-topbar">
        <div className="topbar-inner">
          <div className="brand-lockup" aria-label="Astrododge">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 40 40" fill="none">
                <path d="M20 3 35 31H5L20 3Z" stroke="currentColor" strokeWidth="1.5" />
                <path d="m20 12 8 15H12l8-15Z" fill="currentColor" opacity=".72" />
                <path d="M20 19v12" stroke="#151020" strokeWidth="1.5" />
              </svg>
            </span>
            <span className="brand-word">ASTRO<span>DODGE</span></span>
          </div>

          <nav className="main-nav" aria-label="Main navigation">
            <span>PLAY</span>
            <span className="current" aria-current="page">HANGAR</span>
            <span>LEADERBOARD</span>
            <span className="nav-optional">MULTIPLAYER</span>
          </nav>

          <div className="pilot-info">
            <span className="pilot-avatar" aria-hidden="true">N</span>
            <span>CMDR. NOVA</span>
            <span className="pilot-status" aria-hidden="true" />
          </div>
        </div>
      </header>

      <main className="hangar-main">
        <div className="page-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> FLEET COMMAND <span>/</span> SHIP SYSTEMS</div>
            <h1>Hangar<span className="heading-period">.</span></h1>
            <p>Configure your vessel before entering the asteroid field.</p>
          </div>
          <div className="balance-chip" aria-label={`${gems.toLocaleString()} gems`}>
            <span className="balance-icon"><Gem size={18} strokeWidth={1.8} /></span>
            <span className="balance-copy">
              <span className="micro-label">GEM BALANCE</span>
              <strong>{gems.toLocaleString()}</strong>
            </span>
            <span className="balance-plus" aria-hidden="true">+</span>
          </div>
        </div>

        <section className="hangar-grid" aria-label="Ship preview and configuration">
          <div className="scene-panel">
            <div className="scene-sky" aria-hidden="true">
              <div className="star-field" />
              <div className="nebula-cloud cloud-one" />
              <div className="nebula-cloud cloud-two" />
              <div className="planet-backdrop">
                <div className="planet-ring" />
                <div className="planet-body"><span className="planet-crater crater-one" /><span className="planet-crater crater-two" /></div>
              </div>
              <i className="debris debris-one" />
              <i className="debris debris-two" />
              <i className="debris debris-three" />
              <i className="debris debris-four" />
              <div className="horizon-glow" />
              <div className="hangar-floor">
                <div className="floor-grid" />
                <div className="landing-disc"><span /><i /></div>
              </div>
            </div>

            <div className="scene-head">
              <div>
                <span className="scene-label"><span className="live-dot" /> ENVIRONMENT PREVIEW</span>
                <span className="scene-mode">{environment.subtitle}</span>
              </div>
              <span className="scene-coordinate">SECTOR / 04&nbsp;&nbsp;·&nbsp;&nbsp;ORBITAL BAY</span>
            </div>

            <div className="environment-control" aria-label="Sector environment">
              <span className="control-label">SECTOR ENVIRONMENT</span>
              <div className="environment-options" role="group" aria-label="Choose sector environment">
                {environments.map((item) => (
                  <button
                    className={`environment-option ${environmentId === item.id ? "active" : ""}`}
                    type="button"
                    key={item.id}
                    aria-pressed={environmentId === item.id}
                    onClick={() => setEnvironmentId(item.id)}
                  >
                    <span className="env-number">{item.short}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="ship-view-area">
              <button className="scene-arrow scene-arrow-left" type="button" onClick={() => changeShip(-1)} aria-label="Show previous ship">
                <ChevronLeft size={19} />
              </button>
              <div className="ship-stage" aria-label={`${ship.name} rotating ship preview`}>
                <div className="ship-orbit orbit-a" aria-hidden="true" />
                <div className="ship-orbit orbit-b" aria-hidden="true" />
                <div
                  className={`ship-rig ship-${selectedShip}`}
                  style={{ "--ship-angle": `${shipAngle}deg`, "--ship-color": ship.color } as CSSProperties}
                >
                  <ShipArtwork shipId={selectedShip} color={ship.color} />
                  <span className="ship-engine-flare" aria-hidden="true" />
                </div>
                <div className="ship-shadow" aria-hidden="true" />
              </div>
              <button className="scene-arrow scene-arrow-right" type="button" onClick={() => changeShip(1)} aria-label="Show next ship">
                <ChevronRight size={19} />
              </button>
              <div className="rotation-controls" role="group" aria-label="Rotate ship preview">
                <button type="button" onClick={() => setShipAngle((angle) => angle - 28)} aria-label="Rotate ship left">
                  <RotateCcw size={14} />
                </button>
                <span>ROTATE VIEW</span>
                <button type="button" onClick={() => setShipAngle((angle) => angle + 28)} aria-label="Rotate ship right">
                  <RotateCcw className="rotate-forward" size={14} />
                </button>
                <button type="button" onClick={resetView} aria-label="Reset ship view" className="reset-view">RESET</button>
              </div>
            </div>

            <div className="scene-caption">
              <span className="caption-mark" />
              <span>HANGAR DECK <b>·</b> SHIP SYSTEMS ONLINE</span>
              <span className="caption-right">PREVIEW <b>01—04</b></span>
            </div>
          </div>

          <aside className="ship-console">
            <div className="console-topline">
              <span className="console-label">VESSEL DOSSIER</span>
              <span className={`status-tag ${equipped ? "status-equipped" : owned ? "status-owned" : "status-locked"}`}>
                <i />{equipped ? "EQUIPPED" : owned ? "OWNED" : "LOCKED"}
              </span>
            </div>

            <div className="ship-title">
              <span className="ship-index">0{shipOrder.indexOf(selectedShip) + 1}<i> / 04</i></span>
              <h2>{ship.name}</h2>
              <p>{ship.role}</p>
            </div>

            <div className="stat-block">
              <StatRow label="SPEED" value={ship.speed} icon={<Gauge size={14} />} />
              <StatRow label="HANDLING" value={ship.handling} icon={<Zap size={14} />} />
              <StatRow label="SHIELD" value={ship.shield} icon={<Shield size={14} />} />
            </div>

            <div className="ability-block">
              <div className="ability-heading"><Sparkles size={14} /> SPECIAL ABILITY</div>
              <strong>{ship.ability}</strong>
              <p>{ship.abilityDescription}</p>
            </div>

            <div className="purchase-row">
              <div className="ship-price">
                <span className="micro-label">{ship.price === 0 ? "SHIP COST" : "UNLOCK COST"}</span>
                <strong>{ship.price === 0 ? "FREE" : <><Gem size={15} />{ship.price.toLocaleString()}</>}</strong>
              </div>
              {equipped ? (
                <button className="ship-action action-equipped" type="button" disabled>
                  <Check size={15} /> EQUIPPED
                </button>
              ) : owned ? (
                <button className="ship-action action-ready" type="button" onClick={equipShip}>
                  EQUIP SHIP <ChevronRight size={15} />
                </button>
              ) : (
                <button className="ship-action action-purchase" type="button" onClick={purchaseShip} disabled={!canAfford}>
                  {canAfford ? <>PURCHASE <ChevronRight size={15} /></> : <><LockKeyhole size={14} /> LOCKED</>}
                </button>
              )}
            </div>
            {!owned && !canAfford && (
              <div className="shortfall">NEED <strong>{(ship.price - gems).toLocaleString()}</strong> MORE GEMS</div>
            )}
            <div className="action-notice" aria-live="polite">{notice}</div>
          </aside>
        </section>

        <section className="fleet-section" aria-labelledby="fleet-title">
          <div className="fleet-heading">
            <div>
              <span className="eyebrow"><span className="eyebrow-line" /> AVAILABLE VESSELS</span>
              <h2 id="fleet-title">Your fleet <span>({ownedShips.length}/04)</span></h2>
            </div>
            <p>SELECT A SHIP TO INSPECT</p>
          </div>

          <div className="fleet-list" role="group" aria-label="Choose a ship">
            {shipOrder.map((shipId, index) => {
              const item = ships[shipId];
              const isOwned = ownedShips.includes(shipId);
              const isSelected = selectedShip === shipId;
              const isEquipped = equippedShip === shipId;
              return (
                <button
                  type="button"
                  className={`fleet-card ${isSelected ? "selected" : ""}`}
                  key={shipId}
                  aria-pressed={isSelected}
                  aria-label={`${item.name}, ${isEquipped ? "equipped" : isOwned ? "owned" : "locked"}`}
                  onClick={() => selectShip(shipId)}
                  style={{ "--fleet-color": item.color } as CSSProperties}
                >
                  <span className="fleet-card-top">
                    <span className="fleet-number">0{index + 1}</span>
                    <span className={`fleet-state ${isEquipped ? "state-equipped" : isOwned ? "state-owned" : "state-locked"}`}>
                      {isEquipped ? "EQUIPPED" : isOwned ? "OWNED" : "LOCKED"}
                    </span>
                  </span>
                  <span className="fleet-art"><ShipArtwork shipId={shipId} color={item.color} small /></span>
                  <span className="fleet-card-bottom">
                    <span className="fleet-name">{item.name}</span>
                    <span className="fleet-price">{isOwned ? item.role : <>{item.price === 0 ? "FREE" : <><Gem size={12} /> {item.price.toLocaleString()}</>}</>}</span>
                  </span>
                  <span className="fleet-selected-bar" />
                </button>
              );
            })}
          </div>
        </section>
        <footer className="hangar-footer">
          <span>ASTRODODGE <i>—</i> FLIGHT SYSTEMS</span>
          <span>ALL VESSELS NOMINAL <i className="footer-status" /></span>
        </footer>
      </main>
    </div>
  );
}

function StatRow({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="stat-row">
      <div className="stat-label">{icon}<span>{label}</span></div>
      <div className="stat-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={5} aria-valuenow={value}>
        {[1, 2, 3, 4, 5].map((segment) => <i key={segment} className={segment <= value ? "filled" : ""} />)}
      </div>
      <strong>{value}<span>/5</span></strong>
    </div>
  );
}

function ShipArtwork({ shipId, color, small = false }: { shipId: ShipId; color: string; small?: boolean }) {
  return (
    <svg
      className={`ship-artwork ${small ? "small" : ""}`}
      viewBox="0 0 400 240"
      role={small ? undefined : "img"}
      aria-label={small ? undefined : `${ships[shipId].name} ship illustration`}
      aria-hidden={small ? true : undefined}
    >
      <defs>
        <linearGradient id={`hull-${shipId}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".48" stopColor="#dce3f6" />
          <stop offset="1" stopColor="#71809b" />
        </linearGradient>
        <linearGradient id={`wing-${shipId}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={color} />
          <stop offset="1" stopColor="#312746" />
        </linearGradient>
        <linearGradient id={`underside-${shipId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b5bdd0" />
          <stop offset="1" stopColor="#41465c" />
        </linearGradient>
      </defs>
      <g stroke="#171527" strokeWidth="3" strokeLinejoin="round">
        {shipId === "vanguard" && (
          <>
            <path d="m355 118-216-87 35 87-35 87Z" fill={`url(#hull-${shipId})`} />
            <path d="m196 118-118-58 40 58-40 58Z" fill={`url(#wing-${shipId})`} />
            <path d="m191 129 144 58-196-47Z" fill={`url(#underside-${shipId})`} opacity=".92" />
            <path d="m191 107 144-58-196 47Z" fill="#f5f4ff" opacity=".65" />
            <ellipse cx="245" cy="118" rx="35" ry="16" fill="#56d9f2" />
            <path d="m55 97-29 21 29 21 40-21Z" fill="#a8dcff" />
          </>
        )}
        {shipId === "phantom" && (
          <>
            <path d="m366 118-241-86 54 86-54 86Z" fill={`url(#hull-${shipId})`} />
            <path d="m221 118-144-44 58 44-58 44Z" fill={`url(#wing-${shipId})`} />
            <path d="m174 92-51-51m51 103-51 51" fill="none" stroke={color} strokeWidth="9" />
            <path d="m177 130 156 53-203-45Z" fill={`url(#underside-${shipId})`} />
            <path d="m206 118 57-12 35 12-35 12Z" fill="#61e7f0" />
            <path d="m52 106-28 12 28 12 28-12Z" fill="#c8f4ff" />
          </>
        )}
        {shipId === "titan" && (
          <>
            <path d="m352 118-178-81-45 28-70 53 70 53 45 28Z" fill="#f4c56a" />
            <path d="m256 75h-104l-48 43 48 43h104l45-43Z" fill={`url(#wing-${shipId})`} />
            <path d="m152 82-31-38m31 110-31 38" fill="none" stroke="#ffe1a1" strokeWidth="10" />
            <path d="m171 130 137 40-190-32Z" fill="#8c5f3f" />
            <rect x="53" y="94" width="34" height="48" rx="9" fill="#f8e3b3" />
            <path d="M57 101h22M57 135h22" stroke="#573f39" strokeWidth="4" />
            <ellipse cx="247" cy="118" rx="23" ry="14" fill="#ffdc8b" />
          </>
        )}
        {shipId === "nova" && (
          <>
            <path d="m365 118-229-83 54 83-54 83Z" fill={`url(#hull-${shipId})`} />
            <path d="m217 118-135-73 39 73-39 73Z" fill={`url(#wing-${shipId})`} />
            <path d="m211 96 75-47m-75 91 75 47" fill="none" stroke="#ffc2e2" strokeWidth="9" />
            <path d="m181 132 160 45-206-38Z" fill={`url(#underside-${shipId})`} />
            <ellipse cx="249" cy="118" rx="30" ry="15" fill="#ee78bb" />
            <path d="m50 103-28 15 28 15 24-15Z" fill="#ffb6df" />
          </>
        )}
        <path d="m199 118 100-4" stroke="rgba(255,255,255,.68)" strokeWidth="2" />
      </g>
    </svg>
  );
}

const styles = `
  .astro-hangar {
    --ink: #f1edf9;
    --muted: #9992aa;
    --quiet: #676174;
    --line: rgba(207, 192, 238, .13);
    --panel: rgba(20, 17, 32, .86);
    --panel-soft: rgba(31, 26, 46, .74);
    min-height: 100vh;
    color: var(--ink);
    background:
      radial-gradient(ellipse at 52% -18%, color-mix(in srgb, var(--sector-accent) 13%, transparent), transparent 43%),
      #100e17;
    font-family: 'Rajdhani', 'Trebuchet MS', sans-serif;
    overflow: hidden;
    position: relative;
    isolation: isolate;
  }
  .astro-hangar, .astro-hangar * { box-sizing: border-box; }
  .astro-hangar::before {
    content: "";
    position: fixed;
    z-index: -1;
    inset: 0;
    opacity: .17;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.13'/%3E%3C/svg%3E");
  }
  .hangar-topbar { height: 66px; border-bottom: 1px solid rgba(217, 205, 240, .11); background: rgba(14, 12, 21, .83); }
  .topbar-inner { height: 100%; max-width: 1500px; padding: 0 42px; margin: auto; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
  .brand-lockup { display: flex; align-items: center; gap: 10px; min-width: 212px; }
  .brand-mark { width: 31px; height: 31px; color: var(--sector-accent); display: grid; place-items: center; }
  .brand-mark svg { width: 100%; height: 100%; }
  .brand-word { font: 800 17px/1 'Orbitron', 'Trebuchet MS', sans-serif; letter-spacing: .075em; color: #f8f5ff; }
  .brand-word span { color: var(--sector-accent); }
  .main-nav { align-items: center; display: flex; gap: clamp(18px, 3vw, 43px); color: #7c768b; font: 600 10px/1 'Share Tech Mono', monospace; letter-spacing: .16em; }
  .main-nav span { padding: 26px 0 24px; white-space: nowrap; }
  .main-nav .current { color: #e5dafa; border-bottom: 2px solid var(--sector-accent); }
  .pilot-info { display: flex; align-items: center; gap: 10px; color: #c5bfd2; white-space: nowrap; font: 11px 'Share Tech Mono', monospace; letter-spacing: .06em; }
  .pilot-avatar { width: 27px; height: 27px; display: grid; place-items: center; border: 1px solid color-mix(in srgb, var(--sector-accent) 54%, transparent); border-radius: 50%; color: var(--sector-accent); font: 600 12px 'Orbitron', sans-serif; }
  .pilot-status, .footer-status { width: 6px; height: 6px; border-radius: 50%; background: #79d8a7; box-shadow: 0 0 9px rgba(121,216,167,.6); }
  .hangar-main { width: min(1430px, calc(100% - 84px)); margin: 0 auto; padding: 28px 0 16px; }
  .page-heading { display: flex; justify-content: space-between; align-items: end; min-height: 99px; margin-bottom: 21px; }
  .eyebrow { display: flex; align-items: center; gap: 9px; color: #8e879e; font: 10px 'Share Tech Mono', monospace; letter-spacing: .17em; }
  .eyebrow span:not(.eyebrow-line) { color: #514a5e; }
  .eyebrow-line { width: 18px; height: 1px; display: inline-block; background: var(--sector-accent); box-shadow: 0 0 8px var(--sector-accent); }
  .page-heading h1 { margin: 8px 0 0; text-transform: uppercase; font: 800 clamp(34px, 4vw, 50px)/.95 'Orbitron', 'Trebuchet MS', sans-serif; letter-spacing: .055em; }
  .heading-period { color: var(--sector-accent); }
  .page-heading p { margin: 10px 0 0; color: #aaa3b7; font: 500 16px/1.15 'Rajdhani', sans-serif; letter-spacing: .015em; }
  .balance-chip { height: 57px; min-width: 190px; padding: 8px 11px; display: flex; align-items: center; gap: 11px; border: 1px solid color-mix(in srgb, var(--sector-accent) 27%, transparent); background: linear-gradient(100deg, color-mix(in srgb, var(--sector-accent) 9%, #211a2c), rgba(21, 18, 29, .86)); }
  .balance-icon { width: 35px; height: 35px; display: grid; place-items: center; color: var(--sector-accent); background: color-mix(in srgb, var(--sector-accent) 13%, transparent); }
  .balance-copy { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .micro-label { color: #8b8499; font: 9px 'Share Tech Mono', monospace; letter-spacing: .14em; }
  .balance-copy strong { font: 700 21px/1 'Orbitron', sans-serif; letter-spacing: .035em; }
  .balance-plus { color: var(--sector-accent); font: 22px 'Rajdhani', sans-serif; opacity: .8; padding: 0 5px; }
  .hangar-grid { display: grid; grid-template-columns: minmax(0, 1.72fr) minmax(330px, .78fr); gap: 15px; }
  .scene-panel { height: 454px; position: relative; isolation: isolate; overflow: hidden; border: 1px solid rgba(194, 177, 229, .16); background: #151120; }
  .scene-sky { position: absolute; inset: 0; z-index: -1; overflow: hidden; background: radial-gradient(ellipse at 54% 59%, var(--sector-haze), transparent 52%), linear-gradient(150deg, #191426 4%, #15131f 48%, #100e18 100%); transition: background .5s ease; }
  [data-environment="starlight-white"] .scene-sky { background: radial-gradient(ellipse at 52% 58%, rgba(196, 174, 137, .3), transparent 55%), linear-gradient(145deg, #292631 5%, #201d26 53%, #14121a 100%); }
  [data-environment="nebula-green"] .scene-sky { background: radial-gradient(ellipse at 52% 58%, rgba(47, 176, 129, .28), transparent 55%), linear-gradient(145deg, #13221f 5%, #141b1c 53%, #101416 100%); }
  .star-field { position: absolute; inset: 0 0 30%; opacity: .72; background-image: radial-gradient(1px 1px at 13% 22%, rgba(255,255,255,.8) 90%, transparent), radial-gradient(1px 1px at 24% 68%, rgba(218,202,255,.8) 90%, transparent), radial-gradient(1px 1px at 38% 31%, rgba(255,255,255,.7) 90%, transparent), radial-gradient(1px 1px at 51% 15%, rgba(255,255,255,.55) 90%, transparent), radial-gradient(1.5px 1.5px at 62% 44%, rgba(255,255,255,.7) 90%, transparent), radial-gradient(1px 1px at 79% 23%, rgba(255,255,255,.8) 90%, transparent), radial-gradient(1px 1px at 88% 63%, rgba(223,212,255,.7) 90%, transparent), radial-gradient(1px 1px at 94% 14%, rgba(255,255,255,.6) 90%, transparent); }
  .nebula-cloud { position: absolute; width: 46%; height: 34%; filter: blur(36px); opacity: .34; border-radius: 50%; background: var(--sector-haze); animation: nebulaDrift 18s ease-in-out infinite alternate; }
  .cloud-one { top: 20%; left: 23%; transform: rotate(-20deg); }
  .cloud-two { top: 36%; left: 57%; opacity: .2; animation-delay: -9s; }
  .planet-backdrop { position: absolute; top: 8%; right: 12%; width: clamp(95px, 13vw, 158px); aspect-ratio: 1; opacity: .72; }
  .planet-body { position: absolute; inset: 0; overflow: hidden; border-radius: 50%; background: radial-gradient(circle at 32% 28%, color-mix(in srgb, var(--planet-color) 92%, #fff), var(--planet-color) 46%, #171321 102%); box-shadow: inset -25px -9px 38px rgba(9,8,15,.92), 0 0 48px color-mix(in srgb, var(--planet-color) 28%, transparent); }
  .planet-body::after { content: ""; position: absolute; inset: 51% -20% 13%; border-top: 1px solid rgba(255,255,255,.25); border-bottom: 6px solid rgba(221,202,255,.07); transform: rotate(-18deg); }
  .planet-ring { position: absolute; z-index: 2; width: 144%; height: 34%; top: 40%; left: -23%; border: 1px solid color-mix(in srgb, var(--planet-color) 78%, #fff); border-radius: 50%; transform: rotate(-20deg); opacity: .46; }
  .planet-crater { position: absolute; display: block; border-radius: 50%; border: 1px solid rgba(27,19,42,.32); background: rgba(30,21,47,.1); }
  .crater-one { width: 14%; height: 9%; top: 29%; left: 58%; transform: rotate(22deg); }
  .crater-two { width: 8%; height: 6%; top: 63%; left: 34%; }
  .debris { position: absolute; display: block; width: 7px; height: 11px; background: #746b82; opacity: .55; clip-path: polygon(30% 0, 100% 23%, 78% 100%, 0 72%); animation: debrisFloat 9s ease-in-out infinite alternate; }
  .debris-one { top: 29%; left: 13%; transform: rotate(19deg); }
  .debris-two { top: 48%; right: 18%; width: 9px; height: 7px; animation-delay: -4s; }
  .debris-three { top: 65%; left: 22%; width: 5px; height: 8px; animation-delay: -6s; }
  .debris-four { top: 22%; left: 68%; width: 5px; height: 9px; animation-delay: -2s; }
  .horizon-glow { position: absolute; height: 52%; bottom: 11%; left: -20%; right: -20%; background: radial-gradient(ellipse at 50% 100%, color-mix(in srgb, var(--sector-accent) 19%, transparent), transparent 60%); }
  .hangar-floor { position: absolute; height: 44%; left: -10%; right: -10%; bottom: -22%; transform: perspective(280px) rotateX(55deg); transform-origin: top center; border-top: 1px solid rgba(211,199,237,.18); background: linear-gradient(180deg, rgba(34,27,47,.4), rgba(10,9,15,.98)); }
  .floor-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(184,163,220,.17) 1px, transparent 1px), linear-gradient(90deg, rgba(184,163,220,.13) 1px, transparent 1px); background-size: 65px 33px; mask-image: linear-gradient(180deg, rgba(0,0,0,.8), transparent 90%); }
  .landing-disc { position: absolute; width: 54%; height: 50%; top: -18%; left: 23%; border: 1px solid color-mix(in srgb, var(--sector-accent) 47%, transparent); border-radius: 50%; box-shadow: 0 0 34px color-mix(in srgb, var(--sector-accent) 18%, transparent), inset 0 0 28px rgba(181,151,255,.1); }
  .landing-disc::before, .landing-disc::after { content: ""; position: absolute; width: 13%; height: 1px; top: 50%; background: var(--sector-accent); opacity: .65; }
  .landing-disc::before { left: -3%; } .landing-disc::after { right: -3%; }
  .landing-disc span { position: absolute; inset: 22%; border: 1px dashed rgba(208,193,234,.15); border-radius: 50%; }
  .landing-disc i { position: absolute; inset: 42%; background: var(--sector-accent); opacity: .25; border-radius: 50%; filter: blur(9px); }
  .scene-head { position: absolute; top: 18px; left: 20px; right: 20px; display: flex; justify-content: space-between; align-items: start; z-index: 5; }
  .scene-head > div { display: flex; flex-direction: column; gap: 6px; }
  .scene-label { display: flex; align-items: center; gap: 7px; color: #d3cce0; font: 10px 'Share Tech Mono', monospace; letter-spacing: .14em; }
  .live-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--sector-accent); box-shadow: 0 0 10px var(--sector-accent); }
  .scene-mode, .scene-coordinate { color: #80798e; font: 8px 'Share Tech Mono', monospace; letter-spacing: .1em; }
  .scene-coordinate { padding-top: 3px; }
  .environment-control { position: absolute; z-index: 6; top: 77px; left: 20px; display: flex; flex-direction: column; gap: 8px; }
  .control-label { color: #928ba0; font: 8px 'Share Tech Mono', monospace; letter-spacing: .13em; }
  .environment-options { display: flex; flex-direction: column; gap: 4px; }
  .environment-option { width: 146px; display: flex; align-items: center; gap: 9px; padding: 7px 9px; border: 1px solid transparent; color: #888194; background: rgba(19,16,27,.5); text-align: left; cursor: pointer; font: 600 12px 'Rajdhani', sans-serif; transition: color .2s, background .2s, border-color .2s; }
  .environment-option:hover { color: #e9e3f2; border-color: rgba(221,207,242,.16); }
  .environment-option.active { border-color: color-mix(in srgb, var(--sector-accent) 48%, transparent); color: #f3edff; background: color-mix(in srgb, var(--sector-accent) 11%, rgba(22,18,30,.85)); }
  .env-number { color: var(--sector-accent); font: 9px 'Share Tech Mono', monospace; opacity: .8; }
  .ship-view-area { position: absolute; inset: 55px 11% 48px 14%; display: grid; place-items: center; perspective: 900px; }
  .ship-stage { width: min(74%, 475px); height: 76%; display: grid; place-items: center; position: relative; transform-style: preserve-3d; }
  .ship-orbit { position: absolute; width: 96%; height: 38%; border: 1px solid rgba(199,180,235,.16); border-radius: 50%; transform: rotateX(67deg) rotateZ(-7deg); }
  .orbit-b { width: 76%; height: 29%; border-color: rgba(199,180,235,.1); transform: rotateX(68deg) rotateZ(14deg); }
  .ship-rig { width: min(100%, 420px); position: relative; z-index: 3; transform-style: preserve-3d; transform: perspective(800px) rotateY(var(--ship-angle)) rotateX(6deg); transition: transform .65s cubic-bezier(.2,.8,.2,1); filter: drop-shadow(0 16px 17px rgba(4,3,12,.58)) drop-shadow(0 0 15px color-mix(in srgb, var(--ship-color) 38%, transparent)); animation: shipHover 5.5s ease-in-out infinite; }
  .ship-artwork { display: block; width: 100%; overflow: visible; }
  .ship-artwork.small { width: 100%; }
  .ship-engine-flare { position: absolute; width: 23%; height: 9%; left: -1%; top: 46%; border-radius: 50%; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--ship-color) 74%, white)); filter: blur(8px); opacity: .65; }
  .ship-shadow { position: absolute; z-index: 1; bottom: 14%; width: 56%; height: 11%; border-radius: 50%; background: color-mix(in srgb, var(--sector-accent) 26%, transparent); filter: blur(18px); transform: rotateX(55deg); }
  .rotation-controls { position: absolute; z-index: 7; bottom: 4px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; color: #9b94a9; font: 8px 'Share Tech Mono', monospace; letter-spacing: .12em; white-space: nowrap; }
  .rotation-controls button { display: grid; place-items: center; width: 27px; height: 25px; padding: 0; color: #cdc4dc; border: 1px solid rgba(202,188,226,.24); background: rgba(16,13,24,.55); cursor: pointer; transition: color .18s, border-color .18s, background .18s; }
  .rotation-controls button:hover { color: var(--sector-accent); border-color: var(--sector-accent); background: rgba(28,23,40,.82); }
  .rotation-controls .rotate-forward { transform: scaleX(-1); }
  .rotation-controls .reset-view { display: inline-flex; align-items: center; width: auto; height: auto; padding: 6px 7px; margin-left: 2px; color: #898295; font: 8px 'Share Tech Mono', monospace; letter-spacing: .1em; }
  .scene-arrow { position: absolute; z-index: 8; top: 50%; width: 33px; height: 38px; display: grid; place-items: center; padding: 0; color: #d3cada; background: rgba(14,12,22,.47); border: 1px solid rgba(213,199,239,.22); cursor: pointer; transform: translateY(-50%); transition: color .2s, border-color .2s; }
  .scene-arrow:hover { color: var(--sector-accent); border-color: var(--sector-accent); }
  .scene-arrow-left { left: 1%; } .scene-arrow-right { right: 1%; }
  .scene-caption { position: absolute; z-index: 5; left: 20px; right: 20px; bottom: 14px; display: flex; align-items: center; gap: 8px; color: #868093; font: 8px 'Share Tech Mono', monospace; letter-spacing: .1em; }
  .caption-mark { width: 16px; height: 1px; background: var(--sector-accent); }
  .scene-caption b { color: #c5bbd4; font-weight: 400; }
  .caption-right { margin-left: auto; }
  .ship-console { display: flex; flex-direction: column; min-width: 0; padding: 19px 21px 14px; border: 1px solid var(--line); background: linear-gradient(145deg, rgba(27,23,39,.97), rgba(18,16,26,.97)); position: relative; overflow: hidden; }
  .ship-console::before { content: ""; position: absolute; top: 0; right: 0; width: 42%; height: 1px; background: linear-gradient(90deg, transparent, var(--sector-accent)); opacity: .9; }
  .console-topline { display: flex; justify-content: space-between; align-items: center; }
  .console-label { color: #8c849a; font: 9px 'Share Tech Mono', monospace; letter-spacing: .16em; }
  .status-tag { display: flex; align-items: center; gap: 6px; color: #9e97ad; font: 8px 'Share Tech Mono', monospace; letter-spacing: .1em; }
  .status-tag i { width: 5px; height: 5px; background: currentColor; border-radius: 50%; }
  .status-equipped { color: var(--sector-accent); }
  .status-owned { color: #9ac7ba; }
  .status-locked { color: #a39aaa; }
  .ship-title { padding: 20px 0 17px; border-bottom: 1px solid var(--line); }
  .ship-index { color: var(--sector-accent); font: 9px 'Share Tech Mono', monospace; letter-spacing: .1em; }
  .ship-index i { color: #746d80; font-style: normal; }
  .ship-title h2 { margin: 7px 0 4px; color: #f1edf8; font: 700 clamp(21px, 2vw, 29px)/1.1 'Orbitron', 'Trebuchet MS', sans-serif; letter-spacing: .025em; }
  .ship-title p { margin: 0; color: #aaa3b5; font: 500 15px/1 'Rajdhani', sans-serif; }
  .stat-block { display: flex; flex-direction: column; gap: 11px; padding: 16px 0; border-bottom: 1px solid var(--line); }
  .stat-row { display: grid; grid-template-columns: 91px 1fr 29px; align-items: center; gap: 8px; }
  .stat-label { display: flex; align-items: center; gap: 6px; color: #968fa2; font: 8px 'Share Tech Mono', monospace; letter-spacing: .075em; }
  .stat-label svg { color: var(--sector-accent); }
  .stat-meter { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; }
  .stat-meter i { display: block; height: 4px; background: rgba(207,196,224,.13); }
  .stat-meter i.filled { background: var(--sector-accent); box-shadow: 0 0 7px color-mix(in srgb, var(--sector-accent) 55%, transparent); }
  .stat-row > strong { text-align: right; color: #e5deee; font: 11px 'Share Tech Mono', monospace; }
  .stat-row > strong span { color: #746d80; }
  .ability-block { padding: 13px 0 12px; border-bottom: 1px solid var(--line); }
  .ability-heading { display: flex; gap: 7px; align-items: center; color: var(--sector-accent); font: 8px 'Share Tech Mono', monospace; letter-spacing: .13em; }
  .ability-heading svg { color: var(--sector-accent); }
  .ability-block strong { display: block; margin-top: 6px; color: #e4deed; font: 600 13px 'Orbitron', sans-serif; letter-spacing: .04em; }
  .ability-block p { margin: 4px 0 0; color: #9891a4; font: 500 13px/1.24 'Rajdhani', sans-serif; }
  .purchase-row { display: flex; align-items: end; justify-content: space-between; gap: 10px; margin-top: auto; padding-top: 13px; }
  .ship-price { display: flex; flex-direction: column; gap: 4px; }
  .ship-price strong { min-height: 21px; display: flex; align-items: center; gap: 6px; color: #f1edf8; font: 600 16px 'Orbitron', sans-serif; }
  .ship-price strong svg { color: var(--sector-accent); }
  .ship-action { min-width: 136px; height: 37px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 12px; border: 1px solid transparent; color: #171321; background: var(--sector-accent); cursor: pointer; font: 700 9px 'Share Tech Mono', monospace; letter-spacing: .08em; transition: transform .18s, filter .18s, background .18s; }
  .ship-action:not(:disabled):hover { transform: translateY(-1px); filter: brightness(1.1); }
  .ship-action:focus-visible, .environment-option:focus-visible, .scene-arrow:focus-visible, .rotation-controls button:focus-visible, .fleet-card:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
  .ship-action:disabled { cursor: default; }
  .action-equipped { color: var(--sector-accent); border-color: color-mix(in srgb, var(--sector-accent) 45%, transparent); background: color-mix(in srgb, var(--sector-accent) 12%, transparent); }
  .action-purchase:disabled { color: #aaa2b3; border-color: rgba(194,181,209,.15); background: #302b38; }
  .action-ready { color: #f3eff8; border-color: rgba(216,202,238,.3); background: rgba(227,216,245,.08); }
  .shortfall { margin-top: 8px; text-align: right; color: #8f8798; font: 8px 'Share Tech Mono', monospace; letter-spacing: .08em; }
  .shortfall strong { color: #c0adcf; font-weight: 400; }
  .action-notice { min-height: 12px; margin-top: 7px; color: var(--sector-accent); font: 9px 'Share Tech Mono', monospace; letter-spacing: .04em; }
  .fleet-section { margin-top: 24px; }
  .fleet-heading { display: flex; align-items: end; justify-content: space-between; margin-bottom: 11px; }
  .fleet-heading h2 { margin: 6px 0 0; color: #f2edf9; font: 700 21px 'Orbitron', 'Trebuchet MS', sans-serif; letter-spacing: .02em; text-transform: uppercase; }
  .fleet-heading h2 span { color: #837b8e; font: 11px 'Share Tech Mono', monospace; vertical-align: middle; }
  .fleet-heading > p { margin: 0 0 2px; color: #777083; font: 8px 'Share Tech Mono', monospace; letter-spacing: .13em; }
  .fleet-list { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 9px; }
  .fleet-card { min-width: 0; height: 127px; position: relative; display: flex; flex-direction: column; overflow: hidden; padding: 10px 12px 9px; text-align: left; color: #e7e1ef; border: 1px solid rgba(198,184,221,.14); background: linear-gradient(115deg, rgba(30,26,41,.9), rgba(20,18,27,.95)); cursor: pointer; transition: border-color .2s, background .2s, transform .2s; }
  .fleet-card:hover { transform: translateY(-2px); border-color: rgba(206,192,230,.35); }
  .fleet-card.selected { border-color: color-mix(in srgb, var(--fleet-color) 68%, transparent); background: linear-gradient(115deg, color-mix(in srgb, var(--fleet-color) 10%, #201b2c), rgba(20,18,27,.96)); }
  .fleet-card-top { position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center; }
  .fleet-number { color: #70697b; font: 9px 'Share Tech Mono', monospace; }
  .fleet-state { color: #8e8797; font: 7px 'Share Tech Mono', monospace; letter-spacing: .08em; }
  .fleet-state.state-equipped { color: var(--sector-accent); }
  .fleet-state.state-owned { color: #9fc8bb; }
  .fleet-art { position: absolute; width: 56%; right: 7%; top: 13%; color: var(--fleet-color); opacity: .88; filter: drop-shadow(0 0 8px color-mix(in srgb, var(--fleet-color) 44%, transparent)); }
  .fleet-card-bottom { z-index: 2; display: flex; flex-direction: column; gap: 3px; margin-top: auto; }
  .fleet-name { color: #e8e2f0; font: 600 11px 'Orbitron', sans-serif; letter-spacing: .02em; }
  .fleet-price { display: flex; align-items: center; gap: 4px; color: #898294; font: 9px 'Share Tech Mono', monospace; }
  .fleet-price svg { color: var(--sector-accent); }
  .fleet-selected-bar { position: absolute; left: 0; bottom: 0; width: 0; height: 2px; background: var(--fleet-color); transition: width .25s ease; }
  .fleet-card.selected .fleet-selected-bar { width: 100%; }
  .hangar-footer { display: flex; justify-content: space-between; margin-top: 17px; padding: 10px 0 0; border-top: 1px solid rgba(204,191,224,.09); color: #716a7d; font: 8px 'Share Tech Mono', monospace; letter-spacing: .11em; }
  .hangar-footer i { color: #494354; font-style: normal; margin: 0 4px; }
  .hangar-footer > span:last-child { display: flex; align-items: center; gap: 7px; }
  @keyframes shipHover { 0%, 100% { translate: 0 0; } 50% { translate: 0 -7px; } }
  @keyframes nebulaDrift { from { transform: translate3d(-2%, 0, 0) rotate(-20deg); } to { transform: translate3d(5%, 7%, 0) rotate(-11deg); } }
  @keyframes debrisFloat { from { translate: 0 0; rotate: 0deg; } to { translate: 12px -10px; rotate: 35deg; } }
  @media (max-width: 1000px) {
    .hangar-main { width: min(100% - 44px, 820px); }
    .topbar-inner { padding: 0 22px; }
    .main-nav { gap: 17px; }
    .main-nav .nav-optional { display: none; }
    .hangar-grid { grid-template-columns: minmax(0, 1.45fr) minmax(290px, .9fr); }
    .ship-console { padding: 16px; }
    .environment-control { left: 14px; }
    .environment-option { width: 130px; }
    .ship-view-area { left: 16%; right: 7%; }
  }
  @media (max-width: 760px) {
    .hangar-topbar { height: 59px; }
    .topbar-inner { padding: 0 17px; }
    .brand-lockup { min-width: 0; }
    .brand-word { font-size: 14px; }
    .brand-mark { width: 27px; height: 27px; }
    .main-nav { gap: 0; }
    .main-nav span:not(.current) { display: none; }
    .main-nav .current { padding: 22px 0 20px; font-size: 9px; }
    .pilot-info { font-size: 0; gap: 7px; }
    .pilot-avatar { width: 26px; height: 26px; }
    .hangar-main { width: calc(100% - 30px); padding-top: 23px; }
    .page-heading { min-height: 0; align-items: center; margin-bottom: 17px; gap: 10px; }
    .page-heading h1 { font-size: 35px; }
    .page-heading p { max-width: 240px; font-size: 14px; line-height: 1.2; }
    .balance-chip { min-width: 125px; height: 50px; padding: 7px; gap: 7px; }
    .balance-icon { width: 30px; height: 30px; }
    .balance-copy strong { font-size: 15px; }
    .balance-plus { display: none; }
    .hangar-grid { grid-template-columns: 1fr; gap: 11px; }
    .scene-panel { height: 390px; }
    .scene-head { left: 14px; right: 14px; top: 14px; }
    .scene-coordinate { display: none; }
    .environment-control { top: 68px; left: 13px; }
    .environment-options { flex-direction: row; flex-wrap: wrap; max-width: 170px; }
    .environment-option { width: auto; min-width: 0; padding: 6px 7px; font-size: 10px; gap: 5px; }
    .environment-option .env-number { display: none; }
    .ship-view-area { inset: 74px 4% 42px 7%; }
    .ship-stage { width: 79%; height: 69%; margin-left: 45px; }
    .ship-rig { width: min(100%, 350px); }
    .scene-caption { left: 14px; right: 14px; bottom: 11px; }
    .ship-console { padding: 16px; }
    .ship-title { padding: 14px 0; }
    .ship-title h2 { font-size: 25px; }
    .stat-block { gap: 12px; padding: 14px 0; }
    .stat-row { grid-template-columns: 105px 1fr 31px; }
    .ability-block { padding: 13px 0; }
    .purchase-row { padding-top: 13px; }
    .fleet-section { margin-top: 22px; }
    .fleet-list { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
    .fleet-card { height: 119px; }
    .fleet-heading h2 { font-size: 18px; }
    .fleet-heading > p { display: none; }
    .hangar-footer { font-size: 7px; }
  }
  @media (max-width: 390px) {
    .brand-word { font-size: 12px; }
    .page-heading h1 { font-size: 30px; }
    .page-heading p { max-width: 196px; font-size: 13px; }
    .balance-chip { min-width: 110px; }
    .balance-icon { display: none; }
    .environment-options { max-width: 145px; }
    .environment-option { font-size: 9px; padding: 6px; }
    .ship-view-area { left: 1%; right: 1%; }
    .ship-stage { margin-left: 32px; width: 85%; }
    .scene-arrow { width: 28px; height: 32px; }
    .rotation-controls { gap: 6px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .astro-hangar *, .astro-hangar *::before, .astro-hangar *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; }
  }
`;
