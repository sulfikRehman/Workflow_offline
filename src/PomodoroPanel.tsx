import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { beep, unlockAudio } from '@/lib/beep';
import { haptic } from '@/lib/haptics';
import { DEFAULT_POMODORO, cleanConfig, locate } from '@/lib/pomodoro';
import type { PomodoroConfig, SegmentKind } from '@/lib/pomodoro';
import { formatMs } from '@/lib/timer';
import TimerDial from '@/TimerDial';

const SETTINGS_KEY = 'habitflow:pomodoro-settings';

type Fields = { focus: string; short: string; long: string; sessions: string };
type Phase = 'idle' | 'running' | 'paused';

function loadFields(): Fields {
  let c: PomodoroConfig = DEFAULT_POMODORO;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) c = cleanConfig(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return {
    focus: String(c.focus),
    short: String(c.short),
    long: String(c.long),
    sessions: String(c.sessions),
  };
}

function toConfig(f: Fields): PomodoroConfig {
  return cleanConfig({
    focus: parseInt(f.focus, 10),
    short: parseInt(f.short, 10),
    long: parseInt(f.long, 10),
    sessions: parseInt(f.sessions, 10),
  });
}

const KIND_TEXT: Record<SegmentKind, string> = {
  focus: 'Focus',
  short: 'Short break',
  long: 'Long break',
};

type Props = {
  /** Tells the window whether a Pomodoro is running or paused (so it asks before closing). */
  onActiveChange: (active: boolean) => void;
  /** Called when a Pomodoro is stopped, with the whole minutes of focus time it contained. */
  onStopped: (focusMinutes: number) => void;
};

export default function PomodoroPanel({ onActiveChange, onStopped }: Props) {
  const [fields, setFields] = useState(loadFields);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);

  const cfgRef = useRef<PomodoroConfig>(toConfig(fields)); // frozen while a Pomodoro is running
  const accRef = useRef(0); // active time before the current run, ms
  const startRef = useRef(0); // when the current run began
  const indexRef = useRef(0); // segment we are in, to notice when a new one begins
  const wakeRef = useRef<WakeLockSentinel | null>(null);

  const draft = toConfig(fields);
  const cfg = phase === 'idle' ? draft : cfgRef.current;
  const where = locate(cfg, elapsed);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  useEffect(() => {
    onActiveChange(phase !== 'idle');
  }, [phase, onActiveChange]);
  // Leaving the panel (switching tab / closing) must not leave the window thinking it is busy.
  useEffect(() => () => onActiveChange(false), [onActiveChange]);

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
  useEffect(() => releaseWake, [releaseWake]);

  // The clock: elapsed active time comes from real timestamps, never from counting ticks.
  useEffect(() => {
    if (phase !== 'running') {
      releaseWake();
      return;
    }
    requestWake();
    const tick = () => {
      const e = accRef.current + (Date.now() - startRef.current);
      setElapsed(e);
      const w = locate(cfgRef.current, e);
      if (w.index !== indexRef.current) {
        indexRef.current = w.index;
        // A new segment began: two beeps and a buzz (a different pitch for focus and break).
        const freq = w.kind === 'focus' ? 988 : 660;
        beep(freq);
        window.setTimeout(() => beep(freq), 450);
        haptic(w.kind === 'focus' ? 'endAlarm' : 'breakAlarm');
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        wakeRef.current = null;
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

  function start() {
    unlockAudio();
    cfgRef.current = draft;
    accRef.current = 0;
    startRef.current = Date.now();
    indexRef.current = 0;
    setElapsed(0);
    setPhase('running');
  }

  function pause() {
    accRef.current += Date.now() - startRef.current;
    setElapsed(accRef.current);
    setPhase('paused');
  }

  function resume() {
    unlockAudio();
    startRef.current = Date.now();
    setPhase('running');
  }

  function stop() {
    const total = phase === 'running' ? accRef.current + (Date.now() - startRef.current) : accRef.current;
    const minutes = Math.round(locate(cfgRef.current, total).focusMs / 60000);
    accRef.current = 0;
    setElapsed(0);
    setPhase('idle');
    onStopped(minutes);
  }

  function set(key: keyof Fields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  const idle = phase === 'idle';
  const leftMs = idle ? cfg.focus * 60000 : where.leftMs;
  const timeText = formatMs(leftMs);
  const caption = idle
    ? 'Drag the dial to set focus time'
    : `${KIND_TEXT[where.kind]}${phase === 'paused' ? ' · paused' : ''}`;

  const inputCls =
    'w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-center text-sm text-white focus:border-green-500 focus:outline-none disabled:opacity-50';
  const labelCls = 'mb-1 block text-[11px] font-medium text-neutral-400';

  // Dots for the focus sessions in this round: filled = finished, ring = the current one.
  const doneInRound = where.kind === 'focus' ? where.session - 1 : where.session;
  const dots = Array.from({ length: cfg.sessions }, (_, i) => i);

  return (
    <div>
      <div className="mt-4">
        <TimerDial
          duration={idle ? cfg.focus : Math.max(1, Math.round(where.lengthMs / 60000))}
          shownMin={leftMs / 60000}
          breakEvery={0}
          locked={!idle}
          onChange={(m) => set('focus', String(Math.min(180, Math.max(1, m))))}
        >
          <p
            className={`font-semibold tabular-nums tracking-tight text-white ${
              timeText.length > 5 ? 'text-3xl' : 'text-5xl'
            }`}
            aria-live="off"
          >
            {timeText}
          </p>
          <p className="mt-1 max-w-[9rem] text-center text-xs text-neutral-500">{caption}</p>
        </TimerDial>

        <div
          className="mt-3 flex items-center justify-center gap-1.5"
          role="img"
          aria-label={
            idle
              ? `${cfg.sessions} focus sessions per round`
              : `Focus session ${where.session} of ${cfg.sessions}`
          }
        >
          {dots.map((i) => {
            const filled = !idle && i < doneInRound;
            const current = !idle && where.kind === 'focus' && i === where.session - 1;
            return (
              <span
                key={i}
                className={`h-2.5 w-2.5 rounded-full border transition-colors duration-300 ${
                  filled
                    ? 'border-green-500 bg-green-500'
                    : current
                      ? 'border-green-400 bg-green-500/30'
                      : 'border-neutral-700'
                }`}
              />
            );
          })}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2">
        {(
          [
            ['focus', 'Focus (min)'],
            ['short', 'Short (min)'],
            ['long', 'Long (min)'],
            ['sessions', 'Sessions'],
          ] as [keyof Fields, string][]
        ).map(([key, label]) => (
          <div key={key}>
            <label className={labelCls} htmlFor={`pomo-${key}`}>
              {label}
            </label>
            <input
              id={`pomo-${key}`}
              type="number"
              inputMode="numeric"
              min={1}
              value={fields[key]}
              disabled={!idle}
              onChange={(e) => set(key, e.target.value)}
              className={inputCls}
            />
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-500">
        Focus, short break, focus... and a long break after the last session of the round, then it
        starts over until you press Reset. Each change of phase beeps twice.
      </p>

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
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-500 px-4 py-2.5 text-sm font-medium text-neutral-950 active:scale-95"
          >
            <Play className="h-4 w-4" /> Start
          </button>
        )}
        <button
          onClick={stop}
          disabled={idle}
          className="flex items-center justify-center gap-2 rounded-lg border border-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-300 hover:text-white active:scale-95 disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" /> Reset
        </button>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
        Keep this screen open: the app keeps the display awake while it runs, but beeps may not
        play if the phone is locked or the app is in the background.
      </p>
    </div>
  );
}
