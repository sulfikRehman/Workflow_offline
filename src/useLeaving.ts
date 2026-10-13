import { useEffect, useRef, useState } from 'react';

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export type Slot = { id: string; leaving: boolean };

/**
 * Keeps an item on screen for `ms` after it leaves a list, so it can fold away instead of
 * vanishing (archiving or deleting a habit). Pass the ids that are in the list now, in order.
 * It returns the same ids, plus any that just left, each in the position it had. An id that comes
 * back (Restore) during the fold simply becomes a normal item again. With reduced motion, nothing
 * is kept.
 */
export function useLeaving(ids: string[], ms = 240): Slot[] {
  const prev = useRef<string[]>(ids);
  const ghosts = useRef<{ id: string; index: number }[]>([]);
  const [, setTick] = useState(0);

  const now = new Set(ids);
  if (!reducedMotion()) {
    prev.current.forEach((id, index) => {
      if (!now.has(id) && !ghosts.current.some((g) => g.id === id)) ghosts.current.push({ id, index });
    });
  }
  ghosts.current = ghosts.current.filter((g) => !now.has(g.id));
  prev.current = ids;

  const key = ghosts.current.map((g) => g.id).join(',');
  useEffect(() => {
    if (!key) return;
    const t = window.setTimeout(() => {
      ghosts.current = [];
      setTick((n) => n + 1);
    }, ms);
    return () => window.clearTimeout(t);
  }, [key, ms]);

  const out: Slot[] = ids.map((id) => ({ id, leaving: false }));
  for (const g of [...ghosts.current].sort((a, b) => a.index - b.index)) {
    out.splice(Math.min(g.index, out.length), 0, { id: g.id, leaving: true });
  }
  return out;
}
