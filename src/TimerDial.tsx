import { useEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import {
  DIAL_MAX,
  angleFromPoint,
  breakMarks,
  clampDuration,
  durationFromAngle,
  faceMinutes,
} from '@/lib/dial';
import { haptic } from '@/lib/haptics';

const C = 150; // centre of the 300 x 300 drawing
const R = 112; // radius of the ring
const CIRC = 2 * Math.PI * R;

/** Point at `minutes` (0..60) around the dial, `r` away from the centre. */
function polar(r: number, minutes: number) {
  const a = (minutes / 60) * 2 * Math.PI;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
}

const TICKS = Array.from({ length: 60 }, (_, i) => {
  const major = i % 5 === 0;
  return { i, major, from: polar(major ? 122 : 126, i), to: polar(132, i) };
});

const LABELS = [15, 30, 45, 60].map((m) => ({ m, ...polar(88, m) }));

type Props = {
  /** Timer length in whole minutes (what the dial sets). */
  duration: number;
  /** Time to show on the face, in minutes: the length while idle, the time left while running. */
  shownMin: number;
  /** Break reminder interval in minutes, or 0 for none. */
  breakEvery: number;
  /** When true the dial only displays; it cannot be turned. */
  locked: boolean;
  onChange: (minutes: number) => void;
  /** Content shown in the middle of the dial. */
  children?: ReactNode;
};

export default function TimerDial({
  duration,
  shownMin,
  breakEvery,
  locked,
  onChange,
  children,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const valueRef = useRef(duration);
  valueRef.current = duration;

  const face = faceMinutes(shownMin);
  const thumb = polar(R, face);
  // While the timer runs the arc and the dot glide between the 4-per-second updates. A big jump
  // (the hand passing 12 o'clock on a timer over an hour) is shown at once, never spun backwards.
  const prevFace = useRef(face);
  const smooth = locked && Math.abs(face - prevFace.current) < 5;
  useEffect(() => {
    prevFace.current = face;
  });
  const glide = smooth ? 'stroke-dasharray 300ms linear' : 'none';
  const glideTurn = smooth ? 'transform 300ms linear' : 'none';
  const marks = breakEvery >= 1 ? breakMarks(duration, breakEvery, shownMin) : [];

  /** Turns the pointer position into a new duration. Returns false if the touch was ignored. */
  function setFromPointer(e: PointerEvent<SVGSVGElement>, ringOnly: boolean): boolean {
    const el = svgRef.current;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    // A touch in the middle (over the time text) does nothing.
    if (ringOnly && Math.hypot(dx, dy) < rect.width * 0.27) return false;
    const next = durationFromAngle(valueRef.current, angleFromPoint(dx, dy));
    if (next !== valueRef.current) {
      valueRef.current = next;
      onChange(next);
      haptic('tick'); // one tick per minute passed
    }
    return true;
  }

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (locked) return;
    if (!setFromPointer(e, true)) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (!dragging.current) return;
    setFromPointer(e, false);
  }

  function endDrag() {
    dragging.current = false;
  }

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (locked) return;
    const step =
      e.key === 'ArrowUp' || e.key === 'ArrowRight'
        ? 1
        : e.key === 'ArrowDown' || e.key === 'ArrowLeft'
          ? -1
          : e.key === 'PageUp'
            ? 5
            : e.key === 'PageDown'
              ? -5
              : 0;
    if (!step) return;
    e.preventDefault();
    onChange(clampDuration(duration + step));
  }

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[300px]">
      <svg
        ref={svgRef}
        viewBox="0 0 300 300"
        role="slider"
        aria-label="Timer length in minutes"
        aria-valuemin={1}
        aria-valuemax={DIAL_MAX}
        aria-valuenow={duration}
        aria-valuetext={`${duration} minutes`}
        aria-disabled={locked}
        tabIndex={locked ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={`h-full w-full touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-green-500 ${
          locked ? '' : 'cursor-grab active:cursor-grabbing'
        }`}
        style={{ touchAction: 'none' }}
      >
        {/* tick marks: one per minute of a 60-minute turn */}
        {TICKS.map((t) => (
          <line
            key={t.i}
            x1={t.from.x}
            y1={t.from.y}
            x2={t.to.x}
            y2={t.to.y}
            strokeWidth={t.major ? 2 : 1}
            strokeLinecap="round"
            className={t.major ? 'stroke-neutral-500' : 'stroke-neutral-700'}
          />
        ))}

        {LABELS.map((l) => (
          <text
            key={l.m}
            x={l.x}
            y={l.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="13"
            className="fill-neutral-500"
          >
            {l.m}
          </text>
        ))}

        {/* ring: grey track, green arc from 12 o'clock to the hand */}
        <circle cx={C} cy={C} r={R} fill="none" strokeWidth={16} className="stroke-neutral-800" />
        {face > 0 && (
          <circle
            cx={C}
            cy={C}
            r={R}
            fill="none"
            strokeWidth={16}
            strokeLinecap="round"
            transform={`rotate(-90 ${C} ${C})`}
            className="stroke-green-500"
            style={{ strokeDasharray: `${(face / 60) * CIRC} ${CIRC}`, transition: glide }}
          />
        )}

        {/* amber dots: break reminders still to come in this turn */}
        {marks.map((m) => {
          const p = polar(141, m);
          return <circle key={m} cx={p.x} cy={p.y} r={3.5} className="fill-amber-400" />;
        })}

        {/* the hand: a handle you can drag, or a small dot while the timer runs */}
        {locked ? (
          <g
            style={{
              transformBox: 'view-box',
              transformOrigin: `${C}px ${C}px`,
              transform: `rotate(${face * 6}deg)`,
              transition: glideTurn,
            }}
          >
            <circle
              cx={C}
              cy={C - R}
              r={7}
              strokeWidth={3}
              className="fill-neutral-950 stroke-green-400"
            />
          </g>
        ) : (
          <circle
            cx={thumb.x}
            cy={thumb.y}
            r={13}
            strokeWidth={4}
            className="fill-white stroke-green-500"
          />
        )}
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}
