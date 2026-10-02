/** Format milliseconds as m:ss (or h:mm:ss), rounding up so 0:00 only shows at the very end. */
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * Given the elapsed time at which the last break reminder was due (`next`), the interval between
 * reminders, the time elapsed now, and the total length, return the next reminder time.
 * Skips any reminders that were missed (e.g. if the phone throttled the page in the background).
 * Returns Infinity when no further reminder fits before the end.
 */
export function nextBreakAfter(
  next: number,
  step: number,
  elapsed: number,
  total: number
): number {
  if (!(step > 0)) return Infinity;
  let n = next;
  while (n <= elapsed) n += step;
  return n >= total ? Infinity : n;
}
