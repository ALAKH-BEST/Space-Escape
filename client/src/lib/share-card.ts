import { getSectorEnvironmentByNumber } from "@/lib/sector-environments";

/** What the card says about one finished run. */
export type ShareStats = {
  score: number;
  sector: number;
  survivalSeconds: number;
  shipName: string;
  shipColor: string;
  newBest: boolean;
  /** The UTC day (YYYY-MM-DD) when this was a daily challenge run. */
  dailyDate?: string;
};

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export function formatSurvival(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 60) return `${s.toFixed(1)}s`;
  const whole = Math.floor(s);
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, "0")}s`;
}

/** The message that goes with the picture. */
export function shareText(stats: ShareStats, url: string): string {
  const sector = getSectorEnvironmentByNumber(stats.sector);
  const best = stats.newBest ? " A new personal best!" : "";
  const where = stats.dailyDate ? `the ${stats.dailyDate} daily challenge in ASTRODODGE` : "ASTRODODGE";
  return (
    `I scored ${stats.score.toLocaleString("en-US")} in ${where} and reached Sector ${stats.sector} ` +
    `(${sector.name}) in ${formatSurvival(stats.survivalSeconds)}.${best} Can you beat it? ${url}`
  );
}

export function shareFileName(stats: ShareStats): string {
  return `astrododge-${stats.score}.png`;
}

/** A small deterministic random generator, so the same run always gets the same stars. */
export function seededRandom(seed: number): () => number {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Paints the card. It uses only the 2D context it is given, so it works on a canvas in the page
 * and on an off-screen one. fontFamily is the page's display font.
 */
export function drawShareCard(ctx: CanvasRenderingContext2D, stats: ShareStats, fontFamily: string, host: string) {
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;
  const env = getSectorEnvironmentByNumber(stats.sector);
  const p = env.palette;
  const rand = seededRandom(stats.score * 31 + stats.sector);

  // Deep space, lit from the side the planet is on.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, p.deep);
  bg.addColorStop(1, p.background);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.8, H * 0.2, 0, W * 0.8, H * 0.2, W * 0.9);
  glow.addColorStop(0, withAlpha(p.nebula, 0.55));
  glow.addColorStop(1, withAlpha(p.nebula, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(W * 0.1, H * 0.85, 0, W * 0.1, H * 0.85, W * 0.8);
  glow2.addColorStop(0, withAlpha(p.accent, 0.22));
  glow2.addColorStop(1, withAlpha(p.accent, 0));
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // Stars.
  for (let i = 0; i < 160; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 0.8 + rand() * 2.2;
    ctx.fillStyle = withAlpha(p.debris, 0.25 + rand() * 0.65);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // The sector's planet, partly off the edge.
  const planetGrad = ctx.createRadialGradient(W * 0.86, H * 0.17, 20, W * 0.88, H * 0.19, 260);
  planetGrad.addColorStop(0, p.accent);
  planetGrad.addColorStop(0.55, p.planet);
  planetGrad.addColorStop(1, p.deep);
  ctx.fillStyle = planetGrad;
  ctx.beginPath();
  ctx.arc(W * 0.88, H * 0.19, 230, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const font = (weight: number, size: number) => `${weight} ${size}px ${fontFamily}`;

  // Wordmark.
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = p.accent;
  ctx.shadowBlur = 28;
  ctx.font = font(800, 84);
  ctx.fillText("ASTRODODGE", W / 2, 190);
  ctx.shadowBlur = 0;
  ctx.fillStyle = withAlpha(p.debris, 0.8);
  ctx.font = font(600, 28);
  ctx.fillText(stats.dailyDate ? `DAILY CHALLENGE  ·  ${stats.dailyDate}` : "MISSION TERMINATED", W / 2, 250);

  // The ship, nose up, with an engine glow.
  const sx = W / 2;
  const sy = 470;
  const engine = ctx.createRadialGradient(sx, sy + 70, 0, sx, sy + 70, 150);
  engine.addColorStop(0, withAlpha(stats.shipColor, 0.7));
  engine.addColorStop(1, withAlpha(stats.shipColor, 0));
  ctx.fillStyle = engine;
  ctx.fillRect(sx - 160, sy - 100, 320, 340);
  ctx.save();
  ctx.shadowColor = stats.shipColor;
  ctx.shadowBlur = 36;
  ctx.fillStyle = stats.shipColor;
  ctx.beginPath();
  ctx.moveTo(sx, sy - 90);
  ctx.lineTo(sx + 62, sy + 70);
  ctx.lineTo(sx + 18, sy + 44);
  ctx.lineTo(sx, sy + 82);
  ctx.lineTo(sx - 18, sy + 44);
  ctx.lineTo(sx - 62, sy + 70);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.moveTo(sx, sy - 40);
  ctx.lineTo(sx + 14, sy + 20);
  ctx.lineTo(sx - 14, sy + 20);
  ctx.closePath();
  ctx.fill();

  // The score.
  ctx.fillStyle = withAlpha(p.debris, 0.8);
  ctx.font = font(600, 34);
  ctx.fillText("FINAL SCORE", W / 2, 690);
  const scoreText = stats.score.toLocaleString("en-US");
  let size = 210;
  ctx.font = font(800, size);
  while (ctx.measureText(scoreText).width > W - 160 && size > 80) {
    size -= 10;
    ctx.font = font(800, size);
  }
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = p.accent;
  ctx.shadowBlur = 40;
  ctx.fillText(scoreText, W / 2, 690 + size * 0.88);
  ctx.shadowBlur = 0;

  if (stats.newBest) {
    const label = "NEW PERSONAL BEST";
    ctx.font = font(700, 30);
    const w = ctx.measureText(label).width + 80;
    const y = 690 + size * 0.88 + 50;
    ctx.fillStyle = "rgba(253, 224, 71, 0.12)";
    ctx.strokeStyle = "rgba(253, 224, 71, 0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(W / 2 - w / 2, y, w, 64, 32);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fde047";
    ctx.fillText(label, W / 2, y + 43);
  }

  // Three facts.
  const cols = [
    { label: "SECTOR", value: String(stats.sector).padStart(2, "0") },
    { label: "SURVIVED", value: formatSurvival(stats.survivalSeconds) },
    { label: "SHIP", value: stats.shipName },
  ];
  const top = 1050;
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(90, top - 40);
  ctx.lineTo(W - 90, top - 40);
  ctx.stroke();
  cols.forEach((c, i) => {
    const cx = 90 + ((W - 180) / 3) * (i + 0.5);
    ctx.fillStyle = withAlpha(p.debris, 0.7);
    ctx.font = font(600, 24);
    ctx.fillText(c.label, cx, top);
    let vs = 46;
    ctx.font = font(700, vs);
    while (ctx.measureText(c.value).width > (W - 180) / 3 - 24 && vs > 24) {
      vs -= 2;
      ctx.font = font(700, vs);
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillText(c.value, cx, top + 70);
  });

  ctx.fillStyle = p.accent;
  ctx.font = font(600, 28);
  ctx.fillText(env.shortName, W / 2, top + 150);

  // Call to action.
  ctx.fillStyle = "#ffffff";
  ctx.font = font(800, 54);
  ctx.fillText("CAN YOU BEAT IT?", W / 2, H - 90);
  ctx.fillStyle = withAlpha(p.debris, 0.8);
  ctx.font = font(600, 28);
  ctx.fillText(host, W / 2, H - 44);
}

function displayFontFamily(): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim();
    if (v) return v;
  } catch {
    // fall through
  }
  return "sans-serif";
}

/** Renders the card to a PNG. */
export async function renderShareCard(stats: ShareStats, host: string): Promise<Blob> {
  const family = displayFontFamily();
  try {
    await Promise.all([document.fonts.load(`800 64px ${family}`), document.fonts.load(`600 24px ${family}`)]);
  } catch {
    // draw with whatever font is available
  }
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the share card.");
  drawShareCard(ctx, stats, family, host);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not make the share card."))), "image/png");
  });
}

export type ShareOutcome = "shared" | "saved" | "cancelled";

/**
 * Shares the card through the device's share sheet when it can send files (most phones), and
 * otherwise saves the image so it can be posted by hand.
 */
export async function shareRun(stats: ShareStats): Promise<ShareOutcome> {
  const url = `${window.location.origin}/`;
  const blob = await renderShareCard(stats, window.location.host);
  const file = new File([blob], shareFileName(stats), { type: "image/png" });
  const data: ShareData = { files: [file], text: shareText(stats, url) };
  if (typeof navigator.canShare === "function" && navigator.canShare(data) && typeof navigator.share === "function") {
    try {
      await navigator.share(data);
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // any other failure: fall back to saving the picture
    }
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return "saved";
}
