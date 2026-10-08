// The year view: a grid of weeks (Monday first) ending with this week. Pure helpers only.
import { toISODate } from './date.ts';

export const HEAT_WEEKS = 53;

export type HeatCell = { iso: string; date: Date; future: boolean };

export type HeatGrid = {
  /** One list of 7 days (Monday..Sunday) per week, oldest week first. */
  columns: HeatCell[][];
  /** Month names to show above the grid: the week column where each new month starts. */
  months: { col: number; label: string }[];
};

export function yearGrid(today: Date = new Date(), weeks: number = HEAT_WEEKS): HeatGrid {
  const todayIso = toISODate(today);
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const start = new Date(monday);
  start.setDate(start.getDate() - (weeks - 1) * 7);

  const columns: HeatCell[][] = [];
  for (let c = 0; c < weeks; c++) {
    const col: HeatCell[] = [];
    for (let r = 0; r < 7; r++) {
      const date = new Date(start);
      date.setDate(start.getDate() + c * 7 + r);
      const iso = toISODate(date);
      col.push({ iso, date, future: iso > todayIso });
    }
    columns.push(col);
  }

  const months: { col: number; label: string }[] = [];
  for (let c = 0; c < weeks; c++) {
    const m = columns[c][0].date.getMonth();
    const prev = c === 0 ? -1 : columns[c - 1][0].date.getMonth();
    if (m !== prev) months.push({ col: c, label: columns[c][0].date.toLocaleDateString(undefined, { month: 'short' }) });
  }
  // A month name squeezed against the next one would overlap it: drop the first if too close.
  if (months.length > 1 && months[1].col - months[0].col < 3) months.shift();
  return { columns, months };
}

/** How filled a day is: 0 nothing, 1 a little, 2 about half or more, 3 target reached. */
export function heatLevel(value: number, target: number): 0 | 1 | 2 | 3 {
  if (!(value > 0)) return 0;
  if (!(target > 0) || value >= target) return 3;
  return value / target >= 0.5 ? 2 : 1;
}

const LEVEL_ALPHA = ['', '55', '99', ''] as const;

/** The cell colour for a level, from the habit's own #rrggbb colour. Level 0 has no colour. */
export function heatColor(color: string, level: 0 | 1 | 2 | 3): string | undefined {
  if (level === 0) return undefined;
  return `${color}${LEVEL_ALPHA[level]}`;
}
