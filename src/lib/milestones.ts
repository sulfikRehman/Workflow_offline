// Streak milestones: a small "well done" the first time a habit reaches 7, 30 or 100 days.
export const MILESTONES = [7, 30, 100] as const;

const KEY = 'habitflow:milestones';

/**
 * If the streak just grew by one day onto a milestone, returns that milestone. Bigger jumps
 * (for example after restoring a backup or editing an old day) are ignored on purpose.
 */
export function crossedMilestone(prev: number, next: number): number | null {
  if (next !== prev + 1) return null;
  return (MILESTONES as readonly number[]).includes(next) ? next : null;
}

type Seen = Record<string, number>;

/** The highest milestone already celebrated for each habit. Unreadable data counts as nothing. */
export function readSeen(): Seen {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: Seen = {};
    for (const [id, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n === 'number' && Number.isFinite(n)) out[id] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/** True the first time this milestone is reached for the habit; remembers it so it is not repeated. */
export function claimMilestone(habitId: string, milestone: number): boolean {
  const seen = readSeen();
  if ((seen[habitId] ?? 0) >= milestone) return false;
  seen[habitId] = milestone;
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    /* storage blocked: may celebrate again next time, which is harmless */
  }
  return true;
}
