// Procedural space soundtrack for ASTRODODGE.
//
// The music is synthesized with the Web Audio API so it needs no audio files,
// loops seamlessly and adds nothing to the bundle. There are two tracks:
//   - "calm": slow evolving pads, a soft bass note and a sparse, echoing pluck
//     for the home screen and menus.
//   - "mission": a lighter, driving groove (soft pulse, bouncing bass and a
//     running arpeggio) that plays while a mission is in progress.
// Both are deliberately quiet so they sit underneath gameplay, the sound
// effects and the achievement chime.

const MUTE_STORAGE_KEY = "astrododge:music-muted:v1";
const VOLUME_STORAGE_KEY = "astrododge:audio-volume:v1";

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

export type MusicMode = "calm" | "mission";

// Mission track: 120 bpm eighth-note steps, four-second chords, 32-second loop.
export const MISSION_STEP_SECONDS = 0.25;
const MISSION_STEPS_PER_BAR = 8;
const MISSION_STEPS_PER_CHORD = 16;
export const MISSION_LOOP_STEPS = 128;
export const MISSION_LOOP_SECONDS = MISSION_LOOP_STEPS * MISSION_STEP_SECONDS;
const MISSION_PAD_GAIN = 0.034;
const MISSION_BASS_GAIN = 0.1;
const MISSION_KICK_GAIN = 0.15;
const MISSION_PLUCK_GAIN = 0.055;
const MODE_SWITCH_FADE_OUT_SECONDS = 0.9;
const MODE_SWITCH_FADE_IN_SECONDS = 1.2;

// Am9 - Fmaj7 - Cadd9 - Gadd6, then Dm9 - Fmaj7 - Cadd9 - Gadd6 (MIDI notes).
const MISSION_PROGRESSION: readonly Chord[] = [
  { bass: 33, pad: [57, 60, 64, 71], arp: [69, 72, 76, 79] },
  { bass: 29, pad: [53, 57, 60, 64], arp: [65, 69, 72, 76] },
  { bass: 36, pad: [55, 60, 64, 74], arp: [67, 72, 76, 79] },
  { bass: 31, pad: [55, 59, 62, 64], arp: [67, 71, 74, 79] },
  { bass: 26, pad: [53, 57, 60, 64], arp: [65, 69, 72, 74] },
  { bass: 29, pad: [53, 57, 60, 64], arp: [65, 69, 72, 76] },
  { bass: 36, pad: [55, 60, 64, 74], arp: [67, 72, 76, 79] },
  { bass: 31, pad: [55, 59, 62, 64], arp: [67, 71, 74, 79] },
];

// Bass pattern within each bar: [step, semitones above the chord root].
const MISSION_BASS_PATTERN: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [2, 0], [3, 12], [4, 0], [6, 0], [7, 7],
];
const MISSION_ARP_INDEX = [0, 1, 2, 3, 2, 1, 2, 3];

export type MusicGraph = {
  bus: GainNode;
  master: GainNode;
  delaySend: GainNode;
  lfo: OscillatorNode;
};

const MODE_STEP_SECONDS: Record<MusicMode, number> = {
  calm: MUSIC_STEP_SECONDS,
  mission: MISSION_STEP_SECONDS,
};
const MODE_LOOP_STEPS: Record<MusicMode, number> = {
  calm: MUSIC_LOOP_STEPS,
  mission: MISSION_LOOP_STEPS,
};

function midiToHz(note: number) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export function createMusicGraph(context: BaseAudioContext, mode: MusicMode = "calm"): MusicGraph {
  const mission = mode === "mission";
  const stepSeconds = MODE_STEP_SECONDS[mode];
  const bus = context.createGain();
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = mission ? 2600 : 1500;
  filter.Q.value = mission ? 0.5 : 0.4;
  const master = context.createGain();
  master.gain.value = 0;

  bus.connect(filter);
  filter.connect(master);
  master.connect(context.destination);

  // A slow sweep of the filter keeps the pads gently moving.
  const lfo = context.createOscillator();
  const lfoDepth = context.createGain();
  lfo.type = "sine";
  lfo.frequency.value = mission ? 0.08 : 0.045;
  lfoDepth.gain.value = mission ? 500 : 320;
  lfo.connect(lfoDepth);
  lfoDepth.connect(filter.frequency);
  lfo.start();

  // Soft dotted echo for the plucks.
  const delaySend = context.createGain();
  delaySend.gain.value = 0.55;
  const delay = context.createDelay(2);
  delay.delayTime.value = stepSeconds * 1.5;
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

function playPad(
  context: BaseAudioContext,
  graph: MusicGraph,
  note: number,
  when: number,
  hold: number,
  options: { attack?: number; release?: number; gain?: number } = {},
) {
  const attack = options.attack ?? 2.2;
  const release = options.release ?? 2.4;
  const padGain = options.gain ?? PAD_GAIN;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(padGain, when + attack);
  envelope.gain.setValueAtTime(padGain, when + hold);
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

// A soft, low "heartbeat" pulse rather than a hard kick drum.
function playPulse(context: BaseAudioContext, graph: MusicGraph, when: number) {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(115, when);
  oscillator.frequency.exponentialRampToValueAtTime(46, when + 0.14);
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(MISSION_KICK_GAIN, when + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + 0.26);
  oscillator.connect(envelope);
  envelope.connect(graph.bus);
  oscillator.start(when);
  oscillator.stop(when + 0.3);
}

function playMissionBass(context: BaseAudioContext, graph: MusicGraph, note: number, when: number) {
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(MISSION_BASS_GAIN, when + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
  envelope.connect(graph.bus);

  [
    { type: "sine" as OscillatorType, level: 1 },
    { type: "triangle" as OscillatorType, level: 0.35 },
  ].forEach(({ type, level }) => {
    const oscillator = context.createOscillator();
    const voiceGain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(midiToHz(note), when);
    voiceGain.gain.value = level;
    oscillator.connect(voiceGain);
    voiceGain.connect(envelope);
    oscillator.start(when);
    oscillator.stop(when + 0.34);
  });
}

function playMissionPluck(context: BaseAudioContext, graph: MusicGraph, note: number, when: number, level: number) {
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(MISSION_PLUCK_GAIN * level, when + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
  envelope.connect(graph.bus);
  envelope.connect(graph.delaySend);

  [
    { type: "triangle" as OscillatorType, ratio: 1, level: 1 },
    { type: "sine" as OscillatorType, ratio: 2, level: 0.2 },
  ].forEach(({ type, ratio, level: partial }) => {
    const oscillator = context.createOscillator();
    const partialGain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(midiToHz(note) * ratio, when);
    partialGain.gain.value = partial;
    oscillator.connect(partialGain);
    partialGain.connect(envelope);
    oscillator.start(when);
    oscillator.stop(when + 0.55);
  });
}

function scheduleMissionStep(context: BaseAudioContext, graph: MusicGraph, step: number, when: number) {
  const loopStep = step % MISSION_LOOP_STEPS;
  const chord = MISSION_PROGRESSION[Math.floor(loopStep / MISSION_STEPS_PER_CHORD) % MISSION_PROGRESSION.length];
  const withinChord = loopStep % MISSION_STEPS_PER_CHORD;
  const withinBar = loopStep % MISSION_STEPS_PER_BAR;

  if (withinChord === 0) {
    chord.pad.forEach((note) =>
      playPad(context, graph, note, when, MISSION_STEPS_PER_CHORD * MISSION_STEP_SECONDS, {
        attack: 1,
        release: 1.6,
        gain: MISSION_PAD_GAIN,
      }),
    );
  }
  if (withinBar === 0 || withinBar === 4) {
    playPulse(context, graph, when);
  }
  MISSION_BASS_PATTERN.forEach(([patternStep, semitones]) => {
    if (patternStep === withinBar) playMissionBass(context, graph, chord.bass + semitones, when);
  });
  playMissionPluck(
    context,
    graph,
    chord.arp[MISSION_ARP_INDEX[withinBar] % chord.arp.length],
    when,
    withinBar % 2 === 0 ? 1 : 0.7,
  );
}

export function scheduleMusicStep(
  context: BaseAudioContext,
  graph: MusicGraph,
  step: number,
  when: number,
  mode: MusicMode = "calm",
) {
  if (mode === "mission") {
    scheduleMissionStep(context, graph, step, when);
    return;
  }
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

function readVolumePreference() {
  if (typeof window === "undefined") return 1;
  try {
    const stored = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    if (stored === null) return 1;
    const value = Number(stored);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  } catch {
    return 1;
  }
}

let muted = readMutedPreference();
// Set by a host page (a game portal) that mutes the game; kept apart from the player's own saved choice.
let externalMuted = false;
let volume = readVolumePreference();
const muteListeners = new Set<() => void>();

export function isMusicMuted() {
  return muted || externalMuted;
}

/** Lets a host page mute and unmute the game without touching the player's saved mute setting. */
export function setExternalMuted(next: boolean) {
  if (next === externalMuted) return;
  externalMuted = next;
  muteListeners.forEach((listener) => listener());
  sync();
}

export function subscribeMusicMuted(listener: () => void) {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}

/** The player's volume setting from 0 (silent) to 1 (full, the default). */
export function getAudioVolume() {
  return volume;
}

export const subscribeAudioVolume = subscribeMusicMuted;

// Perceived loudness is roughly logarithmic, so the slider position is squared
// to give an even-feeling range. At full volume this is exactly 1.
function volumeToGain(level: number) {
  return level * level;
}

/** Multiplier for the music: the volume setting (mute is handled by stopping playback). */
export function getMusicVolumeGain() {
  return volumeToGain(volume);
}

/** Multiplier for sound effects: 0 when muted, otherwise the volume setting. */
export function getAudioGain() {
  return muted || externalMuted ? 0 : volumeToGain(volume);
}

export function setAudioVolume(nextVolume: number) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(nextVolume) ? nextVolume : 1));
  if (clamped === volume) return;
  volume = clamped;
  try {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
  } catch {
    // Keep the choice for this session even if browser storage is disabled.
  }
  muteListeners.forEach((listener) => listener());
  sync();
  if (graph && schedulerTimer !== null) {
    try {
      rampMaster(MUSIC_LEVEL * getMusicVolumeGain(), 0.08);
    } catch {
      // Ignore: the next sync re-applies the level.
    }
  }
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
let graphMode: MusicMode = "calm";
let musicMode: MusicMode = "calm";
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
    const stepSeconds = MODE_STEP_SECONDS[graphMode];
    const loopSteps = MODE_LOOP_STEPS[graphMode];
    while (nextStepTime < horizon) {
      scheduleMusicStep(context, activeGraph, nextStep, nextStepTime, graphMode);
      nextStep = (nextStep + 1) % loopSteps;
      nextStepTime += stepSeconds;
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
    if (graph && graphMode !== musicMode) {
      // A mode change arrived while playback was paused (muted, hidden tab...).
      retireGraph(graph, QUICK_FADE_SECONDS);
      graph = null;
    }
    if (!graph) {
      if (graphMode !== musicMode) {
        graphMode = musicMode;
        nextStep = 0;
        nextStepTime = context.currentTime + 0.1;
      }
      graph = createMusicGraph(context, musicMode);
    }
    rampMaster(MUSIC_LEVEL * getMusicVolumeGain(), FADE_IN_SECONDS);
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

// Fade an old graph out and free it, without touching the audio context.
function retireGraph(old: MusicGraph, fadeSeconds: number) {
  const context = audioContext;
  try {
    if (context) {
      const now = context.currentTime;
      old.master.gain.cancelScheduledValues(now);
      old.master.gain.setValueAtTime(old.master.gain.value, now);
      old.master.gain.linearRampToValueAtTime(0, now + Math.max(0.01, fadeSeconds));
    }
  } catch {
    // Ignore: the teardown below still silences the graph.
  }
  window.setTimeout(() => {
    try {
      old.master.disconnect();
      old.lfo.stop();
    } catch {
      // Already disconnected.
    }
  }, fadeSeconds * 1000 + 150);
}

/**
 * Choose which track plays: "calm" for the home screen and menus, "mission"
 * while a mission is in progress. If music is playing, the two crossfade;
 * otherwise the choice is applied the next time playback starts.
 */
export function setMusicMode(nextMode: MusicMode) {
  if (nextMode === musicMode) return;
  musicMode = nextMode;
  const context = audioContext;
  if (!context || !graph || schedulerTimer === null) return;
  try {
    retireGraph(graph, MODE_SWITCH_FADE_OUT_SECONDS);
    graph = createMusicGraph(context, nextMode);
    graphMode = nextMode;
    nextStep = 0;
    nextStepTime = context.currentTime + 0.1;
    rampMaster(MUSIC_LEVEL * getMusicVolumeGain(), MODE_SWITCH_FADE_IN_SECONDS);
    tick();
  } catch {
    // Audio is a nicety; never let it break the game.
  }
}

export function getMusicMode() {
  return musicMode;
}

function sync() {
  const pageHidden = typeof document !== "undefined" && document.hidden;
  if (wantPlaying && !muted && !externalMuted && volume > 0 && !pageHidden) {
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
