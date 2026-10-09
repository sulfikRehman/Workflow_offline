import { useRef } from 'react';

/** Wraps a changing value; replays a short "bump" when the value changes (not on first render). */
export default function Bump({ value, className = '' }: { value: string | number; className?: string }) {
  const prev = useRef(value);
  const n = useRef(0);
  if (prev.current !== value) {
    prev.current = value;
    n.current += 1;
  }
  return (
    <span key={n.current} className={`${n.current > 0 ? 'num-bump ' : ''}inline-block ${className}`}>
      {value}
    </span>
  );
}
