export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function getWeekDays(reference: Date = new Date()): Date[] {
  const day = reference.getDay();
  const monday = new Date(reference);
  monday.setDate(reference.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function shiftWeek(reference: Date, weeks: number): Date {
  const d = new Date(reference);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return toISODate(a) === toISODate(b);
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function dayLabel(d: Date): string {
  return DOW[d.getDay()];
}

export function shortDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
