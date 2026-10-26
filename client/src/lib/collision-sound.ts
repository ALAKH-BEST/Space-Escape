// Impact sounds for ASTRODODGE, synthesized with the Web Audio API (no audio
// files): a deep "boom" when the ship is destroyed and a lighter thud when the
// Titan's shield absorbs a hit. Respects the music mute button.

import { isMusicMuted } from "@/lib/background-music";

export type CollisionKind = "explosion" | "shield";

let audioContext: AudioContext | null = null;

export function getSfxContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
  try {
    if (!audioContext || audioContext.state === "closed") audioContext = new window.AudioContext();
    return audioContext;
  } catch {
    return null;
  }
}

export function buildCollisionSound(context: BaseAudioContext, when: number, kind: CollisionKind) {
  const strong = kind === "explosion";
  const duration = strong ? 0.95 : 0.4;

  const output = context.createGain();
  output.gain.value = strong ? 0.28 : 0.18;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 12;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  output.connect(limiter);
  limiter.connect(context.destination);

  const noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let index = 0; index < noiseData.length; index += 1) noiseData[index] = Math.random() * 2 - 1;

  // Rumbling debris: noise whose brightness sweeps down as the blast dies away.
  const rumble = context.createBufferSource();
  rumble.buffer = noiseBuffer;
  const rumbleTone = context.createBiquadFilter();
  rumbleTone.type = "lowpass";
  rumbleTone.Q.value = 0.7;
  rumbleTone.frequency.setValueAtTime(strong ? 3200 : 1400, when);
  rumbleTone.frequency.exponentialRampToValueAtTime(strong ? 150 : 220, when + duration * 0.85);
  const rumbleEnvelope = context.createGain();
  rumbleEnvelope.gain.setValueAtTime(0.0001, when);
  rumbleEnvelope.gain.exponentialRampToValueAtTime(strong ? 0.6 : 0.4, when + 0.012);
  rumbleEnvelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  rumble.connect(rumbleTone);
  rumbleTone.connect(rumbleEnvelope);
  rumbleEnvelope.connect(output);
  rumble.start(when);
  rumble.stop(when + duration);

  // Low "boom": a sine that drops quickly in pitch.
  const thump = context.createOscillator();
  const thumpEnvelope = context.createGain();
  thump.type = "sine";
  thump.frequency.setValueAtTime(strong ? 150 : 190, when);
  thump.frequency.exponentialRampToValueAtTime(strong ? 40 : 60, when + (strong ? 0.5 : 0.22));
  thumpEnvelope.gain.setValueAtTime(0.0001, when);
  thumpEnvelope.gain.exponentialRampToValueAtTime(strong ? 0.9 : 0.6, when + 0.008);
  thumpEnvelope.gain.exponentialRampToValueAtTime(0.0001, when + (strong ? 0.75 : 0.32));
  thump.connect(thumpEnvelope);
  thumpEnvelope.connect(output);
  thump.start(when);
  thump.stop(when + (strong ? 0.8 : 0.35));

  // Sharp "crack" at the very start of the explosion.
  if (strong) {
    const crack = context.createBufferSource();
    crack.buffer = noiseBuffer;
    const crackTone = context.createBiquadFilter();
    crackTone.type = "highpass";
    crackTone.frequency.value = 1800;
    const crackEnvelope = context.createGain();
    crackEnvelope.gain.setValueAtTime(0.0001, when);
    crackEnvelope.gain.exponentialRampToValueAtTime(0.35, when + 0.004);
    crackEnvelope.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
    crack.connect(crackTone);
    crackTone.connect(crackEnvelope);
    crackEnvelope.connect(output);
    crack.start(when);
    crack.stop(when + 0.1);
  }
}

export function playCollisionSound(kind: CollisionKind) {
  if (isMusicMuted()) return;
  const context = getSfxContext();
  if (!context) return;
  try {
    if (context.state !== "running") void context.resume().catch(() => undefined);
    buildCollisionSound(context, context.currentTime + 0.01, kind);
  } catch {
    // A missing audio device or blocked browser context must not affect the run.
  }
}
