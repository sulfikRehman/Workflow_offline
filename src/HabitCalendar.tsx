import { useState } from 'react';
import { ChevronLeft, ChevronRight, Flame, X } from 'lucide-react';
import { getHabitIcon } from '@/lib/icons';
import { toISODate, todayISO } from '@/lib/date';
import {
  WEEK_ORDER,
  isActiveDay,
  monthSummary,
  monthWeeks,
  parseISODate,
  round2,
  scheduleLabel,
} from '@/lib/stats';
import type { Habit } from '@/lib/store';
import LongPressButton from './LongPressButton';
import { useEscape } from './useEscape';
import { backdropCls, sheetAnimCls } from './ui';

type Props = {
  habit: Habit;
  /** How much is logged on a date (YYYY-MM-DD); 0 when nothing is. */
  valueOn: (iso: string) => number;
  streak: { current: number; best: number };
  onToggle: (iso: string) => void;
  onAmount: (iso: string) => void;
  /** Notes for this habit, date (YYYY-MM-DD) -> text. */
  notes: Record<string, string>;
  /** Is this date marked as a rest day? */
  isSkipped: (iso: string) => boolean;
  onClose: () => void;
  /** True while the window plays its closing animation. */
  closing?: boolean;
};

const HEAD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function HabitCalendar({
  habit,
  valueOn,
  streak,
  onToggle,
  onAmount,
  notes,
  isSkipped,
  onClose,
  closing,
}: Props) {
  const now = new Date();
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const Icon = getHabitIcon(habit.icon);
  useEscape(onClose);

  const today = todayISO();
  const atCurrentMonth = view.y === now.getFullYear() && view.m === now.getMonth();
  const weeks = monthWeeks(view.y, view.m);
  const summary = monthSummary(habit, valueOn, view.y, view.m, now, (iso) => isSkipped(iso));
  const monthPrefix = `${view.y}-${String(view.m + 1).padStart(2, '0')}-`;
  const monthNotes = Object.keys(notes)
    .filter((iso) => iso.startsWith(monthPrefix))
    .sort();
  const title = new Date(view.y, view.m, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  function go(delta: number) {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  const navCls =
    'flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 text-neutral-400 transition hover:border-neutral-700 hover:text-white disabled:opacity-30 disabled:hover:border-neutral-800 disabled:hover:text-neutral-400';

  return (
    <div
      className={backdropCls(closing)}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`${sheetAnimCls(closing)} max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-neutral-800 bg-neutral-900 p-5 sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${habit.color}1a`, color: habit.color }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-white">{habit.name}</h2>
              <p className="text-xs text-neutral-500">
                Target {round2(habit.target_value)} {habit.unit}
                {scheduleLabel(habit.days) ? ` · ${scheduleLabel(habit.days)}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close calendar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500">Streak</p>
            <p className="mt-0.5 flex items-center gap-1 text-lg font-bold tabular-nums text-white">
              <Flame
                className={`h-4 w-4 ${streak.current > 0 ? 'text-green-400' : 'text-neutral-600'}`}
              />
              {streak.current}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500">Best</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-white">{streak.best}</p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500">This month</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-white">
              {summary.done}
              <span className="text-sm font-medium text-neutral-500">/{summary.scheduled}</span>
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button onClick={() => go(-1)} aria-label="Previous month" className={navCls}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <p className="text-sm font-medium text-white">{title}</p>
            <p className="text-[11px] text-neutral-500">
              {summary.scheduled > 0 ? `${summary.pct}% of scheduled days done` : 'No scheduled days yet'}
            </p>
          </div>
          <button
            onClick={() => go(1)}
            disabled={atCurrentMonth}
            aria-label="Next month"
            className={navCls}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1.5 text-center">
          {HEAD.map((h) => (
            <span key={h} className="text-[10px] font-medium text-neutral-500">
              {h}
            </span>
          ))}
        </div>

        <div key={`${view.y}-${view.m}`} className="fade-anim mt-1.5 space-y-1.5" role="grid" aria-label={title}>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1.5">
              {week.map((d, di) => {
                if (!d) return <span key={di} />;
                const iso = toISODate(d);
                const future = iso > today;
                const val = valueOn(iso);
                const done = val >= habit.target_value;
                const partial = val > 0 && !done;
                const scheduled = isActiveDay(habit, d);
                const rest = isSkipped(iso) && !done;
                const isToday = iso === today;
                return (
                  <LongPressButton
                    key={di}
                    disabled={future}
                    onTap={() => onToggle(iso)}
                    onLong={() => onAmount(iso)}
                    title={`${iso}: ${round2(val)} / ${round2(habit.target_value)} ${habit.unit}`}
                    aria-label={`${iso}, ${done ? 'done' : partial ? 'partly done' : 'not done'}${
                      notes[iso] ? ', has a note' : ''
                    }${rest ? ', rest day' : ''}`}
                    className={`flex aspect-square items-center justify-center rounded-lg border text-xs font-medium tabular-nums transition active:scale-95 disabled:cursor-default disabled:opacity-25 ${
                      done ? 'border-transparent text-neutral-950' : 'text-neutral-300'
                    } ${
                      done || partial
                        ? ''
                        : scheduled && !rest
                          ? 'border-neutral-800'
                          : 'border-dashed border-neutral-800 opacity-50'
                    } ${partial ? 'border-transparent' : ''} ${
                      isToday ? 'ring-2 ring-green-500 ring-offset-1 ring-offset-neutral-900' : ''
                    }`}
                  >
                    <span
                      className="relative flex h-full w-full items-center justify-center rounded-lg transition-colors duration-200"
                      style={{
                        backgroundColor: done
                          ? habit.color
                          : partial
                            ? `${habit.color}40`
                            : 'transparent',
                      }}
                    >
                      {d.getDate()}
                      {notes[iso] && (
                        <span
                          aria-hidden="true"
                          className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400"
                        />
                      )}
                      {rest && (
                        <span
                          aria-hidden="true"
                          className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-sky-400"
                        />
                      )}
                    </span>
                  </LongPressButton>
                );
              })}
            </div>
          ))}
        </div>

        {monthNotes.length > 0 && (
          <div key={`n-${view.y}-${view.m}`} className="fade-anim mt-4">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              Notes this month
            </p>
            <ul className="space-y-1.5">
              {monthNotes.map((iso) => (
                <li
                  key={iso}
                  className="rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 py-2 text-xs"
                >
                  <span className="mr-2 font-medium tabular-nums text-amber-300">
                    {parseISODate(iso).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="whitespace-pre-wrap break-words text-neutral-300">
                    {notes[iso]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-3 text-center text-[11px] text-neutral-500">
          Tap a day to mark it done · hold it to enter an amount or a note. Dashed days aren&apos;t scheduled. Amber dot = note, blue dot = rest day.
        </p>
      </div>
    </div>
  );
}
