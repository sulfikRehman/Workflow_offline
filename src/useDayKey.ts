import { useEffect, useState } from 'react';
import { todayISO } from '@/lib/date';

/**
 * Today's date (YYYY-MM-DD) as state. It changes when the clock passes local midnight, and is
 * re-checked when the app comes back to the screen, so an app left open overnight never keeps
 * showing yesterday as "today".
 */
export default function useDayKey(): string {
  const [day, setDay] = useState(todayISO);

  useEffect(() => {
    let timer = 0;
    const check = () => setDay((d) => {
      const now = todayISO();
      return now === d ? d : now;
    });
    const schedule = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 500);
      timer = window.setTimeout(() => {
        check();
        schedule();
      }, Math.max(1000, next.getTime() - now.getTime()));
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
    };
  }, []);

  return day;
}
