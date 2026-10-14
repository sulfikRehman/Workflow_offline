import { useEffect, useState } from 'react';
import CountUp from './CountUp';
import { prefersReducedMotion } from '@/lib/motion';

/** "Today" card: a ring that fills as the day's habits get done. */
export default function TodayRing({ done, total }: { done: number; total: number }) {
  const frac = total > 0 ? Math.min(1, done / total) : 0;
  // On first appearance the ring starts empty and sweeps to its value.
  const [armed, setArmed] = useState(prefersReducedMotion);
  useEffect(() => {
    if (armed) return;
    const id = window.setTimeout(() => setArmed(true), 60);
    return () => window.clearTimeout(id);
  }, [armed]);
  const drawn = armed ? frac : 0;
  const R = 34;
  const C = 2 * Math.PI * R;
  const allDone = total > 0 && done >= total;
  return (
    <div className="hf-today flex items-center gap-4 rounded-2xl border border-green-500/30 bg-green-500/10 p-4">
      <div
        className="relative h-[4.5rem] w-[4.5rem] shrink-0"
        role="img"
        aria-label={`${Math.round(frac * 100)} percent of today's habits done`}
      >
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="40" cy="40" r={R} fill="none" strokeWidth="8" className="stroke-neutral-800" />
          <circle
            cx="40"
            cy="40"
            r={R}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            className="ring-fill stroke-green-500"
            style={{
              strokeDasharray: C,
              strokeDashoffset: C * (1 - drawn),
              opacity: drawn > 0 ? 1 : 0,
            }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-white">
          <CountUp value={Math.round(frac * 100)} suffix="%" />
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[0.6875rem] uppercase tracking-wider text-neutral-500">Today</p>
        <p className="hf-serif mt-0.5 text-2xl font-bold tabular-nums text-green-400">
          <CountUp value={done} />/{total}
        </p>
        <p className="text-[0.6875rem] text-neutral-500">{allDone ? 'all done' : 'completed'}</p>
      </div>
    </div>
  );
}
