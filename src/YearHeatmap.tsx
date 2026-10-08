import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { heatColor, heatLevel, yearGrid } from '@/lib/heatmap';
import { isActiveDay, round2 } from '@/lib/stats';
import type { Habit } from '@/lib/store';

type Props = {
  habit: Habit;
  /** How much is logged on a date (YYYY-MM-DD); 0 when nothing is. */
  valueOn: (iso: string) => number;
  /** Is this date marked as a rest day? */
  isSkipped: (iso: string) => boolean;
};

const ROW_LABEL = ['Mon', '', 'Wed', '', 'Fri', '', ''];

/** The last year at a glance: one square per day, in the habit's own colour. */
export default function YearHeatmap({ habit, valueOn, isSkipped }: Props) {
  const grid = useMemo(() => yearGrid(new Date()), []);
  const [sel, setSel] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  // Squares keep a readable size; on a narrow screen the grid scrolls sideways, starting at today.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    setScrollable(el.scrollWidth > el.clientWidth + 1);
  }, []);

  let doneDays = 0;
  for (const col of grid.columns) {
    for (const c of col) if (!c.future && habit.target_value > 0 && valueOn(c.iso) >= habit.target_value) doneDays++;
  }

  const selected = sel ? grid.columns.flat().find((c) => c.iso === sel) : undefined;
  const selVal = selected ? valueOn(selected.iso) : 0;
  const colCount = grid.columns.length + 1;

  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-white">Last 12 months</p>
      <p className="text-[0.6875rem] text-neutral-500">
        {doneDays} {doneDays === 1 ? 'day' : 'days'} with the target reached
      </p>

      <div ref={scroller} className="mt-3 overflow-x-auto pb-1">
      <div
        className="text-white"
        role="img"
        aria-label={`Year view for ${habit.name}: ${doneDays} days with the target reached`}
        onClick={(e) => {
          const iso = (e.target as HTMLElement).dataset?.iso;
          if (iso) setSel((s) => (s === iso ? null : iso));
        }}
        style={{
          display: 'grid',
          gridTemplateRows: 'repeat(8, auto)',
          gridTemplateColumns: `auto repeat(${colCount - 1}, minmax(0, 1fr))`,
          gridAutoFlow: 'column',
          gap: 2,
          minWidth: 640,
        }}
      >
        {/* first column: weekday names */}
        <span />
        {ROW_LABEL.map((l, i) => (
          <span key={i} className="pr-1.5 text-right text-[0.5625rem] leading-none text-neutral-500" style={{ alignSelf: 'center' }}>
            {l}
          </span>
        ))}
        {grid.columns.map((col, ci) => {
          const month = grid.months.find((m) => m.col === ci);
          return [
            <span key={`m${ci}`} className="relative">
              {month && (
                <span className="absolute left-0 top-0 whitespace-nowrap text-[0.5625rem] leading-none text-neutral-500">
                  {month.label}
                </span>
              )}
            </span>,
            ...col.map((c) => {
              const val = c.future ? 0 : valueOn(c.iso);
              const level = heatLevel(val, habit.target_value);
              const color = heatColor(habit.color, level);
              const scheduled = isActiveDay(habit, c.date);
              const rest = !c.future && level < 3 && isSkipped(c.iso);
              return (
                <div
                  key={c.iso}
                  data-iso={c.iso}
                  data-level={level}
                  className={`aspect-square rounded-[2px] ${color ? '' : 'bg-neutral-800'} ${
                    c.future ? 'opacity-30' : !scheduled && level === 0 ? 'opacity-40' : ''
                  }`}
                  style={{
                    backgroundColor: color,
                    boxShadow: rest ? 'inset 0 0 0 1px rgb(56 189 248 / 0.8)' : undefined,
                    outline: sel === c.iso ? '1.5px solid currentColor' : undefined,
                    outlineOffset: sel === c.iso ? 1 : undefined,
                  }}
                />
              );
            }),
          ];
        })}
      </div>
      </div>
      {scrollable && (
        <p className="mt-1 text-[0.6875rem] text-neutral-500">Swipe sideways for earlier months.</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 text-[0.6875rem] text-neutral-500">
        <p className="min-h-[2.25em] min-w-0 flex-1" aria-live="polite">
          {selected ? (
            <>
              <span className="font-medium text-neutral-300">
                {selected.date.toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
              {' · '}
              {selected.future
                ? 'later'
                : `${round2(selVal)} / ${round2(habit.target_value)} ${habit.unit}`}
              {isSkipped(selected.iso) ? ' · rest day' : ''}
              {!isActiveDay(habit, selected.date) ? ' · not scheduled' : ''}
            </>
          ) : (
            'Tap a square to see that day.'
          )}
        </p>
        <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
          Less
          <span className="h-2.5 w-2.5 rounded-[2px] bg-neutral-800" />
          {([1, 2, 3] as const).map((l) => (
            <span
              key={l}
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ backgroundColor: heatColor(habit.color, l) }}
            />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
