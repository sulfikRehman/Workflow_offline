import { useEffect, useRef } from 'react';
import { addBackLayer } from './lib/backStack';

/**
 * While `active` is true, the phone's Back button calls `close` instead of leaving the app.
 * `close` may return false to say "I stayed open" (the timer asks "Stop the timer?" first).
 */
export function useBackClose(active: boolean, close: () => boolean | void): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!active) return;
    return addBackLayer(() => closeRef.current());
  }, [active]);
}
