import { useState } from 'react';
import type { FormEvent } from 'react';
import { getHabitIcon } from '@/lib/icons';
import { parseISODate, round2 } from '@/lib/stats';
import { todayISO } from '@/lib/date';
import type { Habit } from '@/lib/store';
import { useEscape } from './useEscape';

type Props = {
  habit: Habit;
  /** The day being logged, YYYY-MM-DD. */
  date: string;
  /** What is logged for that day right now. */
  current: number;
  onSave: (value: number) => void;
  onClose: () => void;
};

const MAX = 100000;

function dayText(iso: string): string {
  if (iso === todayISO()) return 'Today';
  return parseISODate(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function AmountModal({ habit, date, current, onSave, onClose }: Props) {
  const [text, setText] = useState(current > 0 ? String(round2(current)) : '');
  const [error, setError] = useState<string | null>(null);
  const Icon = getHabitIcon(habit.icon);
  useEscape(onClose);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const value = text.trim() === '' ? 0 : Number(text);
    if (!Number.isFinite(value) || value < 0 || value > MAX) {
      setError(`Enter a number from 0 to ${MAX}.`);
      return;
    }
    onSave(round2(value));
  }

  const chipCls =
    'flex-1 rounded-lg border border-neutral-800 py-2 text-xs font-medium text-neutral-300 hover:text-white active:scale-95';

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
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${habit.color}1a`, color: habit.color }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-white">{habit.name}</h2>
            <p className="text-xs text-neutral-500">
              {dayText(date)} · target {round2(habit.target_value)} {habit.unit}
            </p>
          </div>
        </div>

        <label className="mb-1.5 mt-4 block text-xs font-medium text-neutral-400">
          How much did you do? ({habit.unit})
        </label>
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder="0"
          className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-lg text-white placeholder:text-neutral-600 focus:border-green-500 focus:outline-none"
        />
        {error && (
          <p role="alert" className="mt-1.5 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <button type="button" className={chipCls} onClick={() => setText('')}>
            Clear
          </button>
          <button
            type="button"
            className={chipCls}
            onClick={() => setText(String(round2(habit.target_value / 2)))}
          >
            Half
          </button>
          <button
            type="button"
            className={chipCls}
            onClick={() => setText(String(round2(habit.target_value)))}
          >
            Full ({round2(habit.target_value)})
          </button>
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
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
