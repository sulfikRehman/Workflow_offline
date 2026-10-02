import { useMemo, useRef, useState } from 'react';
import * as store from '@/lib/store';
import type { Habit, HabitEntry } from '@/lib/store';
import {
  getWeekDays,
  shiftWeek,
  toISODate,
  isToday,
  dayLabel,
  shortDate,
  todayISO,
} from '@/lib/date';
import { getHabitIcon } from '@/lib/icons';
import TimerModal from './TimerModal';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Flame,
  Plus,
  Save,
  Target,
  Timer,
  Trash2,
  TrendingUp,
  Upload,
} from 'lucide-react';

type EntryMap = Record<string, Record<string, number>>;

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function pct(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((value / target) * 100));
}

function download(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function App() {
  const [habits, setHabits] = useState<Habit[]>(() => store.getHabits());
  const [entries, setEntries] = useState<HabitEntry[]>(() => store.getEntries());
  const [weekRef, setWeekRef] = useState<Date>(new Date());
  const [adding, setAdding] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const weekDays = useMemo(() => getWeekDays(weekRef), [weekRef]);

  // All entries, keyed habit -> date -> value (used for the week grid and for streaks)
  const entryMap: EntryMap = useMemo(() => {
    const m: EntryMap = {};
    for (const e of entries) {
      if (!m[e.habit_id]) m[e.habit_id] = {};
      m[e.habit_id][e.date] = e.value;
    }
    return m;
  }, [entries]);

  function fail(message: string, err: unknown) {
    console.error(err);
    setNotice(null);
    setError(message);
  }

  function logEntry(habit: Habit, date: string, value: number) {
    try {
      const e = store.setEntry(habit.id, date, value);
      setEntries((prev) =>
        prev.some((x) => x.id === e.id)
          ? prev.map((x) => (x.id === e.id ? e : x))
          : [...prev, e]
      );
    } catch (err) {
      fail('Could not save. Your phone storage may be full or blocked.', err);
    }
  }

  function toggleComplete(habit: Habit, date: string) {
    const current = entryMap[habit.id]?.[date] ?? 0;
    logEntry(habit, date, current >= habit.target_value ? 0 : habit.target_value);
  }

  function deleteHabit(habit: Habit) {
    if (
      !window.confirm(
        `Delete "${habit.name}" and all its history? This cannot be undone.`
      )
    )
      return;
    try {
      store.deleteHabit(habit.id);
      setHabits((prev) => prev.filter((h) => h.id !== habit.id));
      setEntries((prev) => prev.filter((e) => e.habit_id !== habit.id));
    } catch (err) {
      fail('Could not delete that habit.', err);
    }
  }

  function addHabit(data: {
    name: string;
    icon: string;
    unit: string;
    target_value: number;
  }) {
    try {
      const row = store.addHabit(data);
      setHabits((prev) => [...prev, row]);
      setAdding(false);
    } catch (err) {
      fail('Could not add that habit. Your phone storage may be full or blocked.', err);
    }
  }

  // Stats
  const todayStr = todayISO();
  const todayCompleted = habits.filter((h) => {
    const v = entryMap[h.id]?.[todayStr] ?? 0;
    return v >= h.target_value;
  }).length;

  const weekCompleted = habits.reduce((acc, h) => {
    return (
      acc +
      weekDays.filter((d) => {
        const v = entryMap[h.id]?.[toISODate(d)] ?? 0;
        return v >= h.target_value;
      }).length
    );
  }, 0);

  const maxWeekChecks = habits.length * 7;

  // Best current streak across any single habit. A streak that ended yesterday still counts
  // (today is not over yet).
  const bestStreak = useMemo(() => {
    let best = 0;
    for (const habit of habits) {
      let streak = 0;
      const d = new Date();
      if ((entryMap[habit.id]?.[toISODate(d)] ?? 0) < habit.target_value) {
        d.setDate(d.getDate() - 1);
      }
      for (let i = 0; i < 3650; i++) {
        const v = entryMap[habit.id]?.[toISODate(d)] ?? 0;
        if (v >= habit.target_value) {
          streak++;
          d.setDate(d.getDate() - 1);
        } else {
          break;
        }
      }
      if (streak > best) best = streak;
    }
    return best;
  }, [habits, entryMap]);

  function downloadCSV() {
    if (habits.length === 0) return;
    const habitById = new Map(habits.map((h) => [h.id, h]));
    const rows: string[] = ['Habit,Date,Value,Unit,Target,Completed'];
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    for (const e of sorted) {
      const h = habitById.get(e.habit_id);
      if (!h) continue;
      rows.push(
        [
          csvEscape(h.name),
          e.date,
          e.value,
          csvEscape(h.unit),
          h.target_value,
          e.value >= h.target_value ? 'Yes' : 'No',
        ].join(',')
      );
    }
    download(`habitflow-export-${todayISO()}.csv`, rows.join('\n'), 'text/csv;charset=utf-8;');
  }

  function saveBackup() {
    download(
      `habitflow-backup-${todayISO()}.json`,
      store.exportBackup(),
      'application/json'
    );
    setError(null);
    setNotice('Backup downloaded. Keep the file somewhere safe (Drive, email to yourself).');
  }

  async function restoreBackup(file: File) {
    if (
      !window.confirm(
        'Restore this backup? It will REPLACE all habits and history currently in the app.'
      )
    )
      return;
    try {
      store.importBackup(await file.text());
      setHabits(store.getHabits());
      setEntries(store.getEntries());
      setError(null);
      setNotice('Backup restored.');
    } catch (err) {
      fail('That file is not a valid HabitFlow backup. Nothing was changed.', err);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-neutral-800/60 bg-neutral-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-500/15 ring-1 ring-green-500/30">
              <Flame className="h-5 w-5 text-green-400" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base font-semibold tracking-tight text-white">
                HabitFlow
              </h1>
              <p className="text-[11px] text-neutral-500">
                Track your daily routines
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCSV}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 px-2.5 py-2 text-sm font-medium text-neutral-300 transition hover:border-neutral-700 hover:text-white active:scale-95 sm:px-3"
              aria-label="Export CSV"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={saveBackup}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 px-2.5 py-2 text-sm font-medium text-neutral-300 transition hover:border-neutral-700 hover:text-white active:scale-95 sm:px-3"
              aria-label="Save backup"
            >
              <Save className="h-4 w-4" />
              <span className="hidden sm:inline">Backup</span>
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 px-2.5 py-2 text-sm font-medium text-neutral-300 transition hover:border-neutral-700 hover:text-white active:scale-95 sm:px-3"
              aria-label="Restore backup"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Restore</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) restoreBackup(f);
              }}
            />
            <button
              onClick={() => setTimerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 px-2.5 py-2 text-sm font-medium text-neutral-300 transition hover:border-neutral-700 hover:text-white active:scale-95 sm:px-3"
              aria-label="Open timer"
            >
              <Timer className="h-4 w-4" />
              <span className="hidden sm:inline">Timer</span>
            </button>
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-500 px-2.5 py-2 text-sm font-medium text-neutral-950 transition hover:bg-green-400 active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Habit</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Stats row */}
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <StatCard
            label="Today"
            value={`${todayCompleted}/${habits.length}`}
            sub="completed"
            accent
          />
          <StatCard
            label="This Week"
            value={`${weekCompleted}`}
            sub={`of ${maxWeekChecks} checks`}
          />
          <StatCard
            label="Best Streak"
            value={`${bestStreak}`}
            sub="days"
          />
          <StatCard
            label="Habits"
            value={`${habits.length}`}
            sub="tracking"
          />
        </section>

        {/* Week selector */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => setWeekRef((r) => shiftWeek(r, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 text-neutral-400 transition hover:border-neutral-700 hover:text-white"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <p className="text-sm font-medium text-white">
              {shortDate(weekDays[0])} – {shortDate(weekDays[6])}
            </p>
            <p className="text-[11px] text-neutral-500">
              {weekDays.some((d) => isToday(d)) ? 'This week' : 'Viewing week'}
            </p>
          </div>
          <button
            onClick={() => setWeekRef((r) => shiftWeek(r, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 text-neutral-400 transition hover:border-neutral-700 hover:text-white"
            aria-label="Next week"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {notice && !error && (
          <div
            role="status"
            className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300"
          >
            <span>{notice}</span>
            <button
              onClick={() => setNotice(null)}
              className="text-xs font-medium text-green-200 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-xs font-medium text-red-200 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Habit grid */}
        {habits.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 py-16 text-center">
            <Target className="mb-3 h-10 w-10 text-neutral-700" />
            <p className="text-sm font-medium text-neutral-300">
              No habits yet
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Add your first habit to start tracking.
            </p>
            <button
              onClick={() => setAdding(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-green-400"
            >
              <Plus className="h-4 w-4" />
              Add Habit
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {habits.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                weekDays={weekDays}
                entryMap={entryMap}
                onToggle={(date) => toggleComplete(habit, date)}
                onLog={(date, val) => logEntry(habit, date, val)}
                onDelete={() => deleteHabit(habit)}
              />
            ))}
          </div>
        )}
      </main>

      {adding && (
        <AddHabitModal onClose={() => setAdding(false)} onAdd={addHabit} />
      )}

      {timerOpen && <TimerModal onClose={() => setTimerOpen(false)} />}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent
          ? 'border-green-500/30 bg-green-500/10'
          : 'border-neutral-800/60 bg-neutral-900/40'
      }`}
    >
      <p className="text-[11px] uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          accent ? 'text-green-400' : 'text-white'
        }`}
      >
        {value}
      </p>
      <p className="text-[11px] text-neutral-500">{sub}</p>
    </div>
  );
}

function HabitRow({
  habit,
  weekDays,
  entryMap,
  onToggle,
  onLog,
  onDelete,
}: {
  habit: Habit;
  weekDays: Date[];
  entryMap: EntryMap;
  onToggle: (date: string) => void;
  onLog: (date: string, value: number) => void;
  onDelete: () => void;
}) {
  const Icon = getHabitIcon(habit.icon);
  const weekVals = weekDays.map((d) => entryMap[habit.id]?.[toISODate(d)] ?? 0);
  const weekTotal = weekVals.reduce((a, b) => a + b, 0);
  const weekTarget = habit.target_value * 7;
  const weekPct = pct(weekTotal, weekTarget);
  const todayVal = entryMap[habit.id]?.[todayISO()] ?? 0;
  const todayPct = pct(todayVal, habit.target_value);

  return (
    <div className="group rounded-2xl border border-neutral-800/60 bg-neutral-900/40 p-4 transition hover:border-neutral-700/70">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: `${habit.color}1a`,
              color: habit.color,
            }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{habit.name}</h3>
            <p className="text-[11px] text-neutral-500">
              Target: {habit.target_value} {habit.unit}/day
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums text-green-400">
              {todayVal}
              <span className="text-neutral-500"> / {habit.target_value}</span>
            </p>
            <p className="text-[11px] text-neutral-500">{habit.unit} today</p>
          </div>
          <button
            onClick={onDelete}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 transition hover:bg-neutral-800 hover:text-red-400"
            aria-label={`Delete ${habit.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Today progress bar */}
      <div className="mt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${todayPct}%`,
              backgroundColor: habit.color,
            }}
          />
        </div>
      </div>

      {/* Week grid */}
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {weekDays.map((d, i) => {
          const iso = toISODate(d);
          const val = weekVals[i];
          const done = val >= habit.target_value;
          const partial = val > 0 && !done;
          const today = isToday(d);
          return (
            <button
              key={iso}
              onClick={() => onToggle(iso)}
              className={`flex flex-col items-center gap-1 rounded-lg border py-2 transition active:scale-95 ${
                today
                  ? 'border-green-500/40'
                  : 'border-neutral-800/50 hover:border-neutral-700'
              } ${done ? 'bg-green-500/15' : 'bg-neutral-900/30'}`}
              title={`${val} / ${habit.target_value} ${habit.unit}`}
            >
              <span
                className={`text-[10px] font-medium ${
                  today ? 'text-green-400' : 'text-neutral-500'
                }`}
              >
                {dayLabel(d)}
              </span>
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] ${
                  done
                    ? 'text-neutral-950'
                    : partial
                    ? 'text-white'
                    : 'text-neutral-600'
                }`}
                style={{
                  backgroundColor: done
                    ? habit.color
                    : partial
                    ? `${habit.color}33`
                    : 'transparent',
                }}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" />
                ) : partial ? (
                  Math.round(val)
                ) : (
                  ''
                )}
              </span>
              <span className="text-[9px] text-neutral-600">
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Week summary */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-500">
        <span className="flex items-center gap-1">
          <TrendingUp className="h-3.5 w-3.5 text-neutral-600" />
          {Math.round(weekTotal)} / {Math.round(weekTarget)} {habit.unit} this
          week
        </span>
        <span className="tabular-nums">{weekPct}%</span>
      </div>
    </div>
  );
}

const ICON_OPTIONS = [
  'BookOpen',
  'Dumbbell',
  'BookMarked',
  'UtensilsCrossed',
  'Moon',
  'Droplet',
  'Heart',
  'Brain',
  'Footprints',
  'Apple',
  'Bike',
  'Pencil',
  'Clock',
];

function AddHabitModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (data: {
    name: string;
    icon: string;
    unit: string;
    target_value: number;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('BookOpen');
  const [unit, setUnit] = useState('min');
  const [target, setTarget] = useState(30);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      icon,
      unit: unit.trim() || 'count',
      target_value: Math.max(1, target || 1),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl border border-neutral-800 bg-neutral-900 p-5 sm:rounded-2xl"
      >
        <h2 className="text-base font-semibold text-white">New Habit</h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          Add a habit to track daily.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">
              Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Meditation"
              className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-green-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-400">
                Unit
              </label>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="min, hrs, pages..."
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-green-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-400">
                Daily Target
              </label>
              <input
                type="number"
                min={1}
                value={target}
                onChange={(e) => setTarget(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white focus:border-green-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">
              Icon
            </label>
            <div className="grid grid-cols-7 gap-1.5">
              {ICON_OPTIONS.map((ic) => {
                const Ico = getHabitIcon(ic);
                const sel = ic === icon;
                return (
                  <button
                    type="button"
                    key={ic}
                    onClick={() => setIcon(ic)}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border transition ${
                      sel
                        ? 'border-green-500 bg-green-500/15 text-green-400'
                        : 'border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-white'
                    }`}
                  >
                    <Ico className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-300 transition hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 rounded-lg bg-green-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-green-400"
          >
            Add Habit
          </button>
        </div>
      </form>
    </div>
  );
}
