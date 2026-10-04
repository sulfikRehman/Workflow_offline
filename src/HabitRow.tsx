import { CalendarDays, Check, Flame, Pencil, TrendingUp } from 'lucide-react';
import { getHabitIcon } from '@/lib/icons';
import { dayLabel, isToday, toISODate, todayISO } from '@/lib/date';
import { activeDaysIn, isActiveDay, round2, scheduleLabel } from '@/lib/stats';
import type { Habit } from '@/lib/store';
import LongPressButton from './LongPressButton';

function pct(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((value / target) * 100));
}

type Props = {
  habit: Habit;
  weekDays: Date[];
  /** How much is logged on a date (YYYY-MM-DD); 0 when nothing is. */
  valueOn: (iso: string) => number;
  streak: { current: number; best: number };
  /** Tap on a day: mark done / not done. */
  onToggle: (iso: string) => void;
  /** Hold on a day (or tap today's total): enter an amount. */
  onAmount: (iso: string) => void;
  onEdit: () => void;
  onCalendar: () => void;
};

export default function HabitRow({
  habit,
  weekDays,
  valueOn,
  streak,
  onToggle,
  onAmount,
  onEdit,
  onCalendar,
}: Props) {
  const Icon = getHabitIcon(habit.icon);
  const weekVals = weekDays.map((d) => valueOn(toISODate(d)));
  const weekTotal = weekVals.reduce((a, b) => a + b, 0);
  const weekTarget = habit.target_value * activeDaysIn(habit, weekDays);
  const weekPct = pct(weekTotal, weekTarget);
  const todayVal = valueOn(todayISO());
  const todayPct = pct(todayVal, habit.target_value);
  const schedule = scheduleLabel(habit.days);
  const iconBtn =
    'flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-800 hover:text-white active:scale-95';

  return (
    <div className="rounded-2xl border border-neutral-800/60 bg-neutral-900/40 p-4 transition hover:border-neutral-700/70">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${habit.color}1a`, color: habit.color }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-white">{habit.name}</h3>
            <p className="truncate text-[11px] text-neutral-500">
              Target: {round2(habit.target_value)} {habit.unit}/day
              {schedule ? ` · ${schedule}` : ''}
            </p>
          </div>
        </div>
        <button
          onClick={() => onAmount(todayISO())}
          aria-label={`Enter today's amount for ${habit.name}`}
          className="shrink-0 rounded-lg px-2 py-1 text-right transition hover:bg-neutral-800 active:scale-95"
        >
          <p className="text-sm font-semibold tabular-nums text-green-400">
            {round2(todayVal)}
            <span className="text-neutral-500"> / {round2(habit.target_value)}</span>
          </p>
          <p className="text-[11px] text-neutral-500">{habit.unit} today</p>
        </button>
      </div>

      {/* Today progress bar */}
      <div className="mt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${todayPct}%`, backgroundColor: habit.color }}
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
          const scheduled = isActiveDay(habit, d);
          return (
            <LongPressButton
              key={iso}
              onTap={() => onToggle(iso)}
              onLong={() => onAmount(iso)}
              className={`flex flex-col items-center gap-1 rounded-lg border py-2 transition active:scale-95 ${
                today ? 'border-green-500/40' : 'border-neutral-800/50 hover:border-neutral-700'
              } ${done ? 'bg-green-500/15' : 'bg-neutral-900/30'} ${scheduled ? '' : 'opacity-50'}`}
              title={`${round2(val)} / ${round2(habit.target_value)} ${habit.unit}${
                scheduled ? '' : ' (not scheduled)'
              }`}
              aria-label={`${iso}: ${round2(val)} of ${round2(habit.target_value)} ${habit.unit}`}
            >
              <span
                className={`text-[10px] font-medium ${today ? 'text-green-400' : 'text-neutral-500'}`}
              >
                {dayLabel(d)}
              </span>
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] ${
                  done ? 'text-neutral-950' : partial ? 'text-white' : 'text-neutral-600'
                }`}
                style={{
                  backgroundColor: done ? habit.color : partial ? `${habit.color}33` : 'transparent',
                }}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : partial ? Math.round(val) : ''}
              </span>
              <span className="text-[9px] text-neutral-600">{d.getDate()}</span>
            </LongPressButton>
          );
        })}
      </div>

      {/* Week summary */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-500">
        <span className="flex items-center gap-1">
          <TrendingUp className="h-3.5 w-3.5 text-neutral-600" />
          {round2(weekTotal)} / {round2(weekTarget)} {habit.unit} this week
        </span>
        <span className="tabular-nums">{weekPct}%</span>
      </div>

      {/* Streak + actions */}
      <div className="mt-3 flex items-center justify-between border-t border-neutral-800/60 pt-3">
        <span
          className={`flex items-center gap-1.5 text-xs ${
            streak.current > 0 ? 'text-green-400' : 'text-neutral-500'
          }`}
        >
          <Flame className="h-3.5 w-3.5" />
          {streak.current > 0
            ? `${streak.current} ${streak.current === 1 ? 'day' : 'days'} streak`
            : 'No streak yet'}
          <span className="text-neutral-500">· best {streak.best}</span>
        </span>
        <span className="flex items-center gap-1">
          <button onClick={onCalendar} aria-label={`Open calendar for ${habit.name}`} className={iconBtn}>
            <CalendarDays className="h-4 w-4" />
          </button>
          <button onClick={onEdit} aria-label={`Edit ${habit.name}`} className={iconBtn}>
            <Pencil className="h-4 w-4" />
          </button>
        </span>
      </div>
    </div>
  );
}
