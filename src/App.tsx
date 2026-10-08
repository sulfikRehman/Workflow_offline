import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import * as store from '@/lib/store';
import type { Habit, HabitEntry, HabitNote, HabitSkip } from '@/lib/store';
import { getWeekDays, shiftWeek, toISODate, isToday, shortDate, todayISO } from '@/lib/date';
import { getHabitIcon } from '@/lib/icons';
import { haptic } from '@/lib/haptics';
import {
  bestStreak,
  currentStreak,
  isCountedDay,
  parseISODate,
  round2,
  timeUnitFactor,
  weeklySummary,
} from '@/lib/stats';
import { shareFile } from '@/lib/share';
import { dismissNudge, getNudge, markBackupSaved } from '@/lib/backupNudge';
import type { Nudge } from '@/lib/backupNudge';
import AboutModal from './AboutModal';
import AmountModal from './AmountModal';
import HabitCalendar from './HabitCalendar';
import HabitForm from './HabitForm';
import type { HabitFormData } from './HabitForm';
import HabitRow from './HabitRow';
import MoreMenu from './MoreMenu';
import TimerModal from './TimerModal';
import TrendsModal from './TrendsModal';
import TodayRing from './TodayRing';
import WeeklyCard from './WeeklyCard';
import { claimMilestone, crossedMilestone } from '@/lib/milestones';
import { usePresence } from './usePresence';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flame,
  Pencil,
  ArrowUpDown,
  Check as CheckIcon,
  Plus,
  Target,
  Timer,
  TrendingUp,
} from 'lucide-react';

type EntryMap = Record<string, Record<string, number>>;
const NO_VALUES: Record<string, number> = {};

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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
  const [notes, setNotes] = useState<HabitNote[]>(() => store.getNotes());
  const [skips, setSkips] = useState<HabitSkip[]>(() => store.getSkips());
  const [weekRef, setWeekRef] = useState<Date>(new Date());
  const [weekDir, setWeekDir] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [amountFor, setAmountFor] = useState<{ habitId: string; date: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [trendsOpen, setTrendsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nudge, setNudge] = useState<Nudge>(() => getNudge(store.getEntries().length > 0));
  const fileRef = useRef<HTMLInputElement>(null);

  const weekDays = useMemo(() => getWeekDays(weekRef), [weekRef]);
  const activeHabits = useMemo(() => habits.filter((h) => !h.archived), [habits]);
  const archivedHabits = useMemo(() => habits.filter((h) => h.archived), [habits]);

  // All entries, keyed habit -> date -> value (used for the week grid, streaks and the calendar)
  const entryMap: EntryMap = useMemo(() => {
    const m: EntryMap = {};
    for (const e of entries) {
      if (!m[e.habit_id]) m[e.habit_id] = {};
      m[e.habit_id][e.date] = e.value;
    }
    return m;
  }, [entries]);

  // Notes, keyed habit -> date -> text
  const noteMap: Record<string, Record<string, string>> = useMemo(() => {
    const m: Record<string, Record<string, string>> = {};
    for (const n of notes) {
      if (!m[n.habit_id]) m[n.habit_id] = {};
      m[n.habit_id][n.date] = n.text;
    }
    return m;
  }, [notes]);

  // Rest days, keyed habit -> date -> true
  const skipMap: Record<string, Record<string, true>> = useMemo(() => {
    const m: Record<string, Record<string, true>> = {};
    for (const s of skips) {
      if (!m[s.habit_id]) m[s.habit_id] = {};
      m[s.habit_id][s.date] = true;
    }
    return m;
  }, [skips]);
  const skippedFor = (habitId: string) => (iso: string) => !!skipMap[habitId]?.[iso];
  const skippedOn = (habitId: string, iso: string) => !!skipMap[habitId]?.[iso];

  const valueOnFor = (habitId: string) => (iso: string) => entryMap[habitId]?.[iso] ?? 0;

  // Current and best streak for each habit (scheduled days only)
  const streaks = useMemo(() => {
    const out: Record<string, { current: number; best: number }> = {};
    for (const h of activeHabits) {
      const valueOn = (iso: string) => entryMap[h.id]?.[iso] ?? 0;
      const skipFn = (iso: string) => !!skipMap[h.id]?.[iso];
      const dates = Object.keys(entryMap[h.id] ?? {}).sort();
      out[h.id] = {
        current: currentStreak(h, valueOn, new Date(), skipFn),
        best: dates.length ? bestStreak(h, valueOn, parseISODate(dates[0]), new Date(), skipFn) : 0,
      };
    }
    return out;
  }, [activeHabits, entryMap, skipMap]);

  // A small "well done" the first time a habit's streak reaches 7, 30 or 100 days.
  const lastStreaks = useRef<Record<string, number> | null>(null);
  useEffect(() => {
    const now: Record<string, number> = {};
    for (const h of activeHabits) now[h.id] = streaks[h.id]?.current ?? 0;
    const before = lastStreaks.current;
    lastStreaks.current = now;
    if (!before) return; // first look at the data: nothing to compare with yet
    for (const h of activeHabits) {
      if (before[h.id] === undefined) continue;
      const m = crossedMilestone(before[h.id], now[h.id]);
      if (m !== null && claimMilestone(h.id, m)) {
        haptic('milestone');
        setError(null);
        setNotice(`🏆 ${m}-day streak on ${h.name}. Well done!`);
        break;
      }
    }
  }, [streaks, activeHabits]);

  // What the Trends window needs: each habit and the first day it counts from.
  const trendHabits = useMemo(
    () =>
      activeHabits.map((h) => {
        const created = new Date(h.created_at);
        const createdIso = Number.isNaN(created.getTime()) ? '0000-00-00' : toISODate(created);
        const firstEntry = Object.keys(entryMap[h.id] ?? {}).sort()[0];
        const from = firstEntry && firstEntry < createdIso ? firstEntry : createdIso;
        return { ...h, from };
      }),
    [activeHabits, entryMap]
  );

  const editingHabit = habits.find((h) => h.id === editingId) ?? null;
  const calendarHabit = activeHabits.find((h) => h.id === calendarId) ?? null;
  const amountHabit = habits.find((h) => h.id === amountFor?.habitId) ?? null;

  // Windows and banners stay on screen briefly while they play their closing animation.
  const addP = usePresence(adding ? true : null);
  const editP = usePresence(editingHabit);
  const calendarP = usePresence(calendarHabit);
  const amountP = usePresence(
    amountHabit && amountFor
      ? {
          habit: amountHabit,
          date: amountFor.date,
          current: entryMap[amountHabit.id]?.[amountFor.date] ?? 0,
          note: noteMap[amountHabit.id]?.[amountFor.date] ?? '',
          rest: !!skipMap[amountHabit.id]?.[amountFor.date],
        }
      : null
  );
  const timerP = usePresence(timerOpen ? true : null);
  const trendsP = usePresence(trendsOpen ? true : null);
  const aboutP = usePresence(aboutOpen ? true : null);
  const noticeP = usePresence(notice && !error ? notice : null);
  const errorP = usePresence(error);
  const nudgeP = usePresence(nudge);

  // The page behind a window stays still while the window is open.
  const windowOpen = !!(
    addP.item ||
    editP.item ||
    calendarP.item ||
    amountP.item ||
    timerP.item ||
    trendsP.item ||
    aboutP.item
  );
  useEffect(() => {
    if (!windowOpen) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, [windowOpen]);

  function fail(message: string, err: unknown) {
    console.error(err);
    setNotice(null);
    setError(message);
  }

  function logEntry(habit: Habit, date: string, value: number): boolean {
    try {
      const e = store.setEntry(habit.id, date, value);
      setEntries((prev) =>
        prev.some((x) => x.id === e.id) ? prev.map((x) => (x.id === e.id ? e : x)) : [...prev, e]
      );
      return true;
    } catch (err) {
      fail('Could not save. Your phone storage may be full or blocked.', err);
      return false;
    }
  }

  function toggleComplete(habit: Habit, date: string) {
    const current = entryMap[habit.id]?.[date] ?? 0;
    const completing = current < habit.target_value;
    if (logEntry(habit, date, completing ? habit.target_value : 0)) {
      haptic(completing ? 'success' : 'undo');
    }
  }

  function openAmount(habit: Habit, date: string) {
    haptic('confirm');
    setAmountFor({ habitId: habit.id, date });
  }

  function saveAmount(value: number, note: string, rest: boolean) {
    if (!amountHabit || !amountFor) return;
    const { date } = amountFor;
    const had = entryMap[amountHabit.id]?.[date] ?? 0;
    // A note alone should not create an empty "0" entry.
    if (!(value === 0 && had === 0) && !logEntry(amountHabit, date, value)) return;
    try {
      const saved = store.setNote(amountHabit.id, date, note);
      setNotes((prev) => {
        const others = prev.filter((n) => !(n.habit_id === amountHabit.id && n.date === date));
        return saved ? [...others, saved] : others;
      });
      store.setSkip(amountHabit.id, date, rest);
      setSkips((prev) => {
        const others = prev.filter((s) => !(s.habit_id === amountHabit.id && s.date === date));
        return rest ? [...others, { habit_id: amountHabit.id, date }] : others;
      });
    } catch (err) {
      fail('Could not save the note or rest day. Your phone storage may be full or blocked.', err);
      return;
    }
    haptic('success');
    setAmountFor(null);
  }

  function moveHabit(habit: Habit, direction: 'up' | 'down') {
    try {
      setHabits(store.moveHabit(habit.id, direction));
    } catch (err) {
      fail('Could not change the order. Your phone storage may be full or blocked.', err);
    }
  }

  /** Adds minutes from the timer to today's total for a habit measured in minutes or hours. */
  function logTime(habitId: string, minutes: number): boolean {
    const habit = habits.find((h) => h.id === habitId);
    const factor = habit ? timeUnitFactor(habit.unit) : null;
    if (!habit || factor === null) return false;
    const today = todayISO();
    const total = round2((entryMap[habit.id]?.[today] ?? 0) + minutes * factor);
    const ok = logEntry(habit, today, total);
    if (ok) haptic('success');
    return ok;
  }

  function deleteHabit(habit: Habit) {
    if (!window.confirm(`Delete "${habit.name}" and all its history? This cannot be undone.`)) {
      return;
    }
    try {
      store.deleteHabit(habit.id);
      setHabits((prev) => prev.filter((h) => h.id !== habit.id));
      setEntries((prev) => prev.filter((e) => e.habit_id !== habit.id));
      setNotes((prev) => prev.filter((n) => n.habit_id !== habit.id));
      setSkips((prev) => prev.filter((s) => s.habit_id !== habit.id));
      if (editingId === habit.id) setEditingId(null);
      if (calendarId === habit.id) setCalendarId(null);
      if (amountFor?.habitId === habit.id) setAmountFor(null);
      haptic('confirm');
    } catch (err) {
      fail('Could not delete that habit.', err);
    }
  }

  function addHabit(data: HabitFormData) {
    try {
      const row = store.addHabit(data);
      setHabits((prev) => [...prev, row]);
      setAdding(false);
      haptic('success');
    } catch (err) {
      fail('Could not add that habit. Your phone storage may be full or blocked.', err);
    }
  }

  function saveEdit(habit: Habit, data: HabitFormData) {
    try {
      const row = store.updateHabit(habit.id, data);
      setHabits((prev) => prev.map((h) => (h.id === row.id ? row : h)));
      setEditingId(null);
      haptic('success');
    } catch (err) {
      fail('Could not save those changes. Your phone storage may be full or blocked.', err);
    }
  }

  function setArchived(habit: Habit, archived: boolean) {
    try {
      const row = store.updateHabit(habit.id, { archived });
      setHabits((prev) => prev.map((h) => (h.id === row.id ? row : h)));
      setEditingId(null);
      if (archived && calendarId === habit.id) setCalendarId(null);
      setError(null);
      setNotice(
        archived
          ? `Archived "${habit.name}". It is listed under Archived at the bottom, with its history.`
          : `Restored "${habit.name}".`
      );
      haptic('confirm');
    } catch (err) {
      fail('Could not change that habit. Your phone storage may be full or blocked.', err);
    }
  }

  // Stats (archived habits and days a habit isn't scheduled are left out)
  const todayDate = new Date();
  const todayStr = todayISO();
  const scheduledToday = activeHabits.filter((h) =>
    isCountedDay(h, todayDate, valueOnFor(h.id), skippedFor(h.id))
  );
  const todayCompleted = scheduledToday.filter(
    (h) => (entryMap[h.id]?.[todayStr] ?? 0) >= h.target_value
  ).length;

  const weekCompleted = activeHabits.reduce(
    (acc, h) =>
      acc +
      weekDays.filter(
        (d) =>
          isCountedDay(h, d, valueOnFor(h.id), skippedFor(h.id)) &&
          (entryMap[h.id]?.[toISODate(d)] ?? 0) >= h.target_value
      ).length,
    0
  );
  const maxWeekChecks = activeHabits.reduce(
    (acc, h) =>
      acc + weekDays.filter((d) => isCountedDay(h, d, valueOnFor(h.id), skippedFor(h.id))).length,
    0
  );
  const weekly = weeklySummary(trendHabits, (id, iso) => entryMap[id]?.[iso] ?? 0, new Date(), skippedOn);
  const topStreak = activeHabits.reduce((m, h) => Math.max(m, streaks[h.id]?.current ?? 0), 0);

  function downloadCSV() {
    if (habits.length === 0) return;
    const habitById = new Map(habits.map((h) => [h.id, h]));
    const rows: string[] = ['Habit,Date,Value,Unit,Target,Completed,Note,Rest day'];
    // One row per day that has an amount, a note or a rest-day mark.
    type Day = { habit: Habit; date: string; value: number; note: string; rest: boolean };
    const days = new Map<string, Day>();
    const dayFor = (h: Habit, date: string): Day => {
      const key = `${h.id}|${date}`;
      let row = days.get(key);
      if (!row) {
        row = { habit: h, date, value: 0, note: '', rest: false };
        days.set(key, row);
      }
      return row;
    };
    for (const e of entries) {
      const h = habitById.get(e.habit_id);
      if (h) dayFor(h, e.date).value = e.value;
    }
    for (const n of notes) {
      const h = habitById.get(n.habit_id);
      if (h) dayFor(h, n.date).note = n.text;
    }
    for (const s of skips) {
      const h = habitById.get(s.habit_id);
      if (h) dayFor(h, s.date).rest = true;
    }
    const sorted = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
    for (const r of sorted) {
      rows.push(
        [
          csvEscape(r.habit.name),
          r.date,
          r.value,
          csvEscape(r.habit.unit),
          r.habit.target_value,
          r.value >= r.habit.target_value ? 'Yes' : 'No',
          csvEscape(r.note),
          r.rest ? 'Yes' : '',
        ].join(',')
      );
    }
    download(`habitflow-export-${todayISO()}.csv`, rows.join('\n'), 'text/csv;charset=utf-8;');
  }

  function saveBackup() {
    download(`habitflow-backup-${todayISO()}.json`, store.exportBackup(), 'application/json');
    markBackupSaved();
    setNudge(null);
    setError(null);
    setNotice('Backup downloaded. Keep the file somewhere safe (Drive, email to yourself).');
    haptic('success');
  }

  async function shareBackup() {
    const name = `habitflow-backup-${todayISO()}.json`;
    const text = store.exportBackup();
    const saved = (message: string) => {
      markBackupSaved();
      setNudge(null);
      setError(null);
      setNotice(message);
      haptic('success');
    };
    try {
      const result = await shareFile(name, text, 'application/json');
      if (result === 'shared') {
        saved('Backup shared. Check that it arrived where you sent it (Drive, WhatsApp, email).');
      } else if (result === 'unsupported') {
        download(name, text, 'application/json');
        saved("This browser can't share files, so the backup was downloaded instead.");
      }
      // 'cancelled': you closed the share sheet; nothing to do.
    } catch (err) {
      console.error(err);
      download(name, text, 'application/json');
      saved('Sharing did not work, so the backup was downloaded instead.');
    }
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
      setNotes(store.getNotes());
      setSkips(store.getSkips());
      setEditingId(null);
      setCalendarId(null);
      setAmountFor(null);
      setError(null);
      setNotice('Backup restored.');
      haptic('success');
    } catch (err) {
      fail('That file is not a valid HabitFlow backup. Nothing was changed.', err);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-neutral-800/60 bg-neutral-950/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6 lg:max-w-6xl lg:px-8 xl:max-w-7xl 2xl:max-w-[1440px]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-500/15 ring-1 ring-green-500/30">
              <Flame className="h-5 w-5 text-green-400" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base font-semibold tracking-tight text-white">HabitFlow</h1>
              <p className="text-[0.6875rem] text-neutral-500">Track your daily routines</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 px-2.5 py-2 text-sm font-medium text-neutral-300 transition hover:border-neutral-700 hover:text-white sm:px-3"
              aria-label="Open timer"
            >
              <Timer className="h-4 w-4" />
              <span className="hidden sm:inline">Timer</span>
            </button>
            <button
              onClick={() => setAdding(true)}
              aria-label="New habit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-500 px-2.5 py-2 text-sm font-medium text-neutral-950 transition hover:bg-green-400"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Habit</span>
            </button>
            <MoreMenu
              onSaveBackup={saveBackup}
              onShareBackup={shareBackup}
              onRestoreBackup={() => fileRef.current?.click()}
              onExportCSV={downloadCSV}
              onAbout={() => setAboutOpen(true)}
              canExport={habits.length > 0}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:max-w-6xl lg:px-8 lg:py-10 xl:max-w-7xl 2xl:max-w-[1440px]">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_21rem] xl:gap-10">
        {/* Overview: sits beside the habits on a wide screen, above them on a phone */}
        <aside className="lg:order-2 lg:sticky lg:top-24">
        {/* Stats row */}
        <section className="mb-6 grid grid-cols-3 gap-3 sm:gap-4 lg:grid-cols-2">
          <div className="col-span-3 lg:col-span-2">
            <TodayRing done={todayCompleted} total={scheduledToday.length} />
          </div>
          <StatCard label="This Week" value={`${weekCompleted}`} sub={`of ${maxWeekChecks} checks`} />
          <StatCard label="Best Streak" value={`${topStreak}`} sub="days" />
          <div className="contents lg:block lg:col-span-2">
            <StatCard label="Habits" value={`${activeHabits.length}`} sub="tracking" />
          </div>
        </section>

        <WeeklyCard
          summary={weekly}
          nameOf={(id) => habits.find((h) => h.id === id)?.name ?? ''}
        />
        </aside>

        <div className="min-w-0 lg:order-1">

        {/* Week selector */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => {
              setWeekDir(-1);
              setWeekRef((r) => shiftWeek(r, -1));
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 text-neutral-400 transition hover:border-neutral-700 hover:text-white"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <p className="text-sm font-medium text-white">
              {shortDate(weekDays[0])} – {shortDate(weekDays[6])}
            </p>
            <p className="text-[0.6875rem] text-neutral-500">
              {weekDays.some((d) => isToday(d)) ? 'This week' : 'Viewing week'}
            </p>
          </div>
          <button
            onClick={() => {
              setWeekDir(1);
              setWeekRef((r) => shiftWeek(r, 1));
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 text-neutral-400 transition hover:border-neutral-700 hover:text-white"
            aria-label="Next week"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {noticeP.item && (
          <div className={`collapse${noticeP.closing ? ' closing' : ''}`}>
            <div>
              <div
                role="status"
                className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300"
              >
                <span>{noticeP.item}</span>
                <button
                  onClick={() => setNotice(null)}
                  className="text-xs font-medium text-green-200 underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {errorP.item && (
          <div className={`collapse${errorP.closing ? ' closing' : ''}`}>
            <div>
              <div
                role="alert"
                className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
              >
                <span>{errorP.item}</span>
                <button
                  onClick={() => setError(null)}
                  className="text-xs font-medium text-red-200 underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {nudgeP.item && (
          <div className={`collapse${nudgeP.closing ? ' closing' : ''}`}>
            <div>
              <div
                role="status"
                className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
              >
                <p>
                  {nudgeP.item.kind === 'stale'
                    ? `Your last backup was ${nudgeP.item.days} days ago. Save a new one so you don't lose recent progress.`
                    : "Your data is saved only on this phone. Save a backup so you don't lose it."}
                </p>
                <div className="mt-2 flex gap-4">
                  <button onClick={saveBackup} className="text-xs font-semibold text-amber-100 underline">
                    Save backup
                  </button>
                  <button
                    onClick={() => {
                      dismissNudge();
                      setNudge(null);
                    }}
                    className="text-xs font-medium text-amber-300/80 underline"
                  >
                    Later
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Trends and reorder */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            onClick={() => setTrendsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 transition hover:border-neutral-700 hover:text-white"
          >
            <TrendingUp className="h-4 w-4" /> Trends
          </button>
          {activeHabits.length >= 2 && (
            <button
              onClick={() => setReordering((r) => !r)}
              aria-pressed={reordering}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                reordering
                  ? 'border-green-500 bg-green-500/15 text-green-400'
                  : 'border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white'
              }`}
            >
              {reordering ? <CheckIcon className="h-4 w-4" /> : <ArrowUpDown className="h-4 w-4" />}
              {reordering ? 'Done' : 'Reorder'}
            </button>
          )}
        </div>

        {/* Habit grid */}
        {activeHabits.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 py-16 text-center">
            <Target className="mb-3 h-10 w-10 text-neutral-700" />
            <p className="text-sm font-medium text-neutral-300">
              {archivedHabits.length > 0 ? 'No active habits' : 'No habits yet'}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {archivedHabits.length > 0
                ? 'Restore one from Archived below, or add a new one.'
                : 'Add your first habit to start tracking.'}
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
          <>
            <p className="mb-3 text-center text-[0.6875rem] text-neutral-500">
              Tap a day to mark it done · hold a day, or tap today&apos;s total, to enter an amount
            </p>
            <div className="space-y-3 xl:grid xl:grid-cols-2 xl:items-start xl:gap-4 xl:space-y-0">
              {activeHabits.map((habit, i) => (
                <div
                  key={habit.id}
                  className="rise-anim"
                  style={{ '--d': `${Math.min(i, 6) * 45}ms` } as CSSProperties}
                >
                  <HabitRow
                    habit={habit}
                    weekDays={weekDays}
                    valueOn={valueOnFor(habit.id)}
                    allValues={entryMap[habit.id] ?? NO_VALUES}
                    streak={streaks[habit.id] ?? { current: 0, best: 0 }}
                    onToggle={(date) => toggleComplete(habit, date)}
                    onAmount={(date) => openAmount(habit, date)}
                    onEdit={() => setEditingId(habit.id)}
                    onCalendar={() => setCalendarId(habit.id)}
                    hasNote={(iso) => !!noteMap[habit.id]?.[iso]}
                    isSkipped={skippedFor(habit.id)}
                    slide={weekDir}
                    reorder={
                      reordering && activeHabits.length >= 2
                        ? {
                            canUp: i > 0,
                            canDown: i < activeHabits.length - 1,
                            onUp: () => moveHabit(habit, 'up'),
                            onDown: () => moveHabit(habit, 'down'),
                          }
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Archived habits */}
        {archivedHabits.length > 0 && (
          <section className="mt-8">
            <button
              onClick={() => setShowArchived((s) => !s)}
              aria-expanded={showArchived}
              className="flex w-full items-center justify-between rounded-xl border border-neutral-800 px-4 py-3 text-sm font-medium text-neutral-300 transition hover:border-neutral-700 hover:text-white"
            >
              <span className="flex items-center gap-2">
                <Archive className="h-4 w-4 text-neutral-500" />
                Archived ({archivedHabits.length})
              </span>
              <ChevronDown
                className={`h-4 w-4 text-neutral-500 transition-transform ${
                  showArchived ? 'rotate-180' : ''
                }`}
              />
            </button>
            <div className={`collapsible${showArchived ? ' open' : ''}`}>
              <div>
              <ul className="mt-2 space-y-2">
                {archivedHabits.map((habit) => {
                  const Icon = getHabitIcon(habit.icon);
                  return (
                    <li
                      key={habit.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800/60 bg-neutral-900/30 px-3 py-2.5"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg opacity-60"
                          style={{ backgroundColor: `${habit.color}1a`, color: habit.color }}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="truncate text-sm text-neutral-300">{habit.name}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => setArchived(habit, false)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-300 transition hover:text-white"
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                        </button>
                        <button
                          onClick={() => setEditingId(habit.id)}
                          aria-label={`Edit ${habit.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-800 hover:text-white"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
              </div>
            </div>
          </section>
        )}
        </div>
        </div>
      </main>

      {addP.item && (
        <HabitForm
          key={`add${addP.id}`}
          closing={addP.closing}
          onSave={addHabit}
          onClose={() => setAdding(false)}
        />
      )}

      {editP.item && (
        <HabitForm
          key={`edit${editP.id}`}
          closing={editP.closing}
          habit={editP.item}
          onSave={(data) => saveEdit(editP.item!, data)}
          onClose={() => setEditingId(null)}
          onArchive={() => setArchived(editP.item!, !editP.item!.archived)}
          onDelete={() => deleteHabit(editP.item!)}
        />
      )}

      {calendarP.item && (
        <HabitCalendar
          key={`cal${calendarP.id}`}
          closing={calendarP.closing}
          habit={calendarP.item}
          valueOn={valueOnFor(calendarP.item.id)}
          streak={streaks[calendarP.item.id] ?? { current: 0, best: 0 }}
          notes={noteMap[calendarP.item.id] ?? {}}
          isSkipped={skippedFor(calendarP.item.id)}
          onToggle={(iso) => toggleComplete(calendarP.item!, iso)}
          onAmount={(iso) => openAmount(calendarP.item!, iso)}
          onClose={() => setCalendarId(null)}
        />
      )}

      {amountP.item && (
        <AmountModal
          key={`amt${amountP.id}`}
          closing={amountP.closing}
          habit={amountP.item.habit}
          date={amountP.item.date}
          current={amountP.item.current}
          note={amountP.item.note}
          rest={amountP.item.rest}
          onSave={saveAmount}
          onClose={() => setAmountFor(null)}
        />
      )}

      {trendsP.item && (
        <TrendsModal
          key={`trends${trendsP.id}`}
          closing={trendsP.closing}
          habits={trendHabits}
          valueOn={(id, iso) => entryMap[id]?.[iso] ?? 0}
          skippedOn={skippedOn}
          onClose={() => setTrendsOpen(false)}
        />
      )}

      {aboutP.item && (
        <AboutModal
          key={`about${aboutP.id}`}
          closing={aboutP.closing}
          habitCount={habits.length}
          checkIns={entries.length}
          noteCount={notes.length}
          onClose={() => setAboutOpen(false)}
        />
      )}

      {timerP.item && (
        <TimerModal
          key={`timer${timerP.id}`}
          closing={timerP.closing}
          habits={activeHabits}
          onLogTime={logTime}
          onClose={() => setTimerOpen(false)}
        />
      )}
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
      className={`rounded-2xl border p-3 sm:p-4 ${
        accent ? 'border-green-500/30 bg-green-500/10' : 'border-neutral-800/60 bg-neutral-900/40'
      }`}
    >
      <p className="text-[0.6875rem] uppercase tracking-wider text-neutral-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${accent ? 'text-green-400' : 'text-white'}`}
      >
        {value}
      </p>
      <p className="text-[0.6875rem] text-neutral-500">{sub}</p>
    </div>
  );
}
