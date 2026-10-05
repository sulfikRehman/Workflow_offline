// Pomodoro schedule: focus, short break, focus, short break ... then a long break, and again.
// Everything is worked out from the active time that has passed, so it stays correct even if the
// phone slows the page down in the background.

export type PomodoroConfig = {
  focus: number; // minutes
  short: number; // minutes
  long: number; // minutes
  /** Focus sessions before the long break. */
  sessions: number;
};

export type SegmentKind = 'focus' | 'short' | 'long';

export const DEFAULT_POMODORO: PomodoroConfig = { focus: 25, short: 5, long: 15, sessions: 4 };

const clampInt = (n: number, lo: number, hi: number, fallback: number): number =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;

/** Keeps every setting inside a sensible range. */
export function cleanConfig(c: Partial<PomodoroConfig>): PomodoroConfig {
  const d = DEFAULT_POMODORO;
  return {
    focus: clampInt(c.focus ?? d.focus, 1, 180, d.focus),
    short: clampInt(c.short ?? d.short, 1, 60, d.short),
    long: clampInt(c.long ?? d.long, 1, 120, d.long),
    sessions: clampInt(c.sessions ?? d.sessions, 1, 12, d.sessions),
  };
}

/** The kind and length (in ms) of the segment at a position in one round. */
function segmentAtPosition(c: PomodoroConfig, pos: number): { kind: SegmentKind; ms: number } {
  if (pos % 2 === 0) return { kind: 'focus', ms: c.focus * 60000 };
  return pos === 2 * c.sessions - 1
    ? { kind: 'long', ms: c.long * 60000 }
    : { kind: 'short', ms: c.short * 60000 };
}

/** Length of one full round (all focus sessions, short breaks and the long break), in ms. */
export function roundMs(c: PomodoroConfig): number {
  return (c.sessions * c.focus + (c.sessions - 1) * c.short + c.long) * 60000;
}

export type Where = {
  /** Number of segments finished so far; changes exactly when a new segment begins. */
  index: number;
  kind: SegmentKind;
  /** Length of the current segment, ms. */
  lengthMs: number;
  /** Time left in the current segment, ms. */
  leftMs: number;
  /** Which focus session of the round this is (1-based); during a break, the one just finished. */
  session: number;
  /** Total focus time that has passed (including part of the current focus segment), ms. */
  focusMs: number;
};

/** Where in the schedule we are after `elapsedMs` of active time. */
export function locate(c: PomodoroConfig, elapsedMs: number): Where {
  const e = Math.max(0, elapsedMs);
  const round = roundMs(c);
  const rounds = Math.floor(e / round);
  let rest = e - rounds * round;
  const perRoundFocus = c.sessions * c.focus * 60000;
  let focusMs = rounds * perRoundFocus;
  const perRoundSegments = 2 * c.sessions;
  for (let pos = 0; pos < perRoundSegments; pos++) {
    const seg = segmentAtPosition(c, pos);
    if (rest < seg.ms) {
      if (seg.kind === 'focus') focusMs += rest;
      return {
        index: rounds * perRoundSegments + pos,
        kind: seg.kind,
        lengthMs: seg.ms,
        leftMs: seg.ms - rest,
        session: Math.floor(pos / 2) + 1,
        focusMs,
      };
    }
    rest -= seg.ms;
    if (seg.kind === 'focus') focusMs += seg.ms;
  }
  // Only reachable through rounding at the very end of a round: start the next round.
  return locate(c, (rounds + 1) * round);
}
