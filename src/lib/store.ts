// Local-first storage: all data lives on this device (localStorage). No server, no account.
import { todayISO } from './date.ts';
import { isHexColor } from './colors.ts';

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

export const NOTE_MAX = 200;
export const GOAL_MAX = 10000;

type DB = { habits: Habit[]; entries: HabitEntry[]; notes: HabitNote[] };

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
  return { habits: d.habits, entries: d.entries, notes };
}

let cache: DB | null = null;

function write(db: DB): void {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function load(): DB {
  if (cache) return cache;
  const raw = localStorage.getItem(KEY);
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
    },
    null,
    2
  );
}

export function importBackup(json: string): void {
  const next = validate(JSON.parse(json));
  write(next);
  cache = next;
}
