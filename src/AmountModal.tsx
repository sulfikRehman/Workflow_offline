import { useState } from 'react';
import type { FormEvent } from 'react';
import { getHabitIcon } from '@/lib/icons';
import { parseISODate, round2 } from '@/lib/stats';
import { todayISO } from '@/lib/date';
import { NOTE_MAX } from '@/lib/store';
import type { Habit } from '@/lib/store';
import { useEscape } from './useEscape';
import { backdropCls, sheetAnimCls } from './ui';

type Props = {
  habit: Habit;
  /** The day being logged, YYYY-MM-DD. */
  date: string;
  /** What is logged for that day right now. */
  current: number;
  /** The note saved for that day ('' if none). */
  note: string;
  /** Is this day marked as a rest day? */
  rest: boolean;
  onSave: (value: number, note: string, rest: boolean) => void;
  onClose: () => void;
  /** True while the window plays its closing animation. */
  closing?: boolean;
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

export default function AmountModal({
  habit,
  date,
  current,
  note: savedNote,
  rest: savedRest,
  onSave,
  onClose,
  closing,
}: Props) {
  const [text, setText] = useState(current > 0 ? String(round2(current)) : '');
  const [note, setNote] = useState(savedNote);
  const [rest, setRest] = useState(savedRest);
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
    onSave(round2(value), note.trim(), rest);
  }

  const chipCls =
    'flex-1 rounded-lg border border-neutral-800 py-2 text-xs font-medium text-neutral-300 hover:text-white';

  return (
    <div
      className={backdropCls(closing)}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className={`${sheetAnimCls(closing)} max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-neutral-800 bg-neutral-900 p-5 sm:rounded-2xl`}
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

        <label className="mb-1.5 mt-4 block text-xs font-medium text-neutral-400">
          Note (optional)
        </label>
        <textarea
          value={note}
          maxLength={NOTE_MAX}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. skipped, was sick"
          className="w-full resize-none rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-green-500 focus:outline-none"
        />
        <p className="mt-1 text-right text-[11px] tabular-nums text-neutral-600">
          {note.length}/{NOTE_MAX}
        </p>

        <label className="mt-3 flex items-start gap-2.5 rounded-lg border border-neutral-800 px-3 py-2.5">
          <input
            type="checkbox"
            checked={rest}
            onChange={(e) => setRest(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-green-500"
          />
          <span className="text-xs text-neutral-300">
            Rest day
            <span className="block text-[11px] text-neutral-500">
              Doesn&apos;t break your streak and isn&apos;t counted against you. If you reach the
              target anyway, it counts as done.
            </span>
          </span>
        </label>

        <div className="mt-3 flex gap-2">
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
