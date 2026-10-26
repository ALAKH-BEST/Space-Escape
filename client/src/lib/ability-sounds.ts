// Short ship-ability sound effects for ASTRODODGE, synthesized with the Web
// Audio API (no audio files). Respects the music mute button.

import { isMusicMuted } from "@/lib/background-music";
import { getSfxContext } from "@/lib/collision-sound";

export type AbilitySoundKind = "phase" | "phaseEnd" | "overdrive" | "overdriveEnd" | "fortress";

function createOutput(context: BaseAudioContext, level: number) {
  const output = context.createGain();
  output.gain.value = level;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -16;
  limiter.knee.value = 12;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  output.connect(limiter);
  limiter.connect(context.destination);
  return output;
}

function createNoise(context: BaseAudioContext, seconds: number) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  return source;
}

function envelope(
  context: BaseAudioContext,
  target: AudioNode,
  when: number,
  peak: number,
  attack: number,
  length: number,
) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
  gain.connect(target);
  return gain;
}

function sweptNoise(
  context: BaseAudioContext,
  target: AudioNode,
  when: number,
  length: number,
  fromHz: number,
  toHz: number,
  peak: number,
  type: BiquadFilterType,
  q = 1,
) {
  const noise = createNoise(context, length);
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(fromHz, when);
  filter.frequency.exponentialRampToValueAtTime(toHz, when + length * 0.9);
  noise.connect(filter);
  filter.connect(envelope(context, target, when, peak, Math.min(0.06, length / 4), length));
  noise.start(when);
  noise.stop(when + length);
}

function glide(
  context: BaseAudioContext,
  target: AudioNode,
  when: number,
  length: number,
  type: OscillatorType,
  fromHz: number,
  toHz: number,
  peak: number,
  attack: number,
  detuneCents = 0,
  lowpass?: { from: number; to: number },
) {
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.detune.value = detuneCents;
  oscillator.frequency.setValueAtTime(fromHz, when);
  oscillator.frequency.exponentialRampToValueAtTime(toHz, when + length * 0.85);
  let last: AudioNode = oscillator;
  if (lowpass) {
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(lowpass.from, when);
    filter.frequency.exponentialRampToValueAtTime(lowpass.to, when + length * 0.85);
    oscillator.connect(filter);
    last = filter;
  }
  last.connect(envelope(context, target, when, peak, attack, length));
  oscillator.start(when);
  oscillator.stop(when + length + 0.02);
}

export function buildAbilitySound(context: BaseAudioContext, when: number, kind: AbilitySoundKind) {
  switch (kind) {
    case "phase": {
      // Phantom X - Phase Shift: an airy, shimmering upward sweep.
      const out = createOutput(context, 0.42);
      sweptNoise(context, out, when, 0.5, 500, 3200, 0.3, "bandpass", 3);
      glide(context, out, when, 0.5, "sine", 330, 990, 0.22, 0.08);
      glide(context, out, when, 0.5, "sine", 330, 990, 0.18, 0.08, 9);
      break;
    }
    case "phaseEnd": {
      // Phase Shift fading away: the sweep reversed and softer.
      const out = createOutput(context, 0.4);
      sweptNoise(context, out, when, 0.32, 2600, 450, 0.25, "bandpass", 3);
      glide(context, out, when, 0.32, "sine", 880, 330, 0.18, 0.03);
      break;
    }
    case "overdrive": {
      // Nova - Overdrive: a rising engine power-up with a low kick.
      const out = createOutput(context, 0.42);
      glide(context, out, when, 0.55, "sawtooth", 110, 520, 0.2, 0.03, 0, { from: 400, to: 3500 });
      sweptNoise(context, out, when, 0.45, 1200, 300, 0.2, "lowpass", 0.7);
      glide(context, out, when, 0.25, "sine", 90, 45, 0.45, 0.01);
      break;
    }
    case "overdriveEnd": {
      // Overdrive winding down: pitch and brightness fall away.
      const out = createOutput(context, 0.4);
      glide(context, out, when, 0.4, "sawtooth", 420, 90, 0.16, 0.02, 0, { from: 2500, to: 300 });
      break;
    }
    case "fortress": {
      // Titan MK II - Fortress: a metallic shield-up hum with a bright ping.
      const out = createOutput(context, 0.32);
      glide(context, out, when, 0.8, "sine", 190, 196, 0.26, 0.15);
      glide(context, out, when, 0.8, "sine", 285, 294, 0.2, 0.15);
      glide(context, out, when, 0.8, "triangle", 380, 392, 0.12, 0.15);
      sweptNoise(context, out, when, 0.35, 600, 1800, 0.14, "bandpass", 2);
      glide(context, out, when + 0.18, 0.6, "sine", 1175, 1175, 0.07, 0.01);
      break;
    }
  }
}

export function playAbilitySound(kind: AbilitySoundKind) {
  if (isMusicMuted()) return;
  const context = getSfxContext();
  if (!context) return;
  try {
    if (context.state !== "running") void context.resume().catch(() => undefined);
    buildAbilitySound(context, context.currentTime + 0.01, kind);
  } catch {
    // A missing audio device or blocked browser context must not affect the run.
  }
}
