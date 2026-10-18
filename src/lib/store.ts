// Local-first storage: all data lives on this device (localStorage). No server, no account.
import { todayISO } from './date.ts';
import { HABIT_COLORS, isHexColor } from './colors.ts';

export type Habit = {
  id: string;
  name: string;
  icon: string;
  unit: string;
  target_value: number;
  color: string;
  sort_order: number;
  created_at: string;
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
};

/** A short note about one habit on one day (for example why a day was skipped). */
export type HabitNote = {
  habit_id: string;
  date: string; // YYYY-MM-DD
  text: string;
};

/** A day marked as a rest day for one habit: it does not count for or against the streak. */
export type HabitSkip = {
  habit_id: string;
  date: string; // YYYY-MM-DD
};

export const NOTE_MAX = 200;
export const GOAL_MAX = 10000;

type DB = { habits: Habit[]; entries: HabitEntry[]; notes: HabitNote[]; skips: HabitSkip[] };

const KEY = 'habitflow:v1';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
      id: uid(),
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
  return { habits: d.habits, entries: d.entries, notes, skips };
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

function write(db: DB): void {
  const raw = JSON.stringify(db);
  localStorage.setItem(KEY, raw);
  lastRaw = raw;
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
  return [...load().habits].sort((a, b) => a.sort_order - b.sort_order);
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
  const habit: Habit = { ...old, ...rest };
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
  const next = {
    habits: db.habits.filter((h) => h.id !== id),
    entries: db.entries.filter((e) => e.habit_id !== id),
    notes: db.notes.filter((n) => n.habit_id !== id),
    skips: db.skips.filter((n) => n.habit_id !== id),
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
  const note = clean ? { habit_id, date, text: clean } : null;
  const next = { ...db, notes: note ? [...others, note] : others };
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
  const skips = on
    ? [...db.skips, { habit_id, date }]
    : db.skips.filter((s) => !(s.habit_id === habit_id && s.date === date));
  const next = { ...db, skips };
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
  const renumbered = sorted.map((h, k) => ({ ...h, sort_order: k + 1 }));
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
    ? { ...existing, value }
    : { id: uid(), habit_id, date, value, created_at: new Date().toISOString() };
  const next = {
    ...db,
    entries: existing
      ? db.entries.map((e) => (e.id === existing.id ? entry : e))
      : [...db.entries, entry],
  };
  write(next);
  cache = next;
  return entry;
}

export function exportBackup(): string {
  const db = load();
  return JSON.stringify(
    {
      app: 'habitflow',
      version: 1,
      exported_at: new Date().toISOString(),
      habits: db.habits,
      entries: db.entries,
      notes: db.notes,
      skips: db.skips,
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
    if (top.version > 1) {
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
  write(db);
  cache = db;
  restoredRaw = lastRaw;
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
    const db = validate(saved.data);
    write(db);
    cache = db;
    restoredRaw = null;
    return 'ok';
  } catch {
    return 'none';
  }
}
