import { useEffect, useState, useSyncExternalStore } from 'react';
import { Cloud, CloudOff, LogIn, RefreshCw, Trash2, X } from 'lucide-react';
import { useEscape } from './useEscape';
import { useBackClose } from './useBackClose';
import { useDialog } from './useDialog';
import { backdropCls, sheetAnimCls } from './ui';
import {
  ago,
  clearNotice,
  deleteCloudData,
  forgetFirebaseSettings,
  getSyncView,
  preloadCloud,
  saveFirebaseSettings,
  subscribeSync,
  syncNow,
  turnOff,
  turnOn,
} from '@/lib/cloudSync';

type Props = {
  onClose: () => void;
  /** True while the window plays its closing animation. */
  closing?: boolean;
};

const labelCls = 'text-[0.6875rem] font-medium uppercase tracking-wider text-neutral-500';
const actionCls =
  'hit no-press inline-flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-800 px-3 py-2.5 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:text-white disabled:opacity-40';
const primaryCls =
  'hit no-press inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-500 px-3 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-green-400 disabled:opacity-40 disabled:hover:bg-green-500';

const STATUS_TEXT = {
  off: 'Off',
  'signed-out': 'Signed out',
  idle: 'Up to date',
  syncing: 'Syncing…',
  offline: 'Waiting for internet',
  error: 'Needs attention',
} as const;

export default function SyncModal({ onClose, closing }: Props) {
  useEscape(onClose);
  useBackClose(!closing, onClose);
  const dlg = useDialog<HTMLDivElement>('Cloud sync');
  const v = useSyncExternalStore(subscribeSync, getSyncView, getSyncView);
  const [paste, setPaste] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Start loading the Firebase code now, so the Google sign-in window opens the instant it is tapped.
  useEffect(() => {
    if (v.configured) preloadCloud().catch(() => undefined);
  }, [v.configured]);

  // "Synced 2 minutes ago" keeps counting while the window is open.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 20_000);
    return () => window.clearInterval(id);
  }, []);

  function savePasted() {
    try {
      saveFirebaseSettings(paste);
      setPaste('');
      setPasteError(null);
      setEditing(false);
    } catch (e) {
      setPasteError(e instanceof Error ? e.message : 'Those settings could not be read.');
    }
  }

  async function signIn() {
    setBusy(true);
    try {
      await turnOn();
    } finally {
      setBusy(false);
    }
  }

  async function removeCloud() {
    const ok = window.confirm(
      'Delete your data from the cloud?\n\nYour habits, check-ins, notes and rest days are removed from Google’s servers and syncing is turned off. Everything stays on the devices you have now. You can turn sync on again later.'
    );
    if (!ok) return;
    setBusy(true);
    try {
      await deleteCloudData();
    } finally {
      setBusy(false);
    }
  }

  const showSetup = !v.configured || editing;
  const Icon = v.on && v.status !== 'offline' ? Cloud : CloudOff;

  return (
    <div className={backdropCls(closing)} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        {...dlg}
        className={`${sheetAnimCls(closing)} focus:outline-none max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-neutral-800 bg-neutral-900 p-5 sm:rounded-2xl lg:max-w-lg`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-500/15 ring-1 ring-green-500/30">
              <Icon className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Cloud sync</h2>
              <p className="text-xs text-neutral-500">Keep your phone and PC in step</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close cloud sync"
            className="hit flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {v.notice && (
          <div
            role="status"
            className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-200"
          >
            <span>{v.notice}</span>
            <button onClick={clearNotice} aria-label="Dismiss" className="shrink-0 underline">
              OK
            </button>
          </div>
        )}

        {showSetup && (
          <>
            <p className="mt-4 text-sm leading-relaxed text-neutral-300">
              Sync is optional and off by default. When it is on, your habits, check-ins, notes and rest days are kept in
              your own Firebase project (a free Google service) so every device you sign in on shows the same thing.
              Without it, nothing leaves this device.
            </p>
            <p className={`mt-4 ${labelCls}`}>Your Firebase settings</p>
            <textarea
              value={paste}
              onChange={(e) => {
                setPaste(e.target.value);
                setPasteError(null);
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              rows={7}
              aria-label="Firebase settings"
              placeholder={'Paste the block Firebase shows, like:\n{\n  apiKey: "…",\n  authDomain: "….firebaseapp.com",\n  projectId: "…",\n  appId: "…"\n}'}
              className="mt-1.5 w-full resize-none rounded-lg border border-neutral-800 bg-neutral-950 p-3 font-mono text-xs text-white placeholder:text-neutral-600 focus:border-green-500 focus:outline-none"
            />
            {pasteError && (
              <p role="alert" className="mt-2 text-xs text-red-400">
                {pasteError}
              </p>
            )}
            <div className="mt-3 grid grid-cols-1 gap-2">
              <button onClick={savePasted} disabled={!paste.trim()} className={primaryCls}>
                Save settings
              </button>
              {editing && (
                <button
                  onClick={() => {
                    setEditing(false);
                    setPaste('');
                    setPasteError(null);
                  }}
                  className={actionCls}
                >
                  Cancel
                </button>
              )}
            </div>
            <p className="mt-3 text-[0.6875rem] leading-relaxed text-neutral-500">
              These are not passwords: they only say which project to use. They are saved on this device, so paste them on
              each device once.
            </p>
          </>
        )}

        {!showSetup && !v.on && (
          <>
            <p className="mt-4 text-sm leading-relaxed text-neutral-300">
              Sync is off. Turn it on to sign in with Google and keep this device in step with your others. Nothing is
              deleted from this device, and the first sync joins what is here with what is already in the cloud.
            </p>
            {v.message && (
              <p role="alert" className="mt-3 text-xs text-red-400">
                {v.message}
              </p>
            )}
            <button onClick={() => void signIn()} disabled={busy} className={`${primaryCls} mt-4`}>
              <LogIn className="h-4 w-4" />
              {busy ? 'Opening Google…' : 'Sign in with Google and turn on'}
            </button>
            <button onClick={() => setEditing(true)} className={`${actionCls} mt-2`}>
              Change Firebase settings
            </button>
            <p className="mt-3 text-[0.6875rem] leading-relaxed text-neutral-500">Project: {v.projectId}</p>
          </>
        )}

        {!showSetup && v.on && (
          <>
            <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
              <p className="text-sm font-medium text-white">{STATUS_TEXT[v.status]}</p>
              <p className="mt-0.5 text-xs text-neutral-400">{v.email ? `Signed in as ${v.email}` : 'Signed in'}</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {v.last ? `Last synced ${ago(v.last)}` : 'Not synced yet'}
              </p>
            </div>
            {v.message && (
              <p role={v.status === 'error' ? 'alert' : 'status'} className={`mt-3 text-xs ${v.status === 'error' ? 'text-red-400' : 'text-neutral-400'}`}>
                {v.message}
              </p>
            )}
            <div className="mt-4 grid grid-cols-1 gap-2">
              {v.status === 'signed-out' ? (
                <button onClick={() => void signIn()} disabled={busy} className={primaryCls}>
                  <LogIn className="h-4 w-4" />
                  Sign in again
                </button>
              ) : (
                <button onClick={syncNow} disabled={v.status === 'syncing'} className={primaryCls}>
                  <RefreshCw className={`h-4 w-4 ${v.status === 'syncing' ? 'animate-spin' : ''}`} />
                  Sync now
                </button>
              )}
              <button onClick={() => void turnOff()} className={actionCls}>
                Turn off sync
              </button>
              <button onClick={() => void removeCloud()} disabled={busy} className={actionCls}>
                <Trash2 className="h-4 w-4" />
                Delete my cloud data
              </button>
            </div>
          </>
        )}

        <h3 className="mb-2 mt-5 text-[0.6875rem] font-medium uppercase tracking-wider text-neutral-500">
          Good to know
        </h3>
        <ul className="space-y-1.5 text-xs leading-relaxed text-neutral-400">
          <li>The app always works from this device first, so it opens and works with no internet. Changes go up when you are online.</li>
          <li>If two devices change the same thing, the one changed last wins. A deleted habit stays deleted everywhere.</li>
          <li>Restoring a backup replaces the data on all your synced devices. Use Undo right after if that was a mistake.</li>
          <li>Not synced: background photos, the light/dark choice and vibration settings. Those stay per device.</li>
          <li>Backups still work and are still worth saving now and then.</li>
        </ul>
        {!showSetup && (
          <button
            onClick={forgetFirebaseSettings}
            className="hit no-press mt-3 text-[0.6875rem] text-neutral-500 underline hover:text-neutral-300"
          >
            Forget the Firebase settings on this device
          </button>
        )}
      </div>
    </div>
  );
}
