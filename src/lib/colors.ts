/** Colours a habit can have. The first is the original green. */
export const HABIT_COLORS = [
  '#22c55e', // green
  '#10b981', // emerald
  '#84cc16', // lime
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#d946ef', // magenta
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
];

/** Colours are stored as #rrggbb because the app adds two more digits for see-through shades. */
export function isHexColor(c: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(c);
}
