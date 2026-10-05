import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react';
import { beep, unlockAudio } from '@/lib/beep';
import { clampDuration } from '@/lib/dial';
import { haptic } from '@/lib/haptics';
import { round2, timeUnitFactor } from '@/lib/stats';
import { formatMs, nextBreakAfter } from '@/lib/timer';
import type { Habit } from '@/lib/store';
import TimerDial from '@/TimerDial';
import PomodoroPanel from './PomodoroPanel';
import { backdropCls, sheetAnimCls } from './ui';
import { usePresence } from './usePresence';

type Phase = 'idle' | 'running' | 'paused' | 'finished';
type Mode = 'timer' | 'pomodoro';
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
        return { ...s, duration: clampDuration(s.duration) };
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

type Props = {
  /** Habits that can receive the finished timer's minutes (archived ones are left out). */
  habits: Habit[];
  /** Adds minutes to today's total for a habit. Returns false if it could not be saved. */
  onLogTime: (habitId: string, minutes: number) => boolean;
  onClose: () => void;
  /** True while the window plays its closing animation. */
  closing?: boolean;
};

export default function TimerModal({ habits, onLogTime, onClose, closing }: Props) {
  const [initial] = useState(loadSettings);
  const [duration, setDuration] = useState(initial.duration);
  const [breakStr, setBreakStr] = useState(String(initial.breakEvery));
  const [breakOn, setBreakOn] = useState(initial.breakOn);

  const [mode, setMode] = useState<Mode>('timer');
  const [pomoActive, setPomoActive] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [alarm, setAlarm] = useState<Alarm>(null);
  const [remaining, setRemaining] = useState(0);
  // After a timer finishes: minutes that can still be added to a habit, and what was logged.
  const [pendingLog, setPendingLog] = useState<number | null>(null);
  const [logHabitId, setLogHabitId] = useState('');
  const [loggedMsg, setLoggedMsg] = useState<string | null>(null);

  const totalRef = useRef(0);
  const endAtRef = useRef(0);
  const leftRef = useRef(0);
  const breakMsRef = useRef(0);
  const nextBreakRef = useRef(Infinity);
  const wakeRef = useRef<WakeLockSentinel | null>(null);

  const breakEvery = toInt(breakStr);
  const breakActive = breakOn && breakEvery >= 1 && breakEvery < duration;
  const locked = phase === 'running' || phase === 'paused';

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ duration, breakOn, breakEvery }));
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

  // Beep and vibrate immediately, then every 2 seconds, until the alarm is dismissed.
  useEffect(() => {
    if (!alarm) return;
    const freq = alarm === 'end' ? 988 : 660;
    const kind = alarm === 'end' ? 'endAlarm' : 'breakAlarm';
    const fire = () => {
      beep(freq);
      haptic(kind);
    };
    fire();
    const id = setInterval(fire, 2000);
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
    setPendingLog(null);
    setLoggedMsg(null);
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
    // Stopping a finished timer keeps the chance to log its time to a habit.
    if (phase === 'finished') setPendingLog(totalRef.current / 60000);
    setAlarm(null);
    setPhase('idle');
  }

  const loggable = habits.filter((h) => timeUnitFactor(h.unit) !== null);
  const logTarget = loggable.find((h) => h.id === logHabitId) ?? loggable[0];

  // Banners fold open and shut instead of popping in and out.
  const alarmP = usePresence(alarm);
  const offerP = usePresence(phase === 'idle' && logTarget ? pendingLog : null);
  const loggedP = usePresence(phase === 'idle' ? loggedMsg : null);

  function logTimeNow() {
    if (pendingLog === null || !logTarget) return;
    if (onLogTime(logTarget.id, pendingLog)) {
      setLoggedMsg(`Added ${round2(pendingLog)} min to ${logTarget.name}.`);
      setPendingLog(null);
    }
  }

  function requestClose() {
    if ((locked || pomoActive) && !window.confirm('Stop the timer and close?')) return;
    onClose();
  }

  /** A Pomodoro was stopped: offer to add its focus minutes to a habit. */
  function pomodoroStopped(minutes: number) {
    setLoggedMsg(null);
    setPendingLog(minutes >= 1 ? minutes : null);
  }

  function adjust(delta: number) {
    setDuration((d) => clampDuration(d + delta));
  }

  function bumpBreak(delta: number) {
    setBreakStr(String(Math.max(1, toInt(breakStr) + delta)));
  }

  const shownMs = phase === 'idle' ? duration * 60000 : remaining;
  const timeText = formatMs(shownMs);
  const caption =
    phase === 'idle'
      ? 'Drag the dial'
      : phase === 'paused'
        ? 'Paused'
        : phase === 'finished'
          ? "Time's up"
          : 'Remaining';

  const inputCls =
    'w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white focus:border-green-500 focus:outline-none disabled:opacity-50';
  const chipCls =
    'flex-1 rounded-lg border border-neutral-800 py-2 text-sm font-medium text-neutral-300 hover:text-white active:scale-95';
  const stepCls =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-800 text-neutral-300 hover:text-white active:scale-95 disabled:opacity-40';

  const banners = (
    <>
          {alarmP.item && (
            <div className={`collapse${alarmP.closing ? ' closing' : ''}`}>
              <div>
                <div
                  role="alert"
                  className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-green-300">
                    <BellRing className="h-5 w-5" />
                    {alarmP.item === 'end' ? "Time's up!" : 'Time for a break!'}
                  </div>
                  <button
                    onClick={() => (alarmP.item === 'end' ? reset() : setAlarm(null))}
                    className="rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium text-neutral-950 active:scale-95"
                  >
                    {alarmP.item === 'end' ? 'Stop' : 'Dismiss'}
                  </button>
                </div>
              </div>
            </div>
          )}
  
          {offerP.item !== null && logTarget && (
            <div className={`collapse${offerP.closing ? ' closing' : ''}`}>
              <div>
                <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                  <p className="text-sm font-medium text-white">
                    Add {round2(offerP.item)} min to a habit?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <select
                      value={logTarget.id}
                      onChange={(e) => setLogHabitId(e.target.value)}
                      aria-label="Habit to add the time to"
                      className="min-w-0 flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-green-500 focus:outline-none"
                    >
                      {loggable.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} ({h.unit})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={logTimeNow}
                      className="rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-neutral-950 active:scale-95"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setPendingLog(null)}
                      className="rounded-lg border border-neutral-800 px-3 py-2 text-sm font-medium text-neutral-300 active:scale-95"
                    >
                      No
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-neutral-500">
                    Only habits measured in minutes or hours are listed. The time is added to today.
                  </p>
                </div>
              </div>
            </div>
          )}
          {loggedP.item && (
            <div className={`collapse${loggedP.closing ? ' closing' : ''}`}>
              <div>
                <p
                  role="status"
                  className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300"
                >
                  {loggedP.item}
                </p>
              </div>
            </div>
          )}
    </>
  );

  return (
    <div
      className={backdropCls(closing)}
      onClick={requestClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`${sheetAnimCls(closing)} max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-neutral-800 bg-neutral-900 p-5 sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Timer</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Turn the dial to set the time, with a repeating break reminder.
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

        <div className="mt-4 flex gap-1 rounded-lg border border-neutral-800 p-1">
          {(
            [
              ['timer', 'Timer'],
              ['pomodoro', 'Pomodoro'],
            ] as [Mode, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              aria-pressed={mode === key}
              disabled={mode !== key && (phase !== 'idle' || pomoActive)}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors duration-200 disabled:opacity-40 ${
                mode === key ? 'bg-green-500 text-neutral-950' : 'text-neutral-300 hover:bg-neutral-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'timer' ? (
          <>
          <div className="mt-4">
            <TimerDial
              duration={duration}
              shownMin={shownMs / 60000}
              breakEvery={breakActive ? breakEvery : 0}
              locked={phase !== 'idle'}
              onChange={setDuration}
            >
              <p
                className={`font-semibold tabular-nums tracking-tight text-white ${
                  timeText.length > 5 ? 'text-3xl' : 'text-5xl'
                }`}
                aria-live="off"
              >
                {timeText}
              </p>
              <p className="mt-1 text-xs text-neutral-500">{caption}</p>
            </TimerDial>
  
            <div className={`collapsible${phase === 'idle' ? ' open' : ''}`}>
              <div>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => adjust(-5)} className={chipCls}>
                    −5
                  </button>
                  <button type="button" onClick={() => adjust(-1)} className={chipCls}>
                    −1
                  </button>
                  <button type="button" onClick={() => adjust(1)} className={chipCls}>
                    +1
                  </button>
                  <button type="button" onClick={() => adjust(5)} className={chipCls}>
                    +5
                  </button>
                </div>
                <p className="mt-2 text-center text-[11px] text-neutral-500">
                  One turn of the dial = 60 minutes (up to 12 hours).
                  {breakActive && ' Amber dots mark break reminders.'}
                </p>
              </div>
            </div>
          </div>
            {banners}

            <div className="mt-5">
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
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                aria-label="Decrease break interval"
                disabled={locked || !breakOn}
                onClick={() => bumpBreak(-1)}
                className={stepCls}
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={breakStr}
                disabled={locked || !breakOn}
                onChange={(e) => setBreakStr(e.target.value)}
                className={`${inputCls} text-center`}
              />
              <button
                type="button"
                aria-label="Increase break interval"
                disabled={locked || !breakOn}
                onClick={() => bumpBreak(1)}
                className={stepCls}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {breakOn && !breakActive && (
              <p className="mt-1.5 text-[11px] text-amber-400">
                The break interval must be at least 1 and shorter than the timer length, so no
                break reminders will play.
              </p>
            )}
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
          </>
        ) : (
          <>
            <PomodoroPanel onActiveChange={setPomoActive} onStopped={pomodoroStopped} />
            {banners}
          </>
        )}
      </div>
    </div>
  );
}
