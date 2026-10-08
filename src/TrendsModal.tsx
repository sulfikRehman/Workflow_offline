import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { getHabitIcon } from '@/lib/icons';
import { completionBuckets, overallPct, parseISODate } from '@/lib/stats';
import type { Bucket, ChartHabit } from '@/lib/stats';
import type { Habit } from '@/lib/store';
import { useEscape } from './useEscape';
import { backdropCls, sheetAnimCls } from './ui';

export type TrendHabit = ChartHabit & Pick<Habit, 'name' | 'icon' | 'color' | 'unit'>;

type Props = {
  habits: TrendHabit[];
  valueOn: (habitId: string, iso: string) => number;
  /** Is this date a rest day for the habit? */
  skippedOn: (habitId: string, iso: string) => boolean;
  onClose: () => void;
  /** True while the window plays its closing animation. */
  closing?: boolean;
};

type RangeKey = 'week' | 'month' | 'weeks';

const RANGES: { key: RangeKey; label: string; size: number; count: number; text: string }[] = [
  { key: 'week', label: 'Week', size: 1, count: 7, text: 'last 7 days' },
  { key: 'month', label: 'Month', size: 1, count: 30, text: 'last 30 days' },
  { key: 'weeks', label: '8 weeks', size: 7, count: 8, text: 'last 8 weeks' },
];

const W = 320;
const H = 150;
const PAD_L = 28;
const PAD_B = 18;
const PAD_T = 8;

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayName(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function describe(b: Bucket, size: number): string {
  const when = size === 1 ? dayName(b.start) : `${shortDay(b.start)} – ${shortDay(b.end)}`;
  if (b.pct === null) return `${when}: nothing scheduled`;
  return `${when}: ${b.done} of ${b.scheduled} done (${b.pct}%)`;
}

function shortDay(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Chart({
  buckets,
  size,
  selected,
  onSelect,
}: {
  buckets: Bucket[];
  size: number;
  selected: number;
  onSelect: (i: number) => void;
}) {
  const plotW = W - PAD_L - 4;
  const plotH = H - PAD_T - PAD_B;
  const slot = plotW / buckets.length;
  const barW = Math.max(3, slot * (buckets.length > 14 ? 0.7 : 0.55));
  const y = (pct: number) => PAD_T + plotH * (1 - pct / 100);
  const every = buckets.length > 14 ? 5 : 1;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Completion chart. Tap a bar for details."
    >
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line
            x1={PAD_L}
            x2={W - 4}
            y1={y(g)}
            y2={y(g)}
            className="stroke-neutral-800"
            strokeWidth={1}
            strokeDasharray={g === 0 ? undefined : '3 3'}
          />
          <text x={PAD_L - 5} y={y(g) + 3} textAnchor="end" fontSize={9} className="fill-neutral-500">
            {g}%
          </text>
        </g>
      ))}
      {buckets.map((b, i) => {
        const cx = PAD_L + slot * i + slot / 2;
        const h = b.pct === null ? 0 : (plotH * b.pct) / 100;
        const isSel = i === selected;
        const showLabel = (buckets.length - 1 - i) % every === 0;
        const label =
          size === 1 && buckets.length <= 7
            ? DOW[parseISODate(b.start).getDay()].slice(0, 2)
            : size === 1
              ? String(parseISODate(b.start).getDate())
              : shortDay(b.start);
        return (
          <g
            key={b.start}
            onClick={() => onSelect(i)}
            style={{ cursor: 'pointer' }}
            aria-label={describe(b, size)}
          >
            {/* wide invisible target so thin bars are easy to tap */}
            <rect x={cx - slot / 2} y={PAD_T} width={slot} height={plotH + PAD_B} fill="transparent" />
            {b.pct === null ? (
              <rect x={cx - barW / 2} y={y(0) - 2} width={barW} height={2} rx={1} className="fill-neutral-700" />
            ) : (
              <rect
                x={cx - barW / 2}
                y={y(b.pct)}
                width={barW}
                height={Math.max(h, 2)}
                rx={Math.min(3, barW / 2)}
                fill={isSel ? '#4ade80' : '#22c55e'}
                opacity={isSel ? 1 : 0.7}
                style={{ transition: 'opacity 200ms, fill 200ms' }}
              />
            )}
            {showLabel && (
              <text
                x={cx}
                y={H - 4}
                textAnchor="middle"
                fontSize={buckets.length > 14 ? 8 : 9}
                className={isSel ? 'fill-neutral-200' : 'fill-neutral-500'}
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function TrendsModal({ habits, valueOn, skippedOn, onClose, closing }: Props) {
  const [rangeKey, setRangeKey] = useState<RangeKey>('week');
  const range = RANGES.find((r) => r.key === rangeKey)!;
  const [selected, setSelected] = useState(RANGES[0].count - 1);
  useEscape(onClose);

  function pickRange(key: RangeKey) {
    const r = RANGES.find((x) => x.key === key)!;
    setRangeKey(key);
    setSelected(r.count - 1);
  }

  const data = useMemo(() => {
    const end = new Date();
    const span = range.size * range.count;
    const prevEnd = new Date(end);
    prevEnd.setDate(prevEnd.getDate() - span);
    const buckets = completionBuckets(habits, valueOn, end, range.size, range.count, new Date(), skippedOn);
    const prev = completionBuckets(habits, valueOn, prevEnd, range.size, range.count, new Date(), skippedOn);
    const perHabit = habits.map((h) => {
      const one = completionBuckets([h], valueOn, end, span, 1, new Date(), skippedOn)[0];
      return { habit: h, ...one };
    });
    return { buckets, now: overallPct(buckets), before: overallPct(prev), perHabit };
  }, [habits, valueOn, skippedOn, range]);

  const delta = data.now !== null && data.before !== null ? data.now - data.before : null;
  const sel = data.buckets[Math.min(selected, data.buckets.length - 1)];

  return (
    <div className={backdropCls(closing)} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`${sheetAnimCls(closing)} max-h-[95dvh] w-full max-w-md lg:max-w-xl overflow-y-auto rounded-t-2xl border border-neutral-800 bg-neutral-900 p-5 sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Trends</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Share of scheduled habit-days where you reached the daily target.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close trends"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex gap-1 rounded-lg border border-neutral-800 p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => pickRange(r.key)}
              aria-pressed={r.key === rangeKey}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors duration-200 ${
                r.key === rangeKey
                  ? 'bg-green-500 text-neutral-950'
                  : 'text-neutral-300 hover:bg-neutral-800'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {habits.length === 0 ? (
          <p className="mt-6 text-center text-sm text-neutral-500">
            Add a habit to see your trends.
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <p className="text-[0.625rem] uppercase tracking-wider text-neutral-500">
                  {range.text}
                </p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-white">
                  {data.now === null ? '–' : `${data.now}%`}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <p className="text-[0.625rem] uppercase tracking-wider text-neutral-500">
                  vs the period before
                </p>
                <p
                  className={`mt-0.5 text-2xl font-bold tabular-nums ${
                    delta === null || delta === 0
                      ? 'text-neutral-300'
                      : delta > 0
                        ? 'text-green-400'
                        : 'text-red-400'
                  }`}
                >
                  {delta === null ? '–' : `${delta > 0 ? '+' : ''}${delta}`}
                  {delta !== null && <span className="text-sm font-medium"> pts</span>}
                </p>
              </div>
            </div>

            <div key={rangeKey} className="fade-anim mt-4">
              <Chart
                buckets={data.buckets}
                size={range.size}
                selected={Math.min(selected, data.buckets.length - 1)}
                onSelect={setSelected}
              />
              <p className="mt-1 min-h-[1.25rem] text-center text-xs text-neutral-300" role="status">
                {sel ? describe(sel, range.size) : ''}
              </p>
            </div>

            <p className="mb-2 mt-4 text-[0.6875rem] font-medium uppercase tracking-wider text-neutral-500">
              By habit · {range.text}
            </p>
            <ul className="space-y-2">
              {data.perHabit.map(({ habit, pct, done, scheduled }) => {
                const Icon = getHabitIcon(habit.icon);
                return (
                  <li key={habit.id}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-2 text-neutral-200">
                        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: habit.color }} />
                        <span className="truncate">{habit.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-neutral-400">
                        {pct === null ? 'not scheduled' : `${done}/${scheduled} · ${pct}%`}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                      <div
                        className="fill h-full rounded-full"
                        style={{
                          transform: `translateX(${(pct ?? 0) - 100}%)`,
                          backgroundColor: habit.color,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-[0.6875rem] leading-relaxed text-neutral-500">
              Days before a habit existed, days it isn&apos;t scheduled and rest days are left out. Today
              counts as it stands now.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
