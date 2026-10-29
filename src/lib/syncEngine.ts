// The part of syncing that decides WHAT is sent and received (1.12). It does not know about Firebase: it talks
// to a small "cloud" interface, so it can be tested with a pretend cloud and pretend devices.
//
// How the data is laid out in the cloud (each piece is one small document, so nothing ever gets too big):
//   h          every habit, plus the markers of deleted habits
//   e-2026-10  check-ins of October 2026, plus the markers of deleted check-ins of that month
//   n-2026-10  notes of that month (and their markers)
//   s-2026-10  rest days of that month (and their markers)
//
// One round of syncing ("syncOnce"):
//   1. read all pieces from the cloud                        (the only slow part: needs internet)
//   2. in one go, with nothing in between: merge with this device's data and save the result here
//   3. write back only the pieces that are different. Each write re-reads the piece and merges first, inside a
//      cloud "transaction", so two devices writing at the same moment cannot overwrite each other.
// Because merging is order-independent (see sync.ts), any mix of devices, rounds and interruptions ends up
// with the same data everywhere. A failed round changes nothing here and is simply tried again later.
import { isUntouched, mergeData, visibleData } from './sync.ts';
import type { DB, Tombstone } from './store.ts';

/** Bumped only if the layout above ever changes in a way older apps cannot read. */
export const CHUNK_VERSION = 1;

/** What the engine needs from the cloud. The Firebase version is in firebaseCloud.ts. */
export type CloudStore = {
  /** Every piece: its name and its text. Pieces that are not ours (like the "ping") may be left out. */
  list(): Promise<Record<string, string>>;
  /** Read-change-write one piece as one step. `change` gets the current text (or null) and returns the new text, or null for "leave it". */
  update(id: string, change: (current: string | null) => string | null): Promise<void>;
  /** Tell the other devices that something changed (they listen for this). */
  touch(): Promise<void>;
};

/** What the engine needs from this device. Matches getSyncData / adoptSyncData in store.ts. */
export type LocalPort = {
  read(): DB;
  adopt(db: DB): void;
};

export class SyncDataError extends Error {}

const EMPTY: DB = { habits: [], entries: [], notes: [], skips: [], deleted: [] };
const ID_RE = /^(h|[ens]-\d{4}-\d{2})$/;

const monthOf = (date: string) => date.slice(0, 7);
const dateOfKey = (key: string) => key.slice(key.lastIndexOf('|') + 1);
const blank = (): DB => ({ habits: [], entries: [], notes: [], skips: [], deleted: [] });

function tombId(d: Tombstone): string {
  return d.kind === 'habit' ? 'h' : `${d.kind[0]}-${monthOf(dateOfKey(d.key))}`;
}

/** Cuts the data into the pieces described at the top. Pieces with nothing in them do not exist. */
export function splitDB(db: DB): Map<string, DB> {
  const m = new Map<string, DB>();
  const get = (id: string) => {
    let c = m.get(id);
    if (!c) m.set(id, (c = blank()));
    return c;
  };
  for (const h of db.habits) get('h').habits.push(h);
  for (const e of db.entries) get(`e-${monthOf(e.date)}`).entries.push(e);
  for (const n of db.notes) get(`n-${monthOf(n.date)}`).notes.push(n);
  for (const k of db.skips) get(`s-${monthOf(k.date)}`).skips.push(k);
  for (const d of db.deleted) get(tombId(d)).deleted.push(d);
  for (const id of [...m.keys()]) if (!ID_RE.test(id)) m.delete(id); // a damaged date cannot make up a piece name
  return m;
}

function pieceText(c: DB): string {
  return JSON.stringify({ v: CHUNK_VERSION, habits: c.habits, entries: c.entries, notes: c.notes, skips: c.skips, deleted: c.deleted });
}

/** Reads one piece. Throws SyncDataError if it is damaged or from a newer app. */
export function parsePiece(text: string): DB {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new SyncDataError('The cloud copy is damaged, so nothing was changed.');
  }
  if (!o || typeof o !== 'object') throw new SyncDataError('The cloud copy is damaged, so nothing was changed.');
  if (typeof o.v === 'number' && o.v > CHUNK_VERSION) {
    throw new SyncDataError('The cloud copy was saved by a newer version of HabitFlow. Update this app first.');
  }
  const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
  const objects = (x: unknown[]) => x.filter((i) => !!i && typeof i === 'object');
  return {
    habits: objects(arr(o.habits)) as DB['habits'],
    entries: objects(arr(o.entries)) as DB['entries'],
    notes: objects(arr(o.notes)) as DB['notes'],
    skips: objects(arr(o.skips)) as DB['skips'],
    deleted: objects(arr(o.deleted)) as DB['deleted'],
  };
}

/** Puts all pieces back together. Pieces with names we do not know are ignored. */
export function joinPieces(texts: Record<string, string>): DB {
  const all = blank();
  for (const [id, text] of Object.entries(texts)) {
    if (!ID_RE.test(id)) continue;
    const p = parsePiece(text);
    all.habits.push(...p.habits);
    all.entries.push(...p.entries);
    all.notes.push(...p.notes);
    all.skips.push(...p.skips);
    all.deleted.push(...p.deleted);
  }
  return all;
}

const KIND_OF: Record<string, Tombstone['kind']> = { h: 'habit', e: 'entry', n: 'note', s: 'skip' };

/**
 * What a piece should contain once `ours` is added to what the cloud has. Pure and repeatable: if the cloud
 * already has everything, the text comes out identical to `current` (that is how "nothing to send" is noticed).
 * `habitTombs` lets leftover history of deleted habits be cleaned out of the cloud as well.
 */
export function mergePiece(current: string | null, ours: DB, id: string, habitTombs: Tombstone[], now: number): string {
  const theirs = current === null ? EMPTY : parsePiece(current);
  const withHabits = (d: DB): DB => ({ ...d, deleted: [...d.deleted, ...habitTombs] });
  const m = mergeData(withHabits(ours), withHabits(theirs), now);
  const c = id[0];
  return pieceText({
    habits: c === 'h' ? m.habits : [],
    entries: c === 'e' ? m.entries : [],
    notes: c === 'n' ? m.notes : [],
    skips: c === 's' ? m.skips : [],
    deleted: m.deleted.filter((d) => d.kind === KIND_OF[c]),
  });
}

function hasFutureTimes(db: DB, t: number): boolean {
  const late = (x: string | undefined) => !!x && Date.parse(x) > t;
  return (
    db.habits.some((i) => late(i.updated_at)) ||
    db.entries.some((i) => late(i.updated_at)) ||
    db.notes.some((i) => late(i.updated_at)) ||
    db.skips.some((i) => late(i.updated_at)) ||
    db.deleted.some((i) => late(i.at))
  );
}

export type SyncResult = {
  /** This device's data was changed by what the cloud had. */
  pulled: boolean;
  /** How many pieces were written to the cloud. */
  pushed: number;
  /** This device was brand new, so it simply took the cloud's data. */
  tookCloudData: boolean;
};

/** One round of syncing. Throws if it cannot finish (no internet, damaged cloud data, ...); nothing is then half-done on this device. */
export async function syncOnce(cloud: CloudStore, local: LocalPort, now: () => number = Date.now): Promise<SyncResult> {
  const texts = await cloud.list();
  const remote = joinPieces(texts);

  // From here to adopt() nothing waits, so an edit made while the cloud was being read cannot be lost.
  const t = now();
  const mine = local.read();
  const cloudHasData = remote.habits.length > 0 || remote.deleted.length > 0;
  const tookCloudData = cloudHasData && isUntouched(mine);
  const merged = visibleData(mergeData(tookCloudData ? EMPTY : mine, remote, t));
  // Times in the future (a clock that was wrong) are pulled back by the merge, so that counts as a change too.
  const unchanged = !hasFutureTimes(mine, t) && JSON.stringify(visibleData(mergeData(mine, EMPTY, t))) === JSON.stringify(merged);
  if (!unchanged) local.adopt(merged);

  const habitTombs = merged.deleted.filter((d) => d.kind === 'habit');
  let pushed = 0;
  const parts = splitDB(merged);
  // Pieces that only the cloud has are visited too: they may hold leftovers of deleted habits or markers that expired.
  for (const id of Object.keys(texts)) if (ID_RE.test(id) && !parts.has(id)) parts.set(id, blank());
  for (const [id, part] of parts) {
    const have = texts[id] ?? null;
    if (mergePiece(have, part, id, habitTombs, t) === have) continue;
    const outcome = { wrote: false };
    await cloud.update(id, (cur) => {
      const want = mergePiece(cur, part, id, habitTombs, t);
      outcome.wrote = want !== cur;
      return outcome.wrote ? want : null;
    });
    if (outcome.wrote) pushed++;
  }
  if (pushed > 0) await cloud.touch();
  return { pulled: !unchanged, pushed, tookCloudData };
}
