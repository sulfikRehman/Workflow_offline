// Local-first storage: all data lives on this device (localStorage). No server, no account.
import { todayISO } from './date.ts';
import { HABIT_COLORS, isHexColor } from './colors.ts';
import { EPOCH, SEED_ID_PREFIX, TOMBSTONE_DAYS, visibleData } from './sync.ts';

export type Habit = {
  id: string;
  name: string;
  icon: string;
  unit: string;
  target_value: number;
  color: string;
  sort_order: number;
  created_at: string;
  /** When this habit was last changed (ISO time). Used to decide which copy wins when devices sync. */
  updated_at?: string;
  /** Days of the week the habit is scheduled (0 = Sunday ... 6 = Saturday). Missing = every day. */
  days?: number[];
  /** Archived habits are hidden from the main list and stats but keep their history. */
  archived?: boolean;
  /**
   * A long-term goal: reach the daily target on `days` different days, counting from `start`
   * (the day the goal was set).
   */
  goal?: { days: number; start: string };
};

export type HabitEntry = {
  id: string;
  habit_id: string;
  date: string; // YYYY-MM-DD
  value: number;
  created_at: string;
  /** When this check-in was last changed. */
  updated_at?: string;
};

/** A short note about one habit on one day (for example why a day was skipped). */
export type HabitNote = {
  habit_id: string;
  date: string; // YYYY-MM-DD
  text: string;
  /** When this note was last changed. */
  updated_at?: string;
};

/** A day marked as a rest day for one habit: it does not count for or against the streak. */
export type HabitSkip = {
  habit_id: string;
  date: string; // YYYY-MM-DD
  /** When this rest day was last set. */
  updated_at?: string;
};

/**
 * A marker that something was deleted on purpose (and when), so another device does not send it back.
 * `key` is the habit's id, or "habitId|YYYY-MM-DD" for a check-in, note or rest day.
 */
export type Tombstone = { kind: 'habit' | 'entry' | 'note' | 'skip'; key: string; at: string };

export const NOTE_MAX = 200;
export const GOAL_MAX = 10000;

export type DB = {
  habits: Habit[];
  entries: HabitEntry[];
  notes: HabitNote[];
  skips: HabitSkip[];
  deleted: Tombstone[];
};

const KEY = 'habitflow:v1';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let lastStamp = 0;
/**
 * The time to put on a change. Always later than the previous one from this device, even if the phone's
 * clock stands still or jumps back, so two quick edits can never tie or swap places.
 */
function stamp(): string {
  const t = Math.max(Date.now(), lastStamp + 1);
  lastStamp = t;
  return new Date(t).toISOString();
}

/** After loading: never stamp earlier than something this device already stamped (a clock that went backwards). */
function seedStamp(db: DB): void {
  const limit = Date.now() + 24 * 3_600_000; // a clock that went back up to a day is allowed for; anything further ahead is a mistake
  for (const list of [db.habits, db.entries, db.notes, db.skips] as { updated_at?: string }[][]) {
    for (const x of list) {
      const t = Date.parse(x.updated_at ?? '');
      if (Number.isFinite(t) && t <= limit && t > lastStamp) lastStamp = t;
    }
  }
}

const KEEP_TOMBSTONES_MS = TOMBSTONE_DAYS * 86_400_000;

/** Adds a deletion marker (replacing an older one for the same thing) and drops markers too old to matter. */
function withTombstone(deleted: Tombstone[], kind: Tombstone['kind'], key: string, at: string): Tombstone[] {
  const cutoff = Date.now() - KEEP_TOMBSTONES_MS;
  return [
    ...deleted.filter((d) => !(d.kind === kind && d.key === key) && Date.parse(d.at) >= cutoff),
    { kind, key, at },
  ];
}

/** Something was (re)created: any older deletion marker for it is no longer needed. */
function withoutTombstone(deleted: Tombstone[], kind: Tombstone['kind'], key: string): Tombstone[] {
  return deleted.some((d) => d.kind === kind && d.key === key)
    ? deleted.filter((d) => !(d.kind === kind && d.key === key))
    : deleted;
}

function seed(): DB {
  const now = new Date().toISOString();
  const defaults: [string, string, string, number, string][] = [
    ['Study', 'BookOpen', 'min', 120, '#22c55e'],
    ['Workout', 'Dumbbell', 'min', 45, '#10b981'],
    ['Reading', 'BookMarked', 'pages', 30, '#84cc16'],
    ['Meal', 'UtensilsCrossed', 'meals', 3, '#16a34a'],
    ['Sleep', 'Moon', 'hrs', 8, '#4ade80'],
  ];
  return {
    habits: defaults.map(([name, icon, unit, target_value, color], i) => ({
      // Fixed IDs and the oldest possible "last changed" time: two new devices get the same sample habits
      // (not two sets), and anything you do with them later always counts as newer.
      id: `${SEED_ID_PREFIX}${name.toLowerCase()}`,
      updated_at: EPOCH,
      name,
      icon,
      unit,
      target_value,
      color,
      sort_order: i + 1,
      created_at: now,
    })),
    entries: [],
    notes: [],
    skips: [],
    deleted: [],
  };
}

function isGoal(g: unknown): boolean {
  const x = g as { days?: unknown; start?: unknown };
  return (
    !!x &&
    typeof x.days === 'number' &&
    Number.isInteger(x.days) &&
    x.days >= 1 &&
    x.days <= GOAL_MAX &&
    typeof x.start === 'string' &&
    DATE_RE.test(x.start)
  );
}

function isHabit(h: unknown): h is Habit {
  const x = h as Habit;
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.name === 'string' &&
    typeof x.icon === 'string' &&
    typeof x.unit === 'string' &&
    typeof x.target_value === 'number' &&
    x.target_value > 0 &&
    typeof x.color === 'string' &&
    typeof x.sort_order === 'number' &&
    typeof x.created_at === 'string' &&
    (x.days === undefined ||
      (Array.isArray(x.days) &&
        x.days.length >= 1 &&
        x.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) &&
    (x.archived === undefined || typeof x.archived === 'boolean') &&
    (x.goal === undefined || isGoal(x.goal))
  );
}

/**
 * Cleans a list of weekdays: removes duplicates and invalid values and sorts it.
 * Returns undefined (meaning "every day") for an empty list or all seven days.
 */
export function normalizeDays(days?: number[]): number[] | undefined {
  if (!days) return undefined;
  const set = [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
    (a, b) => a - b
  );
  return set.length === 0 || set.length === 7 ? undefined : set;
}

function isEntry(e: unknown): e is HabitEntry {
  const x = e as HabitEntry;
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.habit_id === 'string' &&
    typeof x.date === 'string' &&
    DATE_RE.test(x.date) &&
    typeof x.value === 'number' &&
    typeof x.created_at === 'string'
  );
}

function isNote(n: unknown): n is HabitNote {
  const x = n as HabitNote;
  return (
    !!x &&
    typeof x.habit_id === 'string' &&
    typeof x.date === 'string' &&
    DATE_RE.test(x.date) &&
    typeof x.text === 'string' &&
    x.text.length > 0 &&
    x.text.length <= NOTE_MAX
  );
}

function isSkip(n: unknown): n is HabitSkip {
  const x = n as HabitSkip;
  return !!x && typeof x.habit_id === 'string' && typeof x.date === 'string' && DATE_RE.test(x.date);
}

function validate(data: unknown): DB {
  const d = data as DB;
  if (!d || !Array.isArray(d.habits) || !Array.isArray(d.entries)) {
    throw new Error('Invalid data');
  }
  if (!d.habits.every(isHabit) || !d.entries.every(isEntry)) {
    throw new Error('Invalid data');
  }
  const ids = new Set(d.habits.map((h) => h.id));
  if (!d.entries.every((e) => ids.has(e.habit_id))) {
    throw new Error('Invalid data');
  }
  // Notes were added later: older data and backups have none.
  const notes = (d as { notes?: unknown }).notes ?? [];
  if (!Array.isArray(notes) || !notes.every(isNote) || !notes.every((n) => ids.has(n.habit_id))) {
    throw new Error('Invalid data');
  }
  // Rest days were added later too.
  const skips = (d as { skips?: unknown }).skips ?? [];
  if (!Array.isArray(skips) || !skips.every(isSkip) || !skips.every((n) => ids.has(n.habit_id))) {
    throw new Error('Invalid data');
  }
  // Deletion markers were added with syncing (1.11): older data has none. They are bookkeeping, so a damaged one is dropped, not fatal.
  const deleted = (d as { deleted?: unknown }).deleted;
  const tombs = Array.isArray(deleted) ? deleted.filter(isTombstone) : [];
  return withTimes({ habits: d.habits, entries: d.entries, notes, skips, deleted: tombs });
}

function isTombstone(t: unknown): t is Tombstone {
  const x = t as Tombstone;
  return (
    !!x &&
    (x.kind === 'habit' || x.kind === 'entry' || x.kind === 'note' || x.kind === 'skip') &&
    typeof x.key === 'string' &&
    x.key.length > 0 &&
    typeof x.at === 'string' &&
    !Number.isNaN(Date.parse(x.at))
  );
}

const validTime = (t: unknown): t is string => typeof t === 'string' && !Number.isNaN(Date.parse(t));

/**
 * Data from before syncing has no "last changed" times. Give each item one: the day it was created, or the
 * oldest possible time where there is none, so any real edit made later counts as newer. (Worked out again
 * each time the data is loaded, so nothing needs to be rewritten for it.)
 */
function withTimes(db: DB): DB {
  return {
    habits: db.habits.map((h) => (validTime(h.updated_at) ? h : { ...h, updated_at: validTime(h.created_at) ? h.created_at : EPOCH })),
    entries: db.entries.map((e) => (validTime(e.updated_at) ? e : { ...e, updated_at: validTime(e.created_at) ? e.created_at : EPOCH })),
    notes: db.notes.map((n) => (validTime(n.updated_at) ? n : { ...n, updated_at: EPOCH })),
    skips: db.skips.map((k) => (validTime(k.updated_at) ? k : { ...k, updated_at: EPOCH })),
    deleted: db.deleted,
  };
}

let cache: DB | null = null;
let lastRaw: string | null = null; // what this tab last read or wrote, to notice another tab's changes
const listeners = new Set<() => void>();

/** Calls `cb` when another tab or window changed the saved data. Returns a way to stop listening. */
export function onExternalChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Drops the in-memory copy if the saved data differs from what this tab knows, then tells the screen. */
function resync(): void {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return;
  }
  if (raw === lastRaw) return;
  cache = null;
  lastRaw = raw;
  load();
  listeners.forEach((f) => f());
}

if (typeof window !== 'undefined') {
  // Another tab saved something: pick it up, so the next save here cannot overwrite it.
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) resync();
  });
  // A tab that was asleep in the background may have missed that event.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resync();
  });
  window.addEventListener('pageshow', resync);
}

const savedHooks = new Set<() => void>();

/** Calls `cb` every time this tab saves a change (used to start syncing soon after a change). Returns a way to stop. */
export function onLocalSave(cb: () => void): () => void {
  savedHooks.add(cb);
  return () => savedHooks.delete(cb);
}

function write(db: DB): void {
  const raw = JSON.stringify(db);
  localStorage.setItem(KEY, raw);
  lastRaw = raw;
  savedHooks.forEach((f) => f());
}

function load(): DB {
  if (cache) return cache;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* storage blocked: start with sample data for this session */
  }
  lastRaw = raw;
  if (!raw) {
    const db = seed();
    try {
      write(db);
    } catch {
      /* storage unavailable: app still works for this session */
    }
    cache = db;
    return db;
  }
  try {
    cache = validate(JSON.parse(raw));
    seedStamp(cache);
  } catch {
    // Never silently destroy unreadable data: keep a copy before starting fresh.
    try {
      localStorage.setItem(`${KEY}:corrupt-${Date.now()}`, raw);
    } catch {
      /* ignore */
    }
    cache = seed();
  }
  return cache;
}

export function getHabits(): Habit[] {
  return [...load().habits].sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function getEntries(): HabitEntry[] {
  return [...load().entries];
}

export function addHabit(data: {
  name: string;
  icon: string;
  unit: string;
  target_value: number;
  days?: number[];
  color?: string;
  /** Long-term goal in days; leave out for none. */
  goal_days?: number | null;
}): Habit {
  if (!data.name.trim() || !(data.target_value > 0)) throw new Error('Invalid habit');
  if (data.color !== undefined && !isHexColor(data.color)) throw new Error('Invalid habit');
  if (data.goal_days != null && !isGoalDays(data.goal_days)) throw new Error('Invalid habit');
  const db = load();
  const days = normalizeDays(data.days);
  const habit: Habit = {
    id: uid(),
    name: data.name,
    icon: data.icon,
    unit: data.unit,
    target_value: data.target_value,
    color: data.color ?? '#22c55e',
    sort_order: db.habits.reduce((m, h) => Math.max(m, h.sort_order), 0) + 1,
    created_at: new Date().toISOString(),
    updated_at: stamp(),
    ...(days ? { days } : {}),
    ...(data.goal_days != null ? { goal: { days: data.goal_days, start: todayISO() } } : {}),
  };
  const next = { ...db, habits: [...db.habits, habit] };
  write(next); // throws if it cannot be saved; cache only changes on success
  cache = next;
  return habit;
}

function isGoalDays(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= GOAL_MAX;
}

export type HabitPatch = {
  name?: string;
  icon?: string;
  unit?: string;
  target_value?: number;
  days?: number[];
  archived?: boolean;
  color?: string;
  /** Long-term goal in days; null removes the goal. Changing the number keeps the start date. */
  goal_days?: number | null;
};

/** Changes a habit's details. History is kept. Throws if the habit does not exist. */
export function updateHabit(id: string, patch: HabitPatch): Habit {
  const db = load();
  const old = db.habits.find((h) => h.id === id);
  if (!old) throw new Error('Habit not found');
  if (patch.name !== undefined && !patch.name.trim()) throw new Error('Invalid habit');
  if (patch.target_value !== undefined && !(patch.target_value > 0)) {
    throw new Error('Invalid habit');
  }
  if (patch.color !== undefined && !isHexColor(patch.color)) throw new Error('Invalid habit');
  if (patch.goal_days != null && !isGoalDays(patch.goal_days)) throw new Error('Invalid habit');
  const { days: newDays, archived, goal_days, ...rest } = patch;
  const habit: Habit = { ...old, ...rest, updated_at: stamp() };
  if (goal_days !== undefined) {
    if (goal_days === null) delete habit.goal;
    else habit.goal = { days: goal_days, start: old.goal?.start ?? todayISO() };
  }
  if ('days' in patch) {
    const days = normalizeDays(newDays);
    if (days) habit.days = days;
    else delete habit.days;
  }
  if (archived !== undefined) {
    if (archived) habit.archived = true;
    else delete habit.archived;
  }
  const next = { ...db, habits: db.habits.map((h) => (h.id === id ? habit : h)) };
  write(next);
  cache = next;
  return habit;
}

export function deleteHabit(id: string): void {
  const db = load();
  const next: DB = {
    habits: db.habits.filter((h) => h.id !== id),
    entries: db.entries.filter((e) => e.habit_id !== id),
    notes: db.notes.filter((n) => n.habit_id !== id),
    skips: db.skips.filter((n) => n.habit_id !== id),
    // Remember the deletion (its check-ins, notes and rest days go with the habit on every device).
    deleted: db.habits.some((h) => h.id === id) ? withTombstone(db.deleted, 'habit', id, stamp()) : db.deleted,
  };
  write(next);
  cache = next;
}

export function getNotes(): HabitNote[] {
  return [...load().notes];
}

/** Saves a note for a habit on a day. An empty note removes it. Returns the saved note or null. */
export function setNote(habit_id: string, date: string, text: string): HabitNote | null {
  const clean = text.trim();
  if (!DATE_RE.test(date) || clean.length > NOTE_MAX) throw new Error('Invalid note');
  const db = load();
  if (!db.habits.some((h) => h.id === habit_id)) throw new Error('Habit not found');
  const others = db.notes.filter((n) => !(n.habit_id === habit_id && n.date === date));
  const had = others.length !== db.notes.length;
  const key = `${habit_id}|${date}`;
  const note: HabitNote | null = clean ? { habit_id, date, text: clean, updated_at: stamp() } : null;
  const next = {
    ...db,
    notes: note ? [...others, note] : others,
    deleted: note ? withoutTombstone(db.deleted, 'note', key) : had ? withTombstone(db.deleted, 'note', key, stamp()) : db.deleted,
  };
  write(next);
  cache = next;
  return note;
}

export function getSkips(): HabitSkip[] {
  return [...load().skips];
}

/** Marks (or unmarks) a day as a rest day for a habit. */
export function setSkip(habit_id: string, date: string, on: boolean): void {
  if (!DATE_RE.test(date)) throw new Error('Invalid day');
  const db = load();
  if (!db.habits.some((h) => h.id === habit_id)) throw new Error('Habit not found');
  const has = db.skips.some((s) => s.habit_id === habit_id && s.date === date);
  if (has === on) return;
  const key = `${habit_id}|${date}`;
  const skips = on
    ? [...db.skips, { habit_id, date, updated_at: stamp() }]
    : db.skips.filter((s) => !(s.habit_id === habit_id && s.date === date));
  const next = {
    ...db,
    skips,
    deleted: on ? withoutTombstone(db.deleted, 'skip', key) : withTombstone(db.deleted, 'skip', key, stamp()),
  };
  write(next);
  cache = next;
}

/**
 * Moves a habit one place up or down among the habits that are not archived, and saves the new
 * order. Does nothing at the ends of the list. Returns the habits in their new order.
 */
export function moveHabit(id: string, direction: 'up' | 'down'): Habit[] {
  const db = load();
  const sorted = [...db.habits].sort((a, b) => a.sort_order - b.sort_order);
  const visible = sorted.filter((h) => !h.archived);
  const i = visible.findIndex((h) => h.id === id);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= visible.length) return sorted;
  // Swap the two neighbours, then renumber everything so order numbers are always 1, 2, 3...
  const a = sorted.indexOf(visible[i]);
  const b = sorted.indexOf(visible[j]);
  [sorted[a], sorted[b]] = [sorted[b], sorted[a]];
  const at = stamp();
  // Only the habits whose place actually changed count as edited.
  const renumbered = sorted.map((h, k) => (h.sort_order === k + 1 ? h : { ...h, sort_order: k + 1, updated_at: at }));
  const next = { ...db, habits: renumbered };
  write(next);
  cache = next;
  return renumbered;
}

export function setEntry(habit_id: string, date: string, value: number): HabitEntry {
  if (!Number.isFinite(value) || value < 0 || !DATE_RE.test(date)) {
    throw new Error('Invalid entry');
  }
  const db = load();
  const existing = db.entries.find((e) => e.habit_id === habit_id && e.date === date);
  const entry: HabitEntry = existing
    ? { ...existing, value, updated_at: stamp() }
    : { id: uid(), habit_id, date, value, created_at: new Date().toISOString(), updated_at: stamp() };
  const next = {
    ...db,
    entries: existing
      ? db.entries.map((e) => (e.id === existing.id ? entry : e))
      : [...db.entries, entry],
    deleted: withoutTombstone(db.deleted, 'entry', `${habit_id}|${date}`),
  };
  write(next);
  cache = next;
  return entry;
}

/** 2 since syncing groundwork (1.11): items carry a "last changed" time and deletions are remembered. Version 1 files still restore. */
export const BACKUP_VERSION = 2;

export function exportBackup(): string {
  const db = load();
  return JSON.stringify(
    {
      app: 'habitflow',
      version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      habits: db.habits,
      entries: db.entries,
      notes: db.notes,
      skips: db.skips,
      deleted: db.deleted,
    },
    null,
    2
  );
}

// ---------- Restoring a backup safely ----------
// A backup file is checked completely BEFORE anything on the device is touched. A file that fails any
// check is refused with a plain reason and the current data stays exactly as it was. (Loading the data
// already on the device keeps using the looser `validate` above, so these stricter rules can never make
// existing data "unreadable".)

/** A backup file was refused. The message is written for the person using the app. */
export class BackupError extends Error {}

/** Bigger files than this are not HabitFlow backups (a year of heavy use is well under 1 MB). */
export const BACKUP_MAX_BYTES = 20 * 1024 * 1024;

export type BackupInfo = {
  habits: number;
  entries: number;
  notes: number;
  skips: number;
  /** When the backup was saved (ISO text), or null if the file does not say. */
  exportedAt: string | null;
};

function bad(why: string): never {
  throw new BackupError(why);
}

/** A real calendar day (no 2026-02-30) in a believable year. */
function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function checkBackup(json: string): { db: DB; info: BackupInfo } {
  if (!json.trim()) return bad('The file is empty.');
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return bad('The file cannot be read. It may be damaged, cut off, or not a backup at all.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return bad('This does not look like a HabitFlow backup.');
  }
  const top = data as Record<string, unknown>;
  if (top.app !== undefined && top.app !== 'habitflow') return bad('This backup was made by a different app.');
  if (top.version !== undefined) {
    if (typeof top.version !== 'number' || !Number.isFinite(top.version) || top.version < 1) {
      return bad('This backup has an unknown version.');
    }
    if (top.version > BACKUP_VERSION) {
      return bad('This backup comes from a newer version of HabitFlow. Update the app first, then try again.');
    }
  }
  if (!Array.isArray(top.habits) || !Array.isArray(top.entries)) {
    return bad('This does not look like a HabitFlow backup (it has no habits or history).');
  }
  let db: DB;
  try {
    db = validate(data);
  } catch {
    return bad('Some habits or history in this file are damaged or do not match each other.');
  }
  if (db.habits.length === 0) return bad('The backup contains no habits.');

  const habitIds = new Set<string>();
  for (const h of db.habits) {
    if (habitIds.has(h.id)) return bad('Two habits in this file share the same ID.');
    habitIds.add(h.id);
    if (!h.name.trim() || h.name.length > 200) return bad('A habit in this file has an empty or far too long name.');
    if (h.unit.length > 50) return bad(`The unit of "${h.name.slice(0, 40)}" is far too long.`);
    if (!Number.isFinite(h.target_value) || h.target_value > 1_000_000) {
      return bad(`The daily target of "${h.name.slice(0, 40)}" is not a sensible number.`);
    }
    if (!Number.isFinite(h.sort_order)) return bad(`"${h.name.slice(0, 40)}" has a damaged position in the list.`);
    if (Number.isNaN(Date.parse(h.created_at))) return bad(`"${h.name.slice(0, 40)}" has a damaged creation date.`);
    if (h.goal && !isRealDate(h.goal.start)) return bad(`The goal of "${h.name.slice(0, 40)}" has an impossible start date.`);
  }
  const entryIds = new Set<string>();
  for (const e of db.entries) {
    if (entryIds.has(e.id)) return bad('Two check-ins in this file share the same ID.');
    entryIds.add(e.id);
    if (!isRealDate(e.date)) return bad(`A check-in has an impossible date (${e.date}).`);
    if (!Number.isFinite(e.value) || e.value < 0 || e.value > 1_000_000) {
      return bad('A check-in has an amount that is not a sensible number.');
    }
  }
  for (const n of db.notes) if (!isRealDate(n.date)) return bad(`A note has an impossible date (${n.date}).`);
  for (const k of db.skips) if (!isRealDate(k.date)) return bad(`A rest day has an impossible date (${k.date}).`);

  // Colours are only decoration: a damaged one becomes the default green instead of refusing the file.
  const habits = db.habits.map((h) => (isHexColor(h.color) ? h : { ...h, color: HABIT_COLORS[0] }));
  const at = typeof top.exported_at === 'string' && !Number.isNaN(Date.parse(top.exported_at)) ? top.exported_at : null;
  return {
    db: { ...db, habits },
    info: { habits: habits.length, entries: db.entries.length, notes: db.notes.length, skips: db.skips.length, exportedAt: at },
  };
}

/** Checks a backup file and says what is in it, without changing anything. Throws BackupError if it is refused. */
export function previewBackup(json: string): BackupInfo {
  return checkBackup(json).info;
}

/** How much is on this device now. */
export function currentCounts(): { habits: number; entries: number } {
  const db = load();
  return { habits: db.habits.length, entries: db.entries.length };
}

const KEY_SAFETY = `${KEY}:before-restore`;
let restoredRaw: string | null = null; // the saved text right after the last restore, to know whether Undo is still safe

/** Keeps a copy of what is on the device now, just before a restore. Only the latest copy is kept. */
export function saveSafetyCopy(): boolean {
  try {
    localStorage.setItem(KEY_SAFETY, JSON.stringify({ saved_at: new Date().toISOString(), data: load() }));
    return true;
  } catch {
    return false;
  }
}

/** Replaces everything on the device with the backup. Throws BackupError (file refused) or the storage error (device full); in both cases nothing was changed. */
export function importBackup(json: string): void {
  const { db } = checkBackup(json);
  replaceAll(db);
  restoredRaw = lastRaw;
}

const dayKey = (x: { habit_id: string; date: string }) => `${x.habit_id}|${x.date}`;

/**
 * Makes `next` the whole data of this device, as ONE deliberate change: everything in it counts as changed
 * right now, and whatever was here but is not in it counts as deleted right now. That way a restore (or an
 * undo of one) is what other devices will end up with after syncing, instead of being undone by them.
 * Throws the storage error (device full) without changing anything.
 */
function replaceAll(next: DB): void {
  const cur = load();
  const at = stamp();
  const habits = next.habits.map((h) => ({ ...h, updated_at: at }));
  const entries = next.entries.map((e) => ({ ...e, updated_at: at }));
  const notes = next.notes.map((n) => ({ ...n, updated_at: at }));
  const skips = next.skips.map((k) => ({ ...k, updated_at: at }));
  const live = {
    habit: new Set(habits.map((h) => h.id)),
    entry: new Set(entries.map(dayKey)),
    note: new Set(notes.map(dayKey)),
    skip: new Set(skips.map(dayKey)),
  };
  const gone: Tombstone[] = [];
  for (const h of cur.habits) if (!live.habit.has(h.id)) gone.push({ kind: 'habit', key: h.id, at });
  // Items of habits that are going away leave with the habit; only the rest need their own marker.
  for (const e of cur.entries) if (live.habit.has(e.habit_id) && !live.entry.has(dayKey(e))) gone.push({ kind: 'entry', key: dayKey(e), at });
  for (const n of cur.notes) if (live.habit.has(n.habit_id) && !live.note.has(dayKey(n))) gone.push({ kind: 'note', key: dayKey(n), at });
  for (const k of cur.skips) if (live.habit.has(k.habit_id) && !live.skip.has(dayKey(k))) gone.push({ kind: 'skip', key: dayKey(k), at });

  const cutoff = Date.now() - KEEP_TOMBSTONES_MS;
  const latest = new Map<string, Tombstone>();
  for (const d of [...cur.deleted, ...next.deleted, ...gone]) {
    const id = `${d.kind}:${d.key}`;
    const old = latest.get(id);
    if (!old || Date.parse(d.at) > Date.parse(old.at)) latest.set(id, d);
  }
  const deleted = [...latest.values()].filter((d) => !live[d.kind].has(d.key) && Date.parse(d.at) >= cutoff);

  const db: DB = { habits, entries, notes, skips, deleted };
  write(db);
  cache = db;
}

// ---------- For syncing (used by the sync code added later; nothing calls these yet) ----------

/** A copy of everything, including the deletion markers, for merging with another device's copy. */
export function getSyncData(): DB {
  const d = load();
  return { habits: [...d.habits], entries: [...d.entries], notes: [...d.notes], skips: [...d.skips], deleted: [...d.deleted] };
}

/** Saves already-merged data exactly as it is (no new times) and tells the screen. Throws if it is not valid or the device is full. */
export function adoptSyncData(data: DB): void {
  const db = validate(visibleData(data));
  write(db);
  cache = db;
  seedStamp(db);
  listeners.forEach((f) => f());
}

/**
 * Puts back what was on the device before the last restore.
 * 'changed': something was edited since the restore (here or in another tab), so Undo would lose that work.
 * 'none': there is nothing usable to go back to.
 */
export function undoRestore(): 'ok' | 'changed' | 'none' {
  try {
    if (restoredRaw === null) return 'none';
    if (localStorage.getItem(KEY) !== restoredRaw) return 'changed';
    const saved = JSON.parse(localStorage.getItem(KEY_SAFETY) ?? 'null') as { data?: unknown } | null;
    if (!saved) return 'none';
    replaceAll(validate(saved.data));
    restoredRaw = null;
    return 'ok';
  } catch {
    return 'none';
  }
}
