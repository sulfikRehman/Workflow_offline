import { useState } from 'react';
import type { FormEvent } from 'react';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { getHabitIcon } from '@/lib/icons';
import { WEEK_ORDER } from '@/lib/stats';
import type { Habit } from '@/lib/store';
import { useEscape } from './useEscape';
import { backdropCls, sheetAnimCls } from './ui';

export type HabitFormData = {
  name: string;
  icon: string;
  unit: string;
  target_value: number;
  days: number[];
};

type Props = {
  /** Pass a habit to edit it; leave out to add a new one. */
  habit?: Habit;
  onSave: (data: HabitFormData) => void;
  onClose: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  /** True while the window plays its closing animation. */
  closing?: boolean;
};

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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const inputCls =
  'w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-green-500 focus:outline-none';

export default function HabitForm({
  habit,
  onSave,
  onClose,
  onArchive,
  onDelete,
  closing,
}: Props) {
  const editing = !!habit;
  const [name, setName] = useState(habit?.name ?? '');
  const [unit, setUnit] = useState(habit?.unit ?? 'min');
  const [targetText, setTargetText] = useState(String(habit?.target_value ?? 30));
  const [icon, setIcon] = useState(habit?.icon ?? 'BookOpen');
  const [days, setDays] = useState<number[]>(habit?.days ?? ALL_DAYS);
  const [error, setError] = useState<string | null>(null);
  useEscape(onClose);

  const target = Number(targetText);
  const targetChanged = editing && Number.isFinite(target) && target !== habit.target_value;

  function toggleDay(d: number) {
    setDays((prev) =>
      prev.includes(d) ? (prev.length > 1 ? prev.filter((x) => x !== d) : prev) : [...prev, d]
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Give the habit a name.');
    if (!Number.isFinite(target) || target <= 0) {
      return setError('The daily target must be more than 0.');
    }
    onSave({
      name: name.trim(),
      icon,
      unit: unit.trim() || 'count',
      target_value: target,
      days,
    });
  }

  const preset = (list: number[]) => (
    <button
      type="button"
      onClick={() => setDays(list)}
      className="text-[11px] font-medium text-green-400 underline-offset-2 hover:underline"
    >
      {list.length === 7 ? 'Every day' : 'Weekdays'}
    </button>
  );

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
        <h2 className="text-base font-semibold text-white">
          {editing ? 'Edit Habit' : 'New Habit'}
        </h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          {editing ? 'Your history is kept when you change these.' : 'Add a habit to track.'}
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">Name</label>
            <input
              autoFocus={!editing}
              value={name}
              maxLength={40}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. Meditation"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-400">Unit</label>
              <input
                value={unit}
                maxLength={12}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="min, hrs, pages..."
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-400">
                Daily Target
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={targetText}
                onChange={(e) => {
                  setTargetText(e.target.value);
                  setError(null);
                }}
                className={inputCls}
              />
            </div>
          </div>
          {targetChanged && (
            <p className="-mt-2 text-[11px] text-amber-400">
              Changing the target also changes which past days count as done.
            </p>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-xs font-medium text-neutral-400">Days</label>
              <span className="flex gap-3">
                {preset(ALL_DAYS)}
                {preset([1, 2, 3, 4, 5])}
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEK_ORDER.map((d) => {
                const on = days.includes(d);
                return (
                  <button
                    type="button"
                    key={d}
                    onClick={() => toggleDay(d)}
                    aria-pressed={on}
                    className={`rounded-lg border py-2 text-xs font-medium transition active:scale-95 ${
                      on
                        ? 'border-green-500 bg-green-500/15 text-green-400'
                        : 'border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-white'
                    }`}
                  >
                    {DAY_NAMES[d]}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500">
              Days the habit isn&apos;t scheduled don&apos;t break your streak.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">Icon</label>
            <div className="grid grid-cols-7 gap-1.5">
              {ICON_OPTIONS.map((ic) => {
                const Ico = getHabitIcon(ic);
                const sel = ic === icon;
                return (
                  <button
                    type="button"
                    key={ic}
                    onClick={() => setIcon(ic)}
                    aria-pressed={sel}
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

        {error && (
          <p role="alert" className="mt-3 text-xs text-red-400">
            {error}
          </p>
        )}

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
            {editing ? 'Save' : 'Add Habit'}
          </button>
        </div>

        {editing && (
          <div className="mt-4 border-t border-neutral-800 pt-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={onArchive}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-800 px-3 py-2 text-sm font-medium text-neutral-300 transition hover:text-white"
              >
                {habit.archived ? (
                  <ArchiveRestore className="h-4 w-4" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                {habit.archived ? 'Restore' : 'Archive'}
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">
              Archiving hides the habit but keeps its history. Deleting removes it for good.
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
