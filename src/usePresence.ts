import { useEffect, useRef, useState } from 'react';

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Lets something play a closing animation before it disappears.
 *
 * Pass the thing to show (or null when it should be gone). While it is shown, `item` is that
 * value. When it becomes null, `item` keeps the last value for `ms` milliseconds with
 * `closing` set to true, so the closing animation can run, and then becomes null.
 * `id` changes every time the thing opens afresh, so it can be used as a React `key` to make
 * sure a pop-up reopened during its closing animation starts clean.
 */
export function usePresence<T>(
  value: T | null,
  ms = 200
): { item: T | null; closing: boolean; id: number } {
  const open = value !== null;
  const lastRef = useRef<T | null>(value);
  const idRef = useRef(open ? 1 : 0);
  const wasOpenRef = useRef(open);
  const [, setTick] = useState(0);

  if (open) {
    lastRef.current = value;
    if (!wasOpenRef.current) idRef.current += 1;
  } else if (lastRef.current !== null && reducedMotion()) {
    lastRef.current = null; // animations are off: go away at once
  }
  wasOpenRef.current = open;

  useEffect(() => {
    if (open || lastRef.current === null) return;
    const id = window.setTimeout(() => {
      lastRef.current = null;
      setTick((t) => t + 1);
    }, ms);
    return () => window.clearTimeout(id);
  }, [open, ms]);

  const item = open ? value : lastRef.current;
  return { item, closing: !open && item !== null, id: idRef.current };
}
