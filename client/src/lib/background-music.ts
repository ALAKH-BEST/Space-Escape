// Calm, procedural space-ambient soundtrack for ASTRODODGE.
//
// The music is synthesized with the Web Audio API (slow evolving pads, a soft
// bass note and a sparse, echoing pluck) so it needs no audio files, loops
// seamlessly and adds nothing to the bundle. It is deliberately quiet and
// unobtrusive so it sits underneath gameplay and the achievement chime.

const MUTE_STORAGE_KEY = "astrododge:music-muted:v1";

export const MUSIC_STEP_SECONDS = 0.5;
const STEPS_PER_BAR = 8;
const STEPS_PER_CHORD = 16;
export const MUSIC_LOOP_STEPS = 64;
export const MUSIC_LOOP_SECONDS = MUSIC_LOOP_STEPS * MUSIC_STEP_SECONDS;

const LOOKAHEAD_SECONDS = 1.5;
const SCHEDULER_INTERVAL_MS = 250;
const MUSIC_LEVEL = 0.9;
const FADE_IN_SECONDS = 2;
const DEFAULT_FADE_OUT_SECONDS = 1.5;
const QUICK_FADE_SECONDS = 0.25;

const PAD_GAIN = 0.03;
const BASS_GAIN = 0.07;
const PLUCK_GAIN = 0.05;

type Chord = {
  bass: number;
  pad: readonly number[];
  arp: readonly number[];
};

// Am9 - Fmaj7 - Cadd9 - Gadd6, eight seconds each (MIDI note numbers).
const PROGRESSION: readonly Chord[] = [
  { bass: 45, pad: [57, 60, 64, 71], arp: [69, 72, 76, 83] },
  { bass: 41, pad: [53, 57, 60, 64], arp: [65, 69, 72, 76] },
  { bass: 48, pad: [55, 60, 64, 74], arp: [67, 72, 76, 86] },
  { bass: 43, pad: [55, 59, 62, 64], arp: [67, 71, 74, 76] },
];

const ARP_STEPS = [0, 3, 6, 8, 11, 14];
const ARP_NOTE_INDEX = [0, 2, 1, 3, 2, 1];

export type MusicGraph = {
  bus: GainNode;
  master: GainNode;
  delaySend: GainNode;
  lfo: OscillatorNode;
};

function midiToHz(note: number) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export function createMusicGraph(context: BaseAudioContext): MusicGraph {
  const bus = context.createGain();
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1500;
  filter.Q.value = 0.4;
  const master = context.createGain();
  master.gain.value = 0;

  bus.connect(filter);
  filter.connect(master);
  master.connect(context.destination);

  // A slow sweep of the filter keeps the pads gently moving.
  const lfo = context.createOscillator();
  const lfoDepth = context.createGain();
  lfo.type = "sine";
  lfo.frequency.value = 0.045;
  lfoDepth.gain.value = 320;
  lfo.connect(lfoDepth);
  lfoDepth.connect(filter.frequency);
  lfo.start();

  // Soft dotted echo for the plucks.
  const delaySend = context.createGain();
  delaySend.gain.value = 0.55;
  const delay = context.createDelay(2);
  delay.delayTime.value = MUSIC_STEP_SECONDS * 1.5;
  const feedback = context.createGain();
  feedback.gain.value = 0.36;
  const feedbackTone = context.createBiquadFilter();
  feedbackTone.type = "lowpass";
  feedbackTone.frequency.value = 1800;
  const wet = context.createGain();
  wet.gain.value = 0.5;
  delaySend.connect(delay);
  delay.connect(wet);
  wet.connect(bus);
  delay.connect(feedbackTone);
  feedbackTone.connect(feedback);
  feedback.connect(delay);

  return { bus, master, delaySend, lfo };
}

function playPad(context: BaseAudioContext, graph: MusicGraph, note: number, when: number, hold: number) {
  const attack = 2.2;
  const release = 2.4;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(PAD_GAIN, when + attack);
  envelope.gain.setValueAtTime(PAD_GAIN, when + hold);
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + hold + release);
  envelope.connect(graph.bus);

  const voices: Array<{ type: OscillatorType; detune: number; level: number }> = [
    { type: "sine", detune: -3, level: 1 },
    { type: "triangle", detune: 4, level: 0.4 },
  ];
  voices.forEach(({ type, detune, level }) => {
    const oscillator = context.createOscillator();
    const voiceGain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(midiToHz(note), when);
    oscillator.detune.setValueAtTime(detune, when);
    voiceGain.gain.value = level;
    oscillator.connect(voiceGain);
    voiceGain.connect(envelope);
    oscillator.start(when);
    oscillator.stop(when + hold + release + 0.05);
  });
}

function playBass(context: BaseAudioContext, graph: MusicGraph, note: number, when: number) {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(midiToHz(note), when);
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(BASS_GAIN, when + 0.5);
  envelope.gain.setValueAtTime(BASS_GAIN, when + 2.6);
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + 4.2);
  oscillator.connect(envelope);
  envelope.connect(graph.bus);
  oscillator.start(when);
  oscillator.stop(when + 4.3);
}

function playPluck(context: BaseAudioContext, graph: MusicGraph, note: number, when: number) {
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(PLUCK_GAIN, when + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + 1.7);
  envelope.connect(graph.bus);
  envelope.connect(graph.delaySend);

  [
    { ratio: 1, level: 1 },
    { ratio: 2, level: 0.22 },
  ].forEach(({ ratio, level }) => {
    const oscillator = context.createOscillator();
    const partialGain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(midiToHz(note) * ratio, when);
    partialGain.gain.value = level;
    oscillator.connect(partialGain);
    partialGain.connect(envelope);
    oscillator.start(when);
    oscillator.stop(when + 1.75);
  });
}

export function scheduleMusicStep(context: BaseAudioContext, graph: MusicGraph, step: number, when: number) {
  const loopStep = step % MUSIC_LOOP_STEPS;
  const chord = PROGRESSION[Math.floor(loopStep / STEPS_PER_CHORD) % PROGRESSION.length];
  const withinChord = loopStep % STEPS_PER_CHORD;

  if (withinChord === 0) {
    chord.pad.forEach((note) => playPad(context, graph, note, when, STEPS_PER_CHORD * MUSIC_STEP_SECONDS));
  }
  if (loopStep % STEPS_PER_BAR === 0) {
    playBass(context, graph, chord.bass, when);
  }
  const arpPosition = ARP_STEPS.indexOf(withinChord);
  if (arpPosition >= 0) {
    playPluck(context, graph, chord.arp[ARP_NOTE_INDEX[arpPosition] % chord.arp.length], when);
  }
}

// ---------------------------------------------------------------------------
// Mute state (persisted, observable)
// ---------------------------------------------------------------------------

function readMutedPreference() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

let muted = readMutedPreference();
const muteListeners = new Set<() => void>();

export function isMusicMuted() {
  return muted;
}

export function subscribeMusicMuted(listener: () => void) {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}

export function setMusicMuted(nextMuted: boolean) {
  if (nextMuted === muted) return;
  muted = nextMuted;
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, nextMuted ? "1" : "0");
  } catch {
    // Keep the choice for this session even if browser storage is disabled.
  }
  muteListeners.forEach((listener) => listener());
  sync();
}

export function toggleMusicMuted() {
  setMusicMuted(!muted);
}

// ---------------------------------------------------------------------------
// Playback engine
// ---------------------------------------------------------------------------

let audioContext: AudioContext | null = null;
let graph: MusicGraph | null = null;
let schedulerTimer: number | null = null;
let teardownTimer: number | null = null;
let nextStepTime = 0;
let nextStep = 0;
let wantPlaying = false;
let stopFadeSeconds = DEFAULT_FADE_OUT_SECONDS;
let listenersArmed = false;
let unlockArmed = false;

function getContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
  try {
    if (!audioContext || audioContext.state === "closed") audioContext = new window.AudioContext();
    return audioContext;
  } catch {
    return null;
  }
}

function armUnlock() {
  if (unlockArmed || typeof window === "undefined") return;
  unlockArmed = true;
  const unlock = () => {
    unlockArmed = false;
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    sync();
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

function armListeners() {
  if (listenersArmed || typeof document === "undefined") return;
  listenersArmed = true;
  document.addEventListener("visibilitychange", sync);
}

function tick() {
  const context = audioContext;
  const activeGraph = graph;
  if (!context || !activeGraph) return;
  try {
    if (nextStepTime < context.currentTime - 0.25) nextStepTime = context.currentTime + 0.05;
    const horizon = context.currentTime + LOOKAHEAD_SECONDS;
    while (nextStepTime < horizon) {
      scheduleMusicStep(context, activeGraph, nextStep, nextStepTime);
      nextStep = (nextStep + 1) % MUSIC_LOOP_STEPS;
      nextStepTime += MUSIC_STEP_SECONDS;
    }
  } catch {
    // A missing audio device or blocked browser context must not affect the run.
  }
}

function rampMaster(target: number, seconds: number) {
  if (!audioContext || !graph) return;
  const now = audioContext.currentTime;
  const gain = graph.master.gain;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(gain.value, now);
  gain.linearRampToValueAtTime(target, now + Math.max(0.01, seconds));
}

function clearTeardown() {
  if (teardownTimer !== null) {
    window.clearTimeout(teardownTimer);
    teardownTimer = null;
  }
}

function begin() {
  const context = getContext();
  if (!context) return;
  clearTeardown();

  if (context.state !== "running") {
    armUnlock();
    void context.resume().then(sync).catch(() => undefined);
    return;
  }

  try {
    if (!graph) graph = createMusicGraph(context);
    rampMaster(MUSIC_LEVEL, FADE_IN_SECONDS);
    if (schedulerTimer === null) {
      nextStepTime = Math.max(nextStepTime, context.currentTime + 0.1);
      tick();
      schedulerTimer = window.setInterval(tick, SCHEDULER_INTERVAL_MS);
    }
  } catch {
    // Audio is a nicety; never let it break the game.
  }
}

function halt(fadeSeconds: number) {
  if (schedulerTimer !== null) {
    window.clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  const context = audioContext;
  const activeGraph = graph;
  if (!context || !activeGraph) return;
  if (teardownTimer !== null) return;

  try {
    rampMaster(0, fadeSeconds);
  } catch {
    // Ignore: the teardown below still silences the graph.
  }
  teardownTimer = window.setTimeout(() => {
    teardownTimer = null;
    try {
      activeGraph.master.disconnect();
      activeGraph.lfo.stop();
    } catch {
      // Already disconnected.
    }
    if (graph === activeGraph) graph = null;
    void context.suspend().catch(() => undefined);
  }, fadeSeconds * 1000 + 120);
}

function sync() {
  const pageHidden = typeof document !== "undefined" && document.hidden;
  if (wantPlaying && !muted && !pageHidden) {
    begin();
  } else {
    halt(wantPlaying ? QUICK_FADE_SECONDS : stopFadeSeconds);
  }
}

/** Begin the soundtrack for a run (fades in). Safe to call repeatedly. */
export function startMusic() {
  armListeners();
  if (!wantPlaying) nextStep = 0;
  wantPlaying = true;
  sync();
}

/** Fade the soundtrack out, e.g. when a run ends or the game view closes. */
export function stopMusic(fadeSeconds = DEFAULT_FADE_OUT_SECONDS) {
  wantPlaying = false;
  stopFadeSeconds = fadeSeconds;
  sync();
}
