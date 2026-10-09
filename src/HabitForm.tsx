import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Archive, ArchiveRestore, ChevronDown, Trash2 } from 'lucide-react';
import { getHabitIcon } from '@/lib/icons';
import { WEEK_ORDER } from '@/lib/stats';
import { HABIT_COLORS } from '@/lib/colors';
import { TEMPLATES } from '@/lib/templates';
import { GOAL_MAX } from '@/lib/store';
import type { Habit } from '@/lib/store';
import { useEscape } from './useEscape';
import { useDialog } from './useDialog';
import { backdropCls, sheetAnimCls } from './ui';

export type HabitFormData = {
  name: string;
  icon: string;
  unit: string;
  target_value: number;
  days: number[];
  color: string;
  /** Long-term goal in days, or null for none. */
  goal_days: number | null;
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
  const [color, setColor] = useState(habit?.color ?? HABIT_COLORS[0]);
  const [goalOn, setGoalOn] = useState(!!habit?.goal);
  const [goalText, setGoalText] = useState(String(habit?.goal?.days ?? 100));
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false); // icon, colour and long-term goal stay tucked away until asked for
  const uid = useId();
  const nameId = `${uid}-name`;
  const unitId = `${uid}-unit`;
  const targetId = `${uid}-target`;
  const moreId = `${uid}-more`;
  useEscape(onClose);
  const dlg = useDialog<HTMLFormElement>(editing ? 'Edit habit' : 'New habit');

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
    const goal = Number(goalText);
    if (goalOn && (!Number.isInteger(goal) || goal < 1 || goal > GOAL_MAX)) {
      setMore(true);
      return setError(`The goal must be a whole number of days from 1 to ${GOAL_MAX}.`);
    }
    onSave({
      name: name.trim(),
      icon,
      unit: unit.trim() || 'count',
      target_value: target,
      days,
      color,
      goal_days: goalOn ? goal : null,
    });
  }

  const preset = (list: number[]) => (
    <button
      type="button"
      onClick={() => setDays(list)}
      className="text-[0.6875rem] font-medium text-green-400 underline-offset-2 hover:underline"
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
        {...dlg}
        className={`${sheetAnimCls(closing)} focus:outline-none max-h-[95dvh] w-full max-w-md lg:max-w-lg overflow-y-auto rounded-t-2xl border border-neutral-800 bg-neutral-900 p-5 sm:rounded-2xl`}
      >
        <h2 className="text-base font-semibold text-white">
          {editing ? 'Edit Habit' : 'New Habit'}
        </h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          {editing ? 'Your history is kept when you change these.' : 'Add a habit to track.'}
        </p>

        <div className="mt-4 space-y-4">
          {!editing && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-400">Start from a template</p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATES.map((t) => {
                  const Ico = getHabitIcon(t.icon);
                  return (
                    <button
                      type="button"
                      key={t.name}
                      onClick={() => {
                        setName(t.name);
                        setIcon(t.icon);
                        setUnit(t.unit);
                        setTargetText(String(t.target_value));
                        setColor(t.color);
                        setError(null);
                      }}
                      className="hit inline-flex items-center gap-1.5 rounded-full border border-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-neutral-600 hover:text-white"
                    >
                      <Ico className="h-3.5 w-3.5" style={{ color: t.color }} />
                      {t.name}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[0.6875rem] text-neutral-500">
                Tap one to fill in the form, then change anything you like.
              </p>
            </div>
          )}

          <div>
            <label htmlFor={nameId} className="mb-1.5 block text-xs font-medium text-neutral-400">Name</label>
            <input
              id={nameId}
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
              <label htmlFor={unitId} className="mb-1.5 block text-xs font-medium text-neutral-400">Unit</label>
              <input
                id={unitId}
                value={unit}
                maxLength={12}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="min, hrs, pages..."
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor={targetId} className="mb-1.5 block text-xs font-medium text-neutral-400">
                Daily Target
              </label>
              <input
                id={targetId}
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
            <p className="-mt-2 text-[0.6875rem] text-amber-400">
              Changing the target also changes which past days count as done.
            </p>
          )}

          <div role="group" aria-labelledby={`${uid}-days`}>
            <div className="mb-1.5 flex items-center justify-between">
              <span id={`${uid}-days`} className="block text-xs font-medium text-neutral-400">Days</span>
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
                    className={`rounded-lg border py-2 text-xs font-medium transition ${
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
            <p className="mt-1.5 text-[0.6875rem] text-neutral-500">
              Days the habit isn&apos;t scheduled don&apos;t break your streak.
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setMore((m) => !m)}
              aria-expanded={more}
              aria-controls={moreId}
              className="flex w-full items-center justify-between rounded-lg border border-neutral-800 px-3 py-2.5 text-left text-xs font-medium text-neutral-300 transition hover:border-neutral-700 hover:text-white"
            >
              <span>
                More options
                <span className="ml-1.5 font-normal text-neutral-500">icon, colour, long-term goal</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${more ? 'rotate-180' : ''}`} />
            </button>
            <div id={moreId} className={`collapsible${more ? ' open' : ''}`}>
              <div>
                <div className="space-y-4 pt-4">
                <div role="group" aria-labelledby={`${uid}-icon`}>
                  <span id={`${uid}-icon`} className="mb-1.5 block text-xs font-medium text-neutral-400">Icon</span>
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

                <div role="group" aria-labelledby={`${uid}-colour`}>
                  <span id={`${uid}-colour`} className="mb-1.5 block text-xs font-medium text-neutral-400">Colour</span>
                  <div className="grid grid-cols-6 gap-2">
                    {HABIT_COLORS.map((c) => {
                      const sel = c.toLowerCase() === color.toLowerCase();
                      return (
                        <button
                          type="button"
                          key={c}
                          onClick={() => setColor(c)}
                          aria-pressed={sel}
                          aria-label={`Colour ${c}`}
                          className={`flex h-9 items-center justify-center rounded-lg border transition ${
                            sel ? 'border-white' : 'border-neutral-800 hover:border-neutral-600'
                          }`}
                        >
                          <span
                            className="h-5 w-5 rounded-full transition-transform duration-200"
                            style={{ backgroundColor: c, transform: sel ? 'scale(1.2)' : 'scale(1)' }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-neutral-400">
                    <input
                      type="checkbox"
                      checked={goalOn}
                      onChange={(e) => setGoalOn(e.target.checked)}
                      className="h-4 w-4 accent-green-500"
                    />
                    Long-term goal
                  </label>
                  <div className={`collapsible${goalOn ? ' open' : ''}`}>
                    <div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="shrink-0 text-xs text-neutral-400">Reach the target on</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={GOAL_MAX}
                          step={1}
                          value={goalText}
                          disabled={!goalOn}
                          onChange={(e) => {
                            setGoalText(e.target.value);
                            setError(null);
                          }}
                          aria-label="Goal in days"
                          className={`${inputCls} text-center`}
                        />
                        <span className="shrink-0 text-xs text-neutral-400">days</span>
                      </div>
                      <p className="mt-1.5 text-[0.6875rem] text-neutral-500">
                        {habit?.goal
                          ? `Counting days since ${habit.goal.start}. Changing the number keeps that start day.`
                          : 'Counts the days you reach the daily target, starting from the day you set the goal.'}
                      </p>
                    </div>
                  </div>
                </div>
                </div>
              </div>
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
            <p className="mt-2 text-[0.6875rem] text-neutral-500">
              Archiving hides the habit but keeps its history. Deleting removes it for good.
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
