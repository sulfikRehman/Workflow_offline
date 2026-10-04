// Pure helpers for streaks, schedules and the month calendar. No storage or screen code here,
// so they can be tested on their own.
import { toISODate } from './date.ts';
import type { Habit } from './store.ts';

type Scheduled = Pick<Habit, 'days'>;
type Goal = Pick<Habit, 'days' | 'target_value'>;

/** Looks up how much was logged on a date (YYYY-MM-DD). Returns 0 when nothing was logged. */
export type ValueOn = (iso: string) => number;

/** Is the habit scheduled on this day of the week? A habit with no `days` is scheduled every day. */
export function isActiveDay(habit: Scheduled, d: Date): boolean {
  return !habit.days || habit.days.includes(d.getDay());
}

/** How many of these dates fall on a scheduled day. */
export function activeDaysIn(habit: Scheduled, dates: Date[]): number {
  return dates.filter((d) => isActiveDay(habit, d)).length;
}

/**
 * Current streak: how many scheduled days in a row reached the target, counting back from today.
 * Days the habit is not scheduled are skipped (they neither count nor break the streak).
 * Today does not break the streak while it is still unfinished: the count starts from the last
 * scheduled day before today in that case.
 */
export function currentStreak(habit: Goal, valueOn: ValueOn, today: Date = new Date()): number {
  const d = new Date(today);
  if (isActiveDay(habit, d) && valueOn(toISODate(d)) < habit.target_value) {
    d.setDate(d.getDate() - 1);
  }
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    if (isActiveDay(habit, d)) {
      if (valueOn(toISODate(d)) >= habit.target_value) streak++;
      else break;
    }
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/**
 * Longest streak of scheduled days that reached the target, looking from `from` up to today.
 * An unfinished today is simply not counted.
 */
export function bestStreak(
  habit: Goal,
  valueOn: ValueOn,
  from: Date,
  today: Date = new Date()
): number {
  const end = toISODate(today);
  const d = new Date(from);
  let best = 0;
  let run = 0;
  for (let i = 0; i < 20000; i++) {
    const iso = toISODate(d);
    if (iso > end) break;
    if (isActiveDay(habit, d)) {
      if (valueOn(iso) >= habit.target_value) {
        run++;
        if (run > best) best = run;
      } else {
        run = 0; // (an unfinished today ends the loop anyway, so it never lowers the best)
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return best;
}

/** Turns a YYYY-MM-DD string into a local Date (midnight). */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * The weeks of a month for a calendar that starts on Monday. `month` is 0-11. Cells outside the
 * month are null, so every week has exactly 7 cells.
 */
export function monthWeeks(year: number, month: number): (Date | null)[][] {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(lead).fill(null);
  for (let day = 1; day <= count; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** How many scheduled days of this month (up to and including today) reached the target. */
export function monthSummary(
  habit: Goal,
  valueOn: ValueOn,
  year: number,
  month: number,
  today: Date = new Date()
): { done: number; scheduled: number; pct: number } {
  const end = toISODate(today);
  const count = new Date(year, month + 1, 0).getDate();
  let done = 0;
  let scheduled = 0;
  for (let day = 1; day <= count; day++) {
    const d = new Date(year, month, day);
    const iso = toISODate(d);
    if (iso > end) break;
    if (!isActiveDay(habit, d)) continue;
    scheduled++;
    if (valueOn(iso) >= habit.target_value) done++;
  }
  return { done, scheduled, pct: scheduled ? Math.round((done / scheduled) * 100) : 0 };
}

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Weekday numbers in the order shown to the user (Monday first). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Short text for a schedule: '' (every day), 'Weekdays', 'Weekends' or 'Mon, Wed, Fri'. */
export function scheduleLabel(days?: number[]): string {
  if (!days || days.length === 0 || days.length === 7) return '';
  const set = new Set(days);
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Weekdays';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Weekends';
  return WEEK_ORDER.filter((d) => set.has(d))
    .map((d) => SHORT[d])
    .join(', ');
}

/**
 * How many minutes one unit of this habit is worth, if the unit is a length of time:
 * 1 for minutes, 1/60 for hours. Returns null for any other unit (pages, meals...).
 */
export function timeUnitFactor(unit: string): number | null {
  const u = unit.trim().toLowerCase().replace(/\.$/, '');
  if (['m', 'min', 'mins', 'minute', 'minutes'].includes(u)) return 1;
  if (['h', 'hr', 'hrs', 'hour', 'hours'].includes(u)) return 1 / 60;
  return null;
}

/** Rounds to 2 decimals so values like 0.1 + 0.2 do not show as 0.30000000000000004. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
