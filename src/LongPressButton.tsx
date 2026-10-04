import { useRef } from 'react';
import type { ReactNode } from 'react';

type Props = {
  /** A normal tap. */
  onTap: () => void;
  /** Pressing and holding for `holdMs`. The tap is not triggered after a hold. */
  onLong: () => void;
  holdMs?: number;
  className?: string;
  title?: string;
  disabled?: boolean;
  'aria-label'?: string;
  children?: ReactNode;
};

/** A button that does one thing on a tap and another when you press and hold it. */
export default function LongPressButton({
  onTap,
  onLong,
  holdMs = 450,
  className,
  title,
  disabled,
  'aria-label': ariaLabel,
  children,
}: Props) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);

  function clear() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  return (
    <button
      type="button"
      className={className}
      title={title}
      disabled={disabled}
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        fired.current = false;
        origin.current = { x: e.clientX, y: e.clientY };
        clear();
        timer.current = window.setTimeout(() => {
          timer.current = null;
          fired.current = true;
          onLong();
        }, holdMs);
      }}
      onPointerMove={(e) => {
        const o = origin.current;
        // Moving the finger (scrolling) cancels the hold.
        if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 10) clear();
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (fired.current) {
          fired.current = false; // the hold already did its job
          return;
        }
        onTap();
      }}
      style={{ WebkitTouchCallout: 'none', userSelect: 'none', touchAction: 'manipulation' }}
    >
      {children}
    </button>
  );
}
