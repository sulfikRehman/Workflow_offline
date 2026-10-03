/** Pure helpers for the circular timer dial. One full turn of the dial = 60 minutes. */

export const MINUTES_PER_TURN = 60;
export const DIAL_MAX = 720; // 12 hours

/** Whole minutes, kept between 1 and DIAL_MAX. */
export function clampDuration(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(DIAL_MAX, Math.max(1, Math.round(n)));
}

/**
 * Angle in degrees clockwise from 12 o'clock, in [0, 360), for a point given relative to the
 * dial centre in screen coordinates (x to the right, y downwards).
 */
export function angleFromPoint(dx: number, dy: number): number {
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * New duration (whole minutes) when the pointer is at `angleDeg`. Of all the values that sit at
 * that angle (x, x + 60, x + 120, ...), it picks the one closest to the current duration, so
 * dragging clockwise past 12 o'clock adds a turn and dragging back removes it.
 */
export function durationFromAngle(current: number, angleDeg: number): number {
  const x = angleDeg / 6;
  const t = x + MINUTES_PER_TURN * Math.round((current - x) / MINUTES_PER_TURN);
  return clampDuration(t);
}

/**
 * Where a time sits on the dial face, in minutes from 12 o'clock (0..60). A time that is an exact
 * multiple of 60 shows as a full turn (60); zero or less shows as 0.
 */
export function faceMinutes(minutes: number): number {
  if (!(minutes > 0)) return 0;
  const m = minutes % MINUTES_PER_TURN;
  return m === 0 ? MINUTES_PER_TURN : m;
}

/**
 * Dial positions (minutes from 12 o'clock, 0..60) of the break reminders still to come that sit
 * in the same turn as the hand. Reminders fire at elapsed = every, 2*every, ... (before the end),
 * i.e. when the remaining time equals total - k*every. Reminders in other turns are left out,
 * because they would be ambiguous on a 60-minute face.
 */
export function breakMarks(
  totalMin: number,
  everyMin: number,
  remainingMin: number
): number[] {
  if (!(everyMin >= 1) || !(totalMin > everyMin) || !(remainingMin > 0)) return [];
  // The hand is in turn `turn`, i.e. remaining is in ((turn-1)*60, turn*60].
  const turnStart = (Math.ceil(remainingMin / MINUTES_PER_TURN) - 1) * MINUTES_PER_TURN;
  const out = new Set<number>();
  for (let e = everyMin; e < totalMin; e += everyMin) {
    const r = totalMin - e;
    // r === turnStart sits at 12 o'clock, where the hand arrives at the end of this turn.
    if (r < remainingMin && r >= turnStart) {
      out.add(faceMinutes(r));
    }
  }
  return [...out];
}
