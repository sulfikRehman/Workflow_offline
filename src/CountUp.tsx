import { useEffect, useRef, useState } from 'react';
import Bump from './Bump';
import { prefersReducedMotion } from '@/lib/motion';

const DURATION_MS = 450;

/**
 * Shows a whole number. The first time it appears it counts up from 0 (about 0.45 s); after that it
 * jumps straight to new values and Bump gives the small pop. With reduced motion, no counting.
 */
export default function CountUp({ value, suffix = '', className = '' }: { value: number; suffix?: string; className?: string }) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() || value === 0 ? value : 0));
  const [done, setDone] = useState(() => prefersReducedMotion() || value === 0);
  const initial = useRef(value); // the value this component opened with
  const finished = useRef(prefersReducedMotion() || value === 0);

  useEffect(() => {
    // Any later change (or reduced motion, or a 0) just shows the new number; Bump gives the pop.
    if (finished.current || value !== initial.current) {
      finished.current = true;
      setShown(value);
      setDone(true);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION_MS);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) {
        raf = requestAnimationFrame(step);
      } else {
        finished.current = true;
        setDone(true);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  if (!done) return <span className={`inline-block ${className}`}>{shown}{suffix}</span>;
  return (
    <span className="inline-block">
      <Bump value={value} className={className} />
      {suffix}
    </span>
  );
}
