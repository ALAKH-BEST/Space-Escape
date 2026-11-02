// Visual-only effects for the game canvas: engine trail, hit bursts and the crash flash.
// Nothing here touches scoring, collisions or difficulty.

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Remaining life in frames at 60 fps. */
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

export const MAX_PARTICLES = 220;
/** How long the crash animation plays before the results screen fades in. */
export const DEATH_EFFECT_MS = 650;

const EFFECTS_STORAGE_KEY = "astrododge:visual-effects:v1";
const effectsListeners = new Set<() => void>();

function readEffectsPreference() {
  try {
    return typeof window === "undefined" || window.localStorage.getItem(EFFECTS_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

let effectsEnabled = readEffectsPreference();

/** The player's "visual effects" setting. On by default. */
export function visualEffectsEnabled() {
  return effectsEnabled;
}

export function setVisualEffectsEnabled(next: boolean) {
  if (next === effectsEnabled) return;
  effectsEnabled = next;
  try {
    window.localStorage.setItem(EFFECTS_STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Keep the choice for this session even if browser storage is disabled.
  }
  effectsListeners.forEach((listener) => listener());
}

export function subscribeVisualEffects(listener: () => void) {
  effectsListeners.add(listener);
  return () => {
    effectsListeners.delete(listener);
  };
}

/** True when the effects should play: the setting is on and the device has not asked for reduced motion. */
export function effectsActive() {
  return effectsEnabled && !prefersReducedMotion();
}

export function prefersReducedMotion() {
  try {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function push(particles: Particle[], particle: Particle) {
  if (particles.length >= MAX_PARTICLES) particles.shift();
  particles.push(particle);
}

/** A couple of small embers drifting back from the engine. */
export function emitTrail(particles: Particle[], x: number, y: number, color: string, random = Math.random) {
  for (let index = 0; index < 2; index++) {
    push(particles, {
      x: x - 12 - random() * 6,
      y: y + (random() - 0.5) * 7,
      vx: -1.6 - random() * 1.4,
      vy: (random() - 0.5) * 0.5,
      life: 22 + random() * 10,
      maxLife: 32,
      size: 1.5 + random() * 2,
      color,
    });
  }
}

/** A burst of sparks flying out from a point. */
export function emitBurst(particles: Particle[], x: number, y: number, color: string, count: number, random = Math.random) {
  for (let index = 0; index < count; index++) {
    const angle = random() * Math.PI * 2;
    const speed = 1.5 + random() * 4.5;
    push(particles, {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 24 + random() * 22,
      maxLife: 46,
      size: 1.5 + random() * 3,
      color,
    });
  }
}

/** Moves particles forward by `frames` (1 = one 60 fps frame) and drops the ones that have faded out. */
export function stepParticles(particles: Particle[], frames = 1) {
  for (let index = particles.length - 1; index >= 0; index--) {
    const particle = particles[index];
    particle.x += particle.vx * frames;
    particle.y += particle.vy * frames;
    particle.vx *= Math.pow(0.97, frames);
    particle.vy *= Math.pow(0.97, frames);
    particle.life -= frames;
    if (particle.life <= 0) particles.splice(index, 1);
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  if (particles.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const particle of particles) {
    const fade = Math.max(0, Math.min(1, particle.life / particle.maxLife));
    ctx.globalAlpha = fade * 0.9;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * (0.4 + fade * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
