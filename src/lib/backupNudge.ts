// Reminds you to save a backup, because all data lives only on this phone.
// The decision is a pure function (easy to test); the rest reads and writes localStorage.

const LAST_KEY = 'habitflow:last-backup';
const SEEN_KEY = 'habitflow:first-seen';
const DISMISS_KEY = 'habitflow:backup-nudge-dismissed';

const DAY = 24 * 60 * 60 * 1000;
export const STALE_AFTER_DAYS = 7; // last backup older than this -> remind
export const NEVER_AFTER_DAYS = 3; // no backup yet, app in use this long -> remind
export const DISMISS_DAYS = 2; // after "Dismiss", stay quiet for this long

export type Nudge = null | { kind: 'never' | 'stale'; days: number };

export type NudgeInput = {
  now: number; // ms since epoch
  lastBackup: string | null; // ISO time of the last saved backup
  firstSeen: string | null; // ISO time the app was first opened with this feature
  dismissedAt: string | null; // ISO time of the last "Dismiss"
  hasEntries: boolean;
};

function ageDays(now: number, iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY));
}

export function decideNudge(i: NudgeInput): Nudge {
  if (!i.hasEntries) return null; // nothing worth saving yet
  const dismissed = ageDays(i.now, i.dismissedAt);
  if (dismissed !== null && dismissed < DISMISS_DAYS) return null;

  const last = ageDays(i.now, i.lastBackup);
  if (last !== null) {
    return last >= STALE_AFTER_DAYS ? { kind: 'stale', days: last } : null;
  }
  const seen = ageDays(i.now, i.firstSeen);
  if (seen !== null && seen >= NEVER_AFTER_DAYS) return { kind: 'never', days: seen };
  return null;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Call once when the app starts: remembers the first time the app was opened. */
export function noteFirstSeen(now: number = Date.now()): void {
  if (!read(SEEN_KEY)) write(SEEN_KEY, new Date(now).toISOString());
}

export function markBackupSaved(now: number = Date.now()): void {
  write(LAST_KEY, new Date(now).toISOString());
}

export function dismissNudge(now: number = Date.now()): void {
  write(DISMISS_KEY, new Date(now).toISOString());
}

export function getNudge(hasEntries: boolean, now: number = Date.now()): Nudge {
  return decideNudge({
    now,
    lastBackup: read(LAST_KEY),
    firstSeen: read(SEEN_KEY),
    dismissedAt: read(DISMISS_KEY),
    hasEntries,
  });
}
