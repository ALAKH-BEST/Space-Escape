let audioContext: AudioContext | null = null;
let pendingChimes = 0;
let nextChimeTime = 0;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
  try {
    if (!audioContext || audioContext.state === "closed") audioContext = new window.AudioContext();
    return audioContext;
  } catch {
    return null;
  }
}

function scheduleChime(context: AudioContext) {
  try {
    const startAt = Math.max(context.currentTime + 0.015, nextChimeTime);
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((frequency, index) => {
      const noteStart = startAt + index * 0.075;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      envelope.gain.setValueAtTime(0.0001, noteStart);
      envelope.gain.exponentialRampToValueAtTime(0.055, noteStart + 0.02);
      envelope.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.36);
      oscillator.connect(envelope);
      envelope.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + 0.38);
    });

    nextChimeTime = startAt + 0.62;
  } catch {
    // A missing audio device or blocked browser context must not affect the run.
  }
}

function flushPendingChimes(context: AudioContext) {
  if (context.state !== "running") return;
  const count = pendingChimes;
  pendingChimes = 0;
  for (let index = 0; index < count; index += 1) scheduleChime(context);
}

export function unlockAchievementAudio() {
  const context = getAudioContext();
  if (!context || context.state === "running") {
    if (context) flushPendingChimes(context);
    return;
  }

  void context.resume()
    .then(() => flushPendingChimes(context))
    .catch(() => undefined);
}

export function playAchievementChime() {
  const context = getAudioContext();
  if (!context) return;

  if (context.state === "running") {
    scheduleChime(context);
    return;
  }

  pendingChimes = Math.min(pendingChimes + 1, 3);
  unlockAchievementAudio();
}
