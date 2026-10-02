import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, Pause, Play, RotateCcw, X } from 'lucide-react';
import { beep, unlockAudio } from '@/lib/beep';
import { formatMs, nextBreakAfter } from '@/lib/timer';

type Phase = 'idle' | 'running' | 'paused' | 'finished';
type Alarm = null | 'break' | 'end';

const SETTINGS_KEY = 'habitflow:timer-settings';

type Settings = { duration: number; breakOn: boolean; breakEvery: number };

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (
        typeof s.duration === 'number' &&
        typeof s.breakOn === 'boolean' &&
        typeof s.breakEvery === 'number'
      ) {
        return s;
      }
    }
  } catch {
    /* ignore */
  }
  return { duration: 60, breakOn: true, breakEvery: 25 };
}

function toInt(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

export default function TimerModal({ onClose }: { onClose: () => void }) {
  const [initial] = useState(loadSettings);
  const [durationStr, setDurationStr] = useState(String(initial.duration));
  const [breakStr, setBreakStr] = useState(String(initial.breakEvery));
  const [breakOn, setBreakOn] = useState(initial.breakOn);

  const [phase, setPhase] = useState<Phase>('idle');
  const [alarm, setAlarm] = useState<Alarm>(null);
  const [remaining, setRemaining] = useState(0);

  const totalRef = useRef(0);
  const endAtRef = useRef(0);
  const leftRef = useRef(0);
  const breakMsRef = useRef(0);
  const nextBreakRef = useRef(Infinity);
  const wakeRef = useRef<WakeLockSentinel | null>(null);

  const duration = Math.min(1000, Math.max(0, toInt(durationStr)));
  const breakEvery = toInt(breakStr);
  const breakActive = breakOn && breakEvery >= 1 && breakEvery < duration;
  const locked = phase === 'running' || phase === 'paused';

  useEffect(() => {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ duration: duration || 1, breakOn, breakEvery })
      );
    } catch {
      /* ignore */
    }
  }, [duration, breakOn, breakEvery]);

  // Keep the screen on while running (beeps may not play if the phone locks its screen).
  const requestWake = useCallback(async () => {
    try {
      if (!wakeRef.current) {
        wakeRef.current = (await navigator.wakeLock?.request('screen')) ?? null;
      }
    } catch {
      /* not supported or denied */
    }
  }, []);
  const releaseWake = useCallback(() => {
    wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
  }, []);

  // The clock. Uses real timestamps, so it stays correct even if the page is throttled.
  useEffect(() => {
    if (phase !== 'running') {
      releaseWake();
      return;
    }
    requestWake();

    const tick = () => {
      const left = Math.max(0, endAtRef.current - Date.now());
      setRemaining(left);
      if (left <= 0) {
        setPhase('finished');
        setAlarm('end');
        return;
      }
      const elapsed = totalRef.current - left;
      if (elapsed >= nextBreakRef.current) {
        nextBreakRef.current = nextBreakAfter(
          nextBreakRef.current,
          breakMsRef.current,
          elapsed,
          totalRef.current
        );
        setAlarm((a) => (a === 'end' ? a : 'break'));
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        wakeRef.current = null; // the browser releases it when the page is hidden
        requestWake();
        tick();
      }
    };

    const id = setInterval(tick, 250);
    document.addEventListener('visibilitychange', onVisible);
    tick();
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [phase, requestWake, releaseWake]);

  useEffect(() => releaseWake, [releaseWake]);

  // Beep immediately, then every 2 seconds, until the alarm is dismissed.
  useEffect(() => {
    if (!alarm) return;
    const freq = alarm === 'end' ? 988 : 660;
    beep(freq);
    const id = setInterval(() => beep(freq), 2000);
    return () => clearInterval(id);
  }, [alarm]);

  function start() {
    if (duration < 1) return;
    unlockAudio();
    const total = duration * 60000;
    totalRef.current = total;
    endAtRef.current = Date.now() + total;
    breakMsRef.current = breakActive ? breakEvery * 60000 : 0;
    nextBreakRef.current = breakActive ? breakEvery * 60000 : Infinity;
    setRemaining(total);
    setAlarm(null);
    setPhase('running');
  }

  function pause() {
    leftRef.current = Math.max(0, endAtRef.current - Date.now());
    setRemaining(leftRef.current);
    setPhase('paused');
  }

  function resume() {
    unlockAudio();
    endAtRef.current = Date.now() + leftRef.current;
    setPhase('running');
  }

  function reset() {
    setAlarm(null);
    setPhase('idle');
  }

  function requestClose() {
    if (locked && !window.confirm('Stop the timer and close?')) return;
    onClose();
  }

  const shownMs = phase === 'idle' ? duration * 60000 : remaining;
  const pct =
    phase === 'idle' || totalRef.current === 0
      ? 0
      : Math.min(100, Math.max(0, (1 - remaining / totalRef.current) * 100));

  const inputCls =
    'w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white focus:border-green-500 focus:outline-none disabled:opacity-50';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={requestClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl border border-neutral-800 bg-neutral-900 p-5 sm:rounded-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Timer</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Countdown with a repeating break reminder.
            </p>
          </div>
          <button
            onClick={requestClose}
            aria-label="Close timer"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 text-center">
          <p
            className="text-6xl font-semibold tabular-nums tracking-tight text-white"
            aria-live="off"
          >
            {formatMs(shownMs)}
          </p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-green-500 transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {alarm && (
          <div
            role="alert"
            className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-green-300">
              <BellRing className="h-5 w-5" />
              {alarm === 'end' ? "Time's up!" : 'Time for a break!'}
            </div>
            <button
              onClick={() => (alarm === 'end' ? reset() : setAlarm(null))}
              className="rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium text-neutral-950 active:scale-95"
            >
              {alarm === 'end' ? 'Stop' : 'Dismiss'}
            </button>
          </div>
        )}

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">
              Timer length (minutes)
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
              value={durationStr}
              disabled={locked}
              onChange={(e) => setDurationStr(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-neutral-400">
              <input
                type="checkbox"
                checked={breakOn}
                disabled={locked}
                onChange={(e) => setBreakOn(e.target.checked)}
                className="h-4 w-4 accent-green-500"
              />
              Break reminder: beep every (minutes)
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={breakStr}
              disabled={locked || !breakOn}
              onChange={(e) => setBreakStr(e.target.value)}
              className={`${inputCls} mt-1.5`}
            />
            {breakOn && !breakActive && duration >= 1 && (
              <p className="mt-1.5 text-[11px] text-amber-400">
                The break interval must be at least 1 and shorter than the timer
                length, so no break reminders will play.
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          {phase === 'running' ? (
            <button
              onClick={pause}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-500 px-4 py-2.5 text-sm font-medium text-neutral-950 active:scale-95"
            >
              <Pause className="h-4 w-4" /> Pause
            </button>
          ) : phase === 'paused' ? (
            <button
              onClick={resume}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-500 px-4 py-2.5 text-sm font-medium text-neutral-950 active:scale-95"
            >
              <Play className="h-4 w-4" /> Resume
            </button>
          ) : (
            <button
              onClick={start}
              disabled={duration < 1 || phase === 'finished'}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-500 px-4 py-2.5 text-sm font-medium text-neutral-950 active:scale-95 disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> Start
            </button>
          )}
          <button
            onClick={reset}
            disabled={phase === 'idle'}
            className="flex items-center justify-center gap-2 rounded-lg border border-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-300 hover:text-white active:scale-95 disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
          Keep this screen open: the app keeps the display awake while the timer runs, but
          beeps may not play if the phone is locked or the app is in the background.
        </p>
      </div>
    </div>
  );
}
