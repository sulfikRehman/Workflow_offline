import type { WeeklySummary } from '@/lib/stats';

type Props = {
  summary: WeeklySummary;
  /** Habit name for an id. */
  nameOf: (id: string) => string;
};

/** "This week vs last week" card shown under the stats row. */
export default function WeeklyCard({ summary, nameOf }: Props) {
  const { thisWeek, lastWeek, delta, best, needsAttention } = summary;
  if (thisWeek.pct === null) return null;
  const deltaText =
    delta === null ? null : delta === 0 ? 'same as last week' : `${delta > 0 ? '+' : ''}${delta} pts vs last week`;
  return (
    <section
      aria-label="Weekly summary"
      className="mb-6 rounded-2xl border border-neutral-800/60 bg-neutral-900/40 p-4"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-neutral-500">Weekly summary</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-white">
            {thisWeek.pct}%
            <span className="ml-2 text-xs font-medium text-neutral-500">
              {thisWeek.done} of {thisWeek.scheduled} so far
            </span>
          </p>
        </div>
        {deltaText && (
          <p
            className={`text-right text-xs font-medium ${
              delta === null || delta === 0
                ? 'text-neutral-400'
                : delta > 0
                  ? 'text-green-400'
                  : 'text-red-400'
            }`}
          >
            {deltaText}
            {lastWeek.pct !== null && (
              <span className="block text-[11px] font-normal text-neutral-500">
                last week {lastWeek.pct}%
              </span>
            )}
          </p>
        )}
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
        <div
          className="fill h-full rounded-full bg-green-500"
          style={{ transform: `translateX(${thisWeek.pct - 100}%)` }}
        />
      </div>
      {(best || needsAttention) && (
        <ul className="mt-3 space-y-0.5 text-xs text-neutral-400">
          {best && (
            <li>
              Best: <span className="font-medium text-neutral-200">{nameOf(best.id)}</span> {best.pct}%
            </li>
          )}
          {needsAttention && (
            <li>
              Needs attention:{' '}
              <span className="font-medium text-neutral-200">{nameOf(needsAttention.id)}</span>{' '}
              {needsAttention.pct}%
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
