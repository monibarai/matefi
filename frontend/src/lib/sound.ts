// Lightweight move/game sound effects, synthesized with the Web Audio API —
// no audio files to fetch or bundle. Respects a persisted mute preference.

const STORAGE_KEY = 'matefi:sound-enabled';

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!ctx) ctx = new AudioCtor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === 'true';
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, String(enabled));
}

export function toggleSound(): boolean {
  const next = !isSoundEnabled();
  setSoundEnabled(next);
  return next;
}

interface Tone {
  freq: number;
  /** seconds */
  duration: number;
  /** delay from the start of the sequence, in seconds */
  delay?: number;
  type?: OscillatorType;
}

function playTones(tones: Tone[], gain = 0.12): void {
  if (!isSoundEnabled()) return;
  const audio = getContext();
  if (!audio) return;

  for (const tone of tones) {
    const osc = audio.createOscillator();
    const gainNode = audio.createGain();
    osc.type = tone.type ?? 'sine';
    osc.frequency.value = tone.freq;

    const start = audio.currentTime + (tone.delay ?? 0);
    const end = start + tone.duration;

    gainNode.gain.setValueAtTime(0, start);
    gainNode.gain.linearRampToValueAtTime(gain, start + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gainNode);
    gainNode.connect(audio.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

/** A quiet, neutral click for a normal move. */
export function playMoveSound(): void {
  playTones([{ freq: 440, duration: 0.07, type: 'triangle' }]);
}

/** A slightly lower double-tap for a capture. */
export function playCaptureSound(): void {
  playTones([
    { freq: 330, duration: 0.06, type: 'square' },
    { freq: 220, duration: 0.08, delay: 0.05, type: 'square' },
  ], 0.1);
}

/** A rising two-note alert for check. */
export function playCheckSound(): void {
  playTones([
    { freq: 523.25, duration: 0.09, type: 'sawtooth' },
    { freq: 659.25, duration: 0.12, delay: 0.09, type: 'sawtooth' },
  ], 0.1);
}

/** A short descending run for checkmate / game over. */
export function playGameEndSound(): void {
  playTones([
    { freq: 659.25, duration: 0.12, type: 'sine' },
    { freq: 523.25, duration: 0.12, delay: 0.11, type: 'sine' },
    { freq: 392.0, duration: 0.22, delay: 0.22, type: 'sine' },
  ], 0.14);
}
