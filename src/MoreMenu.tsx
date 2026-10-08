import { useEffect, useRef, useState } from 'react';
import { Download, Info, Menu, Save, Share2, Upload, X } from 'lucide-react';
import {
  LEVELS,
  getHapticLevel,
  hapticsSupported,
  isHapticsOn,
  setHapticLevel,
  setHapticsOn,
} from '@/lib/haptics';
import type { HapticLevel } from '@/lib/haptics';
import { THEME_PREFS, getThemePref, setThemePref } from '@/lib/theme';
import type { ThemePref } from '@/lib/theme';
import { usePresence } from './usePresence';

type Props = {
  onSaveBackup: () => void;
  onShareBackup: () => void;
  onRestoreBackup: () => void;
  onExportCSV: () => void;
  onAbout: () => void;
  /** CSV export needs at least one habit. */
  canExport: boolean;
};

const LEVEL_LABEL: Record<HapticLevel, string> = {
  light: 'Light',
  medium: 'Medium',
  strong: 'Strong',
};

const THEME_LABEL: Record<ThemePref, string> = { dark: 'Dark', light: 'Light', auto: 'Auto' };

const itemCls =
  'no-press flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-neutral-200 transition hover:bg-neutral-800 active:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent';

export default function MoreMenu({
  onSaveBackup,
  onShareBackup,
  onRestoreBackup,
  onExportCSV,
  onAbout,
  canExport,
}: Props) {
  const [open, setOpen] = useState(false);
  // Keeps the drop-down on screen while it plays its closing animation.
  const menu = usePresence(open ? true : null, 140);
  const [vibrationOn, setVibrationOn] = useState(isHapticsOn);
  const [level, setLevel] = useState<HapticLevel>(getHapticLevel);
  const [theme, setTheme] = useState<ThemePref>(getThemePref);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close when you tap outside the menu or press Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /** Runs an action and closes the menu. */
  function run(action: () => void) {
    setOpen(false);
    action();
  }

  function toggleVibration() {
    const next = !vibrationOn;
    setHapticsOn(next);
    setVibrationOn(next);
  }

  function chooseLevel(next: HapticLevel) {
    setHapticLevel(next);
    setLevel(next);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={open ? 'Close menu' : 'Open menu'}
        className={`inline-flex items-center rounded-lg border px-2.5 py-2 text-sm font-medium transition ${
          open
            ? 'border-neutral-600 bg-neutral-800 text-white'
            : 'border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white'
        }`}
      >
        <span key={open ? 'x' : 'menu'} className="fade-anim inline-flex">
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </span>
      </button>

      {menu.item && (
        <div
          aria-label="Menu"
          className={`menu-anim${menu.closing ? ' closing' : ''} absolute right-0 top-full z-30 mt-2 max-h-[calc(100dvh-5rem)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 p-2 shadow-2xl shadow-black/50`}
        >
          <p className="px-3 pb-1 pt-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-neutral-500">
            Your data
          </p>
          <button onClick={() => run(onSaveBackup)} className={itemCls}>
            <Save className="h-4 w-4 shrink-0 text-neutral-400" />
            <span>
              Save backup
              <span className="block text-[0.6875rem] text-neutral-500">
                Download everything as a file
              </span>
            </span>
          </button>
          <button onClick={() => run(onShareBackup)} className={itemCls}>
            <Share2 className="h-4 w-4 shrink-0 text-neutral-400" />
            <span>
              Share backup
              <span className="block text-[0.6875rem] text-neutral-500">
                Send the file to Drive, WhatsApp or email
              </span>
            </span>
          </button>
          <button onClick={() => run(onRestoreBackup)} className={itemCls}>
            <Upload className="h-4 w-4 shrink-0 text-neutral-400" />
            <span>
              Restore backup
              <span className="block text-[0.6875rem] text-neutral-500">
                Upload a backup file
              </span>
            </span>
          </button>
          <button
            onClick={() => run(onExportCSV)}
            disabled={!canExport}
            className={itemCls}
          >
            <Download className="h-4 w-4 shrink-0 text-neutral-400" />
            <span>
              Export CSV
              <span className="block text-[0.6875rem] text-neutral-500">
                Download your history as a spreadsheet
              </span>
            </span>
          </button>

          <div className="my-2 border-t border-neutral-800" />
          <p className="px-3 pb-1 pt-1 text-[0.6875rem] font-medium uppercase tracking-wider text-neutral-500">
            Appearance
          </p>
          <div className="px-3 pb-2">
            <div role="group" aria-label="Theme" className="flex gap-1 rounded-lg border border-neutral-800 p-1">
              {THEME_PREFS.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTheme(t);
                    setThemePref(t);
                  }}
                  aria-pressed={theme === t}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors duration-200 ${
                    theme === t ? 'bg-green-500 text-neutral-950' : 'text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  {THEME_LABEL[t]}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-neutral-500">
              Auto follows your phone&apos;s light or dark setting.
            </p>
          </div>

          {hapticsSupported() && (
            <>
              <div className="my-2 border-t border-neutral-800" />
              <p className="px-3 pb-1 pt-1 text-[0.6875rem] font-medium uppercase tracking-wider text-neutral-500">
                Vibration
              </p>
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm text-neutral-200">Haptic feedback</span>
                <button
                  role="switch"
                  aria-checked={vibrationOn}
                  aria-label="Haptic feedback"
                  onClick={toggleVibration}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                    vibrationOn ? 'bg-green-500' : 'bg-neutral-700'
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      vibrationOn ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <div className="px-3 pb-2">
                <p className="mb-1.5 text-xs text-neutral-400">Strength</p>
                <div className="flex gap-1 rounded-lg border border-neutral-800 p-1">
                  {LEVELS.map((l) => (
                    <button
                      key={l}
                      onClick={() => chooseLevel(l)}
                      disabled={!vibrationOn}
                      aria-pressed={level === l}
                      className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors duration-200 disabled:opacity-40 ${
                        level === l
                          ? 'bg-green-500 text-neutral-950'
                          : 'text-neutral-300 hover:bg-neutral-800'
                      }`}
                    >
                      {LEVEL_LABEL[l]}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-neutral-500">
                  Phones can only change how long a buzz lasts, not how hard it is.
                </p>
              </div>
            </>
          )}

          <div className="my-2 border-t border-neutral-800" />
          <button onClick={() => run(onAbout)} className={itemCls}>
            <Info className="h-4 w-4 shrink-0 text-neutral-400" />
            <span>
              About
              <span className="block text-[0.6875rem] text-neutral-500">
                What this app is, tips and your data
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
