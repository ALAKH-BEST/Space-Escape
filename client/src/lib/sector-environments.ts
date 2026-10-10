export const sectorEnvironments = [
  {
    id: "violet-expanse",
    name: "Violet Expanse",
    shortName: "VIOLET EXPANSE",
    description: "A quiet stretch of deep space, lit by a distant violet world.",
    palette: {
      background: "#080716",
      deep: "#17102d",
      nebula: "#8b5cf6",
      planet: "#51418c",
      accent: "#c4b5fd",
      debris: "#d8d1ff",
    },
  },
  {
    id: "crystal-veil",
    name: "Crystal Veil",
    shortName: "CRYSTAL VEIL",
    description: "Blue ice fields and fractured rings catch the starlight.",
    palette: {
      background: "#061320",
      deep: "#0b283b",
      nebula: "#22d3ee",
      planet: "#35729a",
      accent: "#a5f3fc",
      debris: "#c9f6ff",
    },
  },
  {
    id: "emerald-nebula",
    name: "Emerald Nebula",
    shortName: "EMERALD NEBULA",
    description: "A living cloud of green light curls around a jade planet.",
    palette: {
      background: "#04140f",
      deep: "#0a3026",
      nebula: "#10b981",
      planet: "#176b58",
      accent: "#6ee7b7",
      debris: "#bbf7d0",
    },
  },
  {
    id: "solar-rift",
    name: "Solar Rift",
    shortName: "SOLAR RIFT",
    description: "Charged dust glows orange along the edge of a star nursery.",
    palette: {
      background: "#180b08",
      deep: "#38180e",
      nebula: "#f97316",
      planet: "#a24925",
      accent: "#fed7aa",
      debris: "#ffedd5",
    },
  },
  {
    id: "eclipse-graveyard",
    name: "Eclipse Graveyard",
    shortName: "ECLIPSE GRAVEYARD",
    description: "A red eclipse hangs above a field of silent wreckage.",
    palette: {
      background: "#11070f",
      deep: "#2a0c25",
      nebula: "#e879f9",
      planet: "#702d64",
      accent: "#f5d0fe",
      debris: "#fbcfe8",
    },
  },
] as const;

export type SectorEnvironment = (typeof sectorEnvironments)[number];

export function getSectorEnvironmentByNumber(sectorNumber: number): SectorEnvironment {
  const normalizedNumber = Number.isFinite(sectorNumber)
    ? Math.max(1, Math.floor(sectorNumber))
    : 1;
  return sectorEnvironments[(normalizedNumber - 1) % sectorEnvironments.length];
}

export function drawSectorEnvironment(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sectorNumber: number,
  timestamp: number,
) {
  if (width <= 0 || height <= 0) return;

  const environment = getSectorEnvironmentByNumber(sectorNumber);
  const { palette } = environment;

  ctx.save();
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, palette.background);
  base.addColorStop(1, palette.deep);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const sway = Math.sin(timestamp * 0.00008) * width * 0.035;
  const nebula = ctx.createRadialGradient(
    width * 0.48 + sway,
    height * 0.55,
    0,
    width * 0.48 + sway,
    height * 0.55,
    Math.max(width, height) * 0.62,
  );
  nebula.addColorStop(0, `${palette.nebula}42`);
  nebula.addColorStop(0.48, `${palette.nebula}18`);
  nebula.addColorStop(1, `${palette.nebula}00`);
  ctx.fillStyle = nebula;
  ctx.fillRect(0, 0, width, height);

  const planetRadius = Math.min(width, height) * 0.16;
  const planetX = width * 0.82 + Math.sin(timestamp * 0.00004) * 8;
  const planetY = height * 0.3;
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.shadowBlur = 24;
  ctx.shadowColor = `${palette.nebula}55`;
  const planet = ctx.createRadialGradient(
    planetX - planetRadius * 0.42,
    planetY - planetRadius * 0.42,
    planetRadius * 0.03,
    planetX,
    planetY,
    planetRadius,
  );
  planet.addColorStop(0, palette.accent);
  planet.addColorStop(0.32, palette.planet);
  planet.addColorStop(1, palette.background);
  ctx.fillStyle = planet;
  ctx.beginPath();
  ctx.arc(planetX, planetY, planetRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.24;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = Math.max(1, planetRadius * 0.025);
  ctx.beginPath();
  ctx.ellipse(
    planetX,
    planetY,
    planetRadius * 1.55,
    planetRadius * 0.42,
    -0.32,
    0,
    Math.PI * 2,
  );
  ctx.stroke();
  ctx.restore();

  for (let index = 0; index < 12; index += 1) {
    const driftSpeed = 0.012 + (index % 4) * 0.006;
    const travel = (timestamp * driftSpeed + index * 197.3) % (width + 80);
    const x = width + 40 - travel;
    const y = (index * 83.7 + Math.sin(timestamp * 0.0003 + index) * 16) % height;
    const size = 1.5 + (index % 3) * 1.1;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(timestamp * 0.00018 + index);
    ctx.globalAlpha = 0.17 + (index % 4) * 0.035;
    ctx.strokeStyle = palette.debris;
    ctx.fillStyle = palette.debris;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-size * 1.8, -size);
    ctx.lineTo(size * 1.8, -size * 0.3);
    ctx.lineTo(size * 0.7, size * 1.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
