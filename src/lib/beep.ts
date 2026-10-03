// Beeps are generated with the Web Audio API, so no sound files are needed (works offline).

let ctx: AudioContext | null = null;

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Call from a tap/click handler. Browsers only allow sound after a user gesture. */
export function unlockAudio(): void {
  const AC = window.AudioContext || (window as AudioWindow).webkitAudioContext;
  if (!AC) return;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') void ctx.resume();
}

export function beep(frequency = 880, durationMs = 400): void {
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + durationMs / 1000 + 0.05);
}
