// Groundwork for syncing between devices (1.11). Nothing here talks to a server: it is the part that
// decides what the combined data looks like when two copies of it meet. Pure functions, easy to test.
//
// The rules, in plain words:
//  - Every habit, check-in, note and rest day carries a "last changed" time (updated_at).
//  - When the same item exists in both copies, the one changed last wins ("newest wins"). The whole item
//    wins, not single fields: if one phone renames a habit and the PC recolours it, one of the two edits stays.
//  - A deletion leaves a small marker (a "tombstone") with the time of the deletion. Without it the other
//    copy would simply send the deleted item back. A change made AFTER the deletion brings the item back.
//  - Deleting a habit also removes its check-ins, notes and rest days (anything changed before the deletion).
//    mergeData keeps the bookkeeping needed for that; visibleData then hides what belongs to a deleted habit.
//  - A device with a wrong clock cannot win forever: times in the future are treated as "now" at merge time,
//    and that corrected time is what gets kept.
//  - Same result whichever copy is "A" and which is "B", and merging the same data twice changes nothing.
import type { DB, Habit, HabitEntry, HabitNote, HabitSkip, Tombstone } from './store.ts';

/** The time given to data from before syncing existed, and to the sample habits of a brand-new install. */
export const EPOCH = '1970-01-01T00:00:00.000Z';
/** How long a deletion marker is kept. A device that stays offline longer than this could bring deleted items back. */
export const TOMBSTONE_DAYS = 365;
/** Times further ahead than this (in minutes) are treated as a clock mistake. */
export const FUTURE_SLACK_MIN = 5;

type Kind = Tombstone['kind'];

const keyOf = {
  habit: (h: Habit) => h.id,
  entry: (e: HabitEntry) => `${e.habit_id}|${e.date}`,
  note: (n: HabitNote) => `${n.habit_id}|${n.date}`,
  skip: (s: HabitSkip) => `${s.habit_id}|${s.date}`,
};

/** The time as a number, or 0 if it is missing or unreadable. */
function ms(t: string | undefined): number {
  if (!t) return 0;
  const n = Date.parse(t);
  return Number.isFinite(n) ? n : 0;
}

/** The sample habits of a new install have fixed IDs, so two new devices end up with the same ones instead of two sets. */
export const SEED_ID_PREFIX = 'seed-';

type Live<T> = { item: T; t: number };

/** Content order used only to break exact ties, so both devices pick the same winner. */
const canon = (v: unknown) => JSON.stringify(v);

/**
 * For one kind of item: the newest version of each item, and the latest deletion time seen for it ("floor").
 * An item only counts if it is newer than its floor (so a deletion at the very same moment wins).
 * Keeping the floor even when a newer item beats it is what makes the result independent of the order
 * in which copies are merged.
 */
function resolve<T extends { updated_at?: string }>(
  lists: T[][],
  tombs: Tombstone[][],
  kind: Kind,
  key: (x: T) => string,
  now: number
): { items: Map<string, Live<T>>; floor: Map<string, number> } {
  const best = new Map<string, Live<T>>();
  for (const list of lists) {
    for (const item of list) {
      const t = Math.min(ms(item.updated_at), now);
      const k = key(item);
      const cur = best.get(k);
      if (!cur || t > cur.t || (t === cur.t && canon(item) > canon(cur.item))) best.set(k, { item, t });
    }
  }
  const floor = new Map<string, number>();
  for (const list of tombs) {
    for (const d of list) {
      if (d.kind !== kind) continue;
      const t = Math.min(ms(d.at), now);
      if (t > (floor.get(d.key) ?? -1)) floor.set(d.key, t);
    }
  }
  const items = new Map<string, Live<T>>();
  for (const [k, v] of best) {
    const f = floor.get(k);
    if (f === undefined || v.t > f) items.set(k, v);
  }
  return { items, floor };
}

const iso = (t: number) => new Date(t).toISOString();

/**
 * Combines two copies of the data into one. Neither input is changed.
 * `now` is only used to keep wrong clocks and old deletion markers in check; pass the same value to get
 * the same result (the tests do).
 */
export function mergeData(a: DB, b: DB, now: number = Date.now()): DB {
  const tombs = [a.deleted, b.deleted];
  const H = resolve([a.habits, b.habits], tombs, 'habit', keyOf.habit, now);
  const E = resolve([a.entries, b.entries], tombs, 'entry', keyOf.entry, now);
  const N = resolve([a.notes, b.notes], tombs, 'note', keyOf.note, now);
  const S = resolve([a.skips, b.skips], tombs, 'skip', keyOf.skip, now);

  const stamped = <T extends { updated_at?: string }>(m: Map<string, Live<T>>, keep: (x: T, t: number) => boolean = () => true): T[] =>
    [...m.entries()]
      .filter(([, v]) => keep(v.item, v.t))
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
      .map(([, v]) => ({ ...v.item, updated_at: iso(v.t) }));

  const habits = stamped(H.items).sort(
    (x, y) => x.sort_order - y.sort_order || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
  );
  // Something changed before its habit was deleted went with the habit. Something changed after stays (as
  // far as this function is concerned): the habit might still be brought back by a third copy, and the result
  // must not depend on the order copies are merged in. visibleData() is what hides the leftovers.
  const survives = (habit_id: string, t: number) => {
    const f = H.floor.get(habit_id);
    return f === undefined || t > f;
  };
  const entries = stamped(E.items, (e, t) => survives(e.habit_id, t));
  const notes = stamped(N.items, (n, t) => survives(n.habit_id, t));
  const skips = stamped(S.items, (k, t) => survives(k.habit_id, t));

  const cutoff = now - TOMBSTONE_DAYS * 86_400_000;
  const deleted: Tombstone[] = [];
  const addTombs = (kind: Kind, m: Map<string, number>) => {
    for (const [key, t] of m) if (t >= cutoff) deleted.push({ kind, key, at: iso(t) });
  };
  // Every deletion time is kept (also where a newer item has since beaten it): see resolve().
  addTombs('habit', H.floor);
  addTombs('entry', E.floor);
  addTombs('note', N.floor);
  addTombs('skip', S.floor);
  deleted.sort((x, y) => (x.kind + x.key < y.kind + y.key ? -1 : x.kind + x.key > y.kind + y.key ? 1 : 0));

  return { habits, entries, notes, skips, deleted };
}

/** What the app should show and keep: merged data without the leftovers of habits that are gone. */
export function visibleData(db: DB): DB {
  const alive = new Set(db.habits.map((h) => h.id));
  return {
    habits: db.habits,
    entries: db.entries.filter((e) => alive.has(e.habit_id)),
    notes: db.notes.filter((n) => alive.has(n.habit_id)),
    skips: db.skips.filter((k) => alive.has(k.habit_id)),
    deleted: db.deleted,
  };
}

/**
 * True for a device nobody has used yet: only the sample habits, never edited, no history.
 * On the first sync such a device should simply take the other device's data instead of merging with it.
 */
export function isUntouched(db: DB): boolean {
  return (
    db.entries.length === 0 &&
    db.notes.length === 0 &&
    db.skips.length === 0 &&
    db.deleted.length === 0 &&
    db.habits.every((h) => h.id.startsWith(SEED_ID_PREFIX) && ms(h.updated_at) === 0)
  );
}
