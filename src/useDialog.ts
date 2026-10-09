import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

/**
 * Makes a pop-up behave like a proper dialog: screen readers announce it, the keyboard focus moves
 * into it and stays inside while it is open (Tab wraps around), and focus goes back to the button
 * that opened it when it closes. Spread the result onto the pop-up's main element.
 */
export function useDialog<T extends HTMLElement>(label: string) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusables(el);
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const now = document.activeElement;
      if (e.shiftKey && (now === first || now === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && now === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return { ref, role: 'dialog' as const, 'aria-modal': true as const, 'aria-label': label, tabIndex: -1 };
}
