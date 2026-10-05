import { Flame, X } from 'lucide-react';
import { useEscape } from './useEscape';
import { backdropCls, sheetAnimCls } from './ui';

export const APP_VERSION = '1.2';

type Props = {
  habitCount: number;
  checkIns: number;
  noteCount: number;
  onClose: () => void;
  /** True while the window plays its closing animation. */
  closing?: boolean;
};

const TIPS: [string, string][] = [
  ['Tap a day', 'marks it done (or not done).'],
  ['Hold a day', 'or tap today’s total, to enter an amount and an optional note.'],
  ['Calendar icon', 'shows a month view, streaks and your notes.'],
  ['Trends', 'shows how your completion changes over a week, a month or 8 weeks.'],
  ['Reorder', 'lets you move habits up and down.'],
  ['Timer', 'has a normal countdown and a Pomodoro mode; finished time can be added to a habit.'],
];

export default function AboutModal({ habitCount, checkIns, noteCount, onClose, closing }: Props) {
  useEscape(onClose);
  return (
    <div className={backdropCls(closing)} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`${sheetAnimCls(closing)} max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-neutral-800 bg-neutral-900 p-5 sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-500/15 ring-1 ring-green-500/30">
              <Flame className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">HabitFlow</h2>
              <p className="text-xs text-neutral-500">Version {APP_VERSION}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close about"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-neutral-300">
          A private habit tracker for one person. It has no account and no server: everything you
          enter stays in this browser on this device.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ['Habits', habitCount],
            ['Check-ins', checkIns],
            ['Notes', noteCount],
          ].map(([label, n]) => (
            <div
              key={label}
              className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3 text-center"
            >
              <p className="text-lg font-bold tabular-nums text-white">{n}</p>
              <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
            </div>
          ))}
        </div>

        <h3 className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
          How to use it
        </h3>
        <ul className="space-y-1.5 text-sm text-neutral-300">
          {TIPS.map(([a, b]) => (
            <li key={a}>
              <span className="font-medium text-white">{a}</span> {b}
            </li>
          ))}
        </ul>

        <h3 className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
          Your data
        </h3>
        <p className="text-sm leading-relaxed text-neutral-300">
          Clearing this site&apos;s data in Chrome, or losing the phone, deletes your habits. Use{' '}
          <span className="font-medium text-white">Save backup</span> in the menu now and then and
          keep the file somewhere safe. <span className="font-medium text-white">Restore backup</span>{' '}
          puts it back, notes included.
        </p>
        <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
          The timer&apos;s beeps and vibration work while this screen is open. This version does not
          send reminders when the app is closed.
        </p>
      </div>
    </div>
  );
}
