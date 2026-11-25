import { useEffect, useRef } from "react";
import { stepParticles, type Particle } from "@/lib/game-effects";
import { constellation, driftStars, glowAt, makeStars, starPosition, wanderPoint, type Point } from "@/lib/starfield";

const REACH = 190;
const LINK = 120;
const WAKE_SPACING = 22;
const IDLE_AFTER_MS = 2500;

type Ripple = { x: number; y: number; born: number };

function themeColors() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return { primary: read("--primary", "263 70% 50%"), star: read("--foreground", "210 20% 98%") };
}

/**
 * A quiet field of drifting stars that responds to the pointer: a soft light follows it, stars
 * near the light brighten and lean towards it, faint lines join the ones around it, and a slow
 * wake of specks trails behind. A click sends out one pale ring. With no pointer (or on a touch
 * screen at rest) the light wanders by itself. Colours come from the current theme.
 */
export function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const stars = makeStars(110, 20260);
    const wake: Particle[] = [];
    const ripples: Ripple[] = [];
    const points: Point[] = stars.map(() => ({ x: 0, y: 0 }));
    let width = 0;
    let height = 0;
    let dpr = 1;
    let colors = themeColors();
    let pointer: Point | null = null;
    let lastMoved = -Infinity;
    let lastWake: Point | null = null;
    let light: Point | null = null;
    let last = performance.now();
    let frame = 0;
    let raf = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };
    resize();

    const onMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      lastMoved = performance.now();
      if (!lastWake || Math.hypot(pointer.x - lastWake.x, pointer.y - lastWake.y) > WAKE_SPACING) {
        lastWake = { ...pointer };
        if (wake.length < 90) {
          wake.push({
            x: pointer.x + (Math.random() - 0.5) * 6,
            y: pointer.y + (Math.random() - 0.5) * 6,
            vx: (Math.random() - 0.5) * 0.35,
            vy: -0.1 - Math.random() * 0.3,
            life: 90,
            maxLife: 90,
            size: 1 + Math.random() * 1.6,
            color: "",
          });
        }
      }
    };
    const onDown = (event: PointerEvent) => {
      onMove(event);
      ripples.push({ x: event.clientX, y: event.clientY, born: performance.now() });
      if (ripples.length > 4) ripples.shift();
    };
    const onLeave = () => {
      pointer = null;
      lastWake = null;
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const ms = Math.min(now - last, 50);
      last = now;
      if (frame++ % 120 === 0) colors = themeColors();

      const active = pointer && now - lastMoved < IDLE_AFTER_MS;
      const target = active && pointer ? pointer : wanderPoint(now, width, height);
      light = light ? { x: light.x + (target.x - light.x) * 0.1, y: light.y + (target.y - light.y) * 0.1 } : { ...target };

      driftStars(stars, ms);
      stepParticles(wake, ms / 16.67);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // soft light under the pointer
      const halo = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, 260);
      halo.addColorStop(0, `hsl(${colors.primary} / 0.16)`);
      halo.addColorStop(1, `hsl(${colors.primary} / 0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(light.x - 260, light.y - 260, 520, 520);

      const glows: number[] = [];
      stars.forEach((star, i) => {
        const base = starPosition(star, width, height, light);
        const glow = glowAt(base, light, REACH);
        points[i].x = base.x + (light!.x - base.x) * glow * 0.07;
        points[i].y = base.y + (light!.y - base.y) * glow * 0.07;
        glows[i] = glow;
      });

      ctx.lineWidth = 0.8;
      for (const [a, b] of constellation(points, light, REACH, LINK)) {
        const strength = Math.min(glows[a], glows[b]);
        ctx.strokeStyle = `hsl(${colors.primary} / ${(0.1 + strength * 0.6).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(points[a].x, points[a].y);
        ctx.lineTo(points[b].x, points[b].y);
        ctx.stroke();
      }

      stars.forEach((star, i) => {
        const twinkle = 0.78 + 0.22 * Math.sin(now * 0.0012 + star.phase);
        const alpha = Math.min(1, (0.22 + star.z * 0.5) * twinkle + glows[i] * 0.5);
        ctx.fillStyle = `hsl(${colors.star} / ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(points[i].x, points[i].y, star.r * (1 + glows[i] * 0.7), 0, Math.PI * 2);
        ctx.fill();
      });

      for (const p of wake) {
        const fade = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = `hsl(${colors.primary} / ${(fade * 0.55).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + fade * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        const t = (now - ripples[i].born) / 1100;
        if (t >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        const ease = 1 - Math.pow(1 - t, 3);
        ctx.strokeStyle = `hsl(${colors.primary} / ${((1 - t) * 0.5).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(ripples[i].x, ripples[i].y, 8 + ease * 150, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="space-backdrop-canvas" />;
}
