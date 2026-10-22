import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { Image as ImageIcon, ImagePlus, RotateCcw, Trash2, X } from 'lucide-react';
import { useEscape } from './useEscape';
import { useBackClose } from './useBackClose';
import { useDialog } from './useDialog';
import { backdropCls, sheetAnimCls } from './ui';
import {
  BackgroundError,
  LOOKS,
  STRENGTHS,
  getBackgroundSettings,
  getBackgroundUrl,
  getMissingLooks,
  overlayAlpha,
  processImage,
  saveBackgrounds,
} from '@/lib/backgrounds';
import type { Change, Look, Strength } from '@/lib/backgrounds';

type Props = {
  /** The look being shown right now (the editor opens on it). */
  startLook: Look;
  /** Called after a successful save, with a short message to show. */
  onSaved: (message: string) => void;
  onClose: () => void;
  /** True while the window plays its closing animation. */
  closing?: boolean;
};

/** What the editor holds for one look until Save is pressed. */
type Draft = {
  has: boolean;
  /** Address of the picture shown in the preview. */
  url: string | null;
  /** A newly chosen picture (not saved yet). Absent when the saved one is kept. */
  blob?: Blob;
  lum: number;
  x: number;
  y: number;
  strength: Strength;
  /** Size of the picture, for dragging. */
  w: number;
  h: number;
};

const LOOK_LABEL: Record<Look, string> = { dark: 'Dark', light: 'Light' };
const STRENGTH_LABEL: Record<Strength, string> = { subtle: 'Subtle', medium: 'Medium', strong: 'Strong' };
type Device = 'phone' | 'desktop';

// How the real page looks without a photo, for the little preview.
const PAGE: Record<Look, { page: string; card: string; line: string; faint: string }> = {
  dark: { page: '#0a0a0a', card: 'rgb(23 23 23 / 0.72)', line: 'rgb(229 229 229 / 0.85)', faint: 'rgb(163 163 163 / 0.6)' },
  light: { page: '#f4efe4', card: 'rgb(252 250 243 / 0.9)', line: 'rgb(27 43 34 / 0.85)', faint: 'rgb(86 92 79 / 0.55)' },
};

const segCls = 'flex gap-1 rounded-lg border border-neutral-800 p-1';
const segBtn = (on: boolean) =>
  `hit flex-1 rounded-md py-2 text-xs font-medium transition-colors duration-200 disabled:opacity-40 ${
    on ? 'bg-green-500 text-neutral-950' : 'text-neutral-300 hover:bg-neutral-800'
  }`;
const labelCls = 'text-[0.6875rem] font-medium uppercase tracking-wider text-neutral-500';
const actionCls =
  'hit no-press inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-800 px-3 py-2.5 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:text-white disabled:opacity-40';

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function initialDrafts(): Record<Look, Draft> {
  const s = getBackgroundSettings();
  const one = (look: Look): Draft => {
    const url = getBackgroundUrl(look);
    const l = s[look];
    return { has: !!url, url, lum: l.lum, x: l.x, y: l.y, strength: l.strength, w: 0, h: 0 };
  };
  return { dark: one('dark'), light: one('light') };
}

/** What has to be saved for one look, or null when nothing changed. */
function changeFor(look: Look, d: Draft): Change | null {
  const saved = getBackgroundSettings()[look];
  if (d.has && d.blob) return { kind: 'set', blob: d.blob, x: d.x, y: d.y, strength: d.strength, lum: d.lum };
  if (d.has) {
    const same = saved.on && saved.x === d.x && saved.y === d.y && saved.strength === d.strength;
    return same ? null : { kind: 'adjust', x: d.x, y: d.y, strength: d.strength };
  }
  return saved.on ? { kind: 'remove' } : null;
}

export default function BackgroundModal({ startLook, onSaved, onClose, closing }: Props) {
  useEscape(onClose);
  useBackClose(!closing, onClose);
  const dlg = useDialog<HTMLDivElement>('Background');

  const [look, setLook] = useState<Look>(startLook);
  const [device, setDevice] = useState<Device>('phone');
  const [drafts, setDrafts] = useState<Record<Look, Draft>>(initialDrafts);
  const [busy, setBusy] = useState<'prepare' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(() => {
    const m = getMissingLooks();
    return m.length
      ? `The saved ${m.map((l) => LOOK_LABEL[l].toLowerCase()).join(' and ')} photo could not be read, so the default background is back.`
      : null;
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const ownUrls = useRef<Set<string>>(new Set());
  const mounted = useRef(true);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  // Size of the preview frame (its layout size, which the opening animation's scaling does not change).
  const [frame, setFrame] = useState({ w: 0, h: 0 });

  useEffect(() => {
    mounted.current = true;
    const urls = ownUrls.current;
    return () => {
      mounted.current = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrame({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const d = drafts[look];
  const patch = (l: Look, p: Partial<Draft>) => setDrafts((all) => ({ ...all, [l]: { ...all[l], ...p } }));

  // A saved photo's size is not stored, so read it from the picture itself (needed for dragging).
  useEffect(() => {
    if (!d.url || (d.w && d.h)) return;
    const url = d.url;
    const img = new Image();
    img.onload = () => {
      if (mounted.current) {
        setDrafts((all) => (all[look].url === url ? { ...all, [look]: { ...all[look], w: img.naturalWidth, h: img.naturalHeight } } : all));
      }
    };
    img.src = url;
  }, [look, d.url, d.w, d.h]);

  const changes: Partial<Record<Look, Change>> = {};
  for (const l of LOOKS) {
    const c = changeFor(l, drafts[l]);
    if (c) changes[l] = c;
  }
  const dirty = Object.keys(changes).length > 0;
  const busyNow = busy !== null;

  async function onPick(file: File | undefined) {
    if (!file) return;
    const target = look;
    setError(null);
    setBusy('prepare');
    try {
      const p = await processImage(file, target);
      if (!mounted.current) return;
      const url = URL.createObjectURL(p.blob);
      ownUrls.current.add(url);
      setDrafts((all) => {
        const old = all[target].url;
        if (old && ownUrls.current.has(old)) {
          URL.revokeObjectURL(old);
          ownUrls.current.delete(old);
        }
        return { ...all, [target]: { ...all[target], has: true, url, blob: p.blob, lum: p.lum, x: 50, y: 50, w: p.width, h: p.height } };
      });
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof BackgroundError ? e.message : 'That picture could not be used. Please try another.');
      }
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  function removePhoto() {
    setError(null);
    setDrafts((all) => {
      const old = all[look].url;
      if (old && ownUrls.current.has(old)) {
        URL.revokeObjectURL(old);
        ownUrls.current.delete(old);
      }
      return { ...all, [look]: { ...all[look], has: false, url: null, blob: undefined, x: 50, y: 50, w: 0, h: 0 } };
    });
  }

  async function save() {
    if (!dirty || busyNow) return;
    setError(null);
    setBusy('save');
    const removedOnly = Object.values(changes).every((c) => c.kind === 'remove');
    try {
      await saveBackgrounds(changes);
      if (!mounted.current) return;
      onSaved(removedOnly ? 'Background removed.' : 'Background saved.');
      onClose();
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof BackgroundError ? e.message : 'The background could not be saved. Nothing was changed.');
        setBusy(null);
      }
    }
  }

  // ----- Positioning: drag the picture, or use the arrow keys -----
  function overflow(): { ox: number; oy: number } {
    if (!frame.w || !frame.h || !d.w || !d.h) return { ox: 0, oy: 0 };
    const scale = Math.max(frame.w / d.w, frame.h / d.h);
    return { ox: Math.max(0, d.w * scale - frame.w), oy: Math.max(0, d.h * scale - frame.h) };
  }
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!d.has) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: d.x, y: d.y, px: e.clientX, py: e.clientY };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const s = drag.current;
    if (!s) return;
    const { ox, oy } = overflow();
    patch(look, {
      x: ox > 0.5 ? clamp(s.x - ((e.clientX - s.px) / ox) * 100, 0, 100) : s.x,
      y: oy > 0.5 ? clamp(s.y - ((e.clientY - s.py) / oy) * 100, 0, 100) : s.y,
    });
  }
  function onPointerEnd() {
    drag.current = null;
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!d.has) return;
    const step = e.shiftKey ? 10 : 2;
    const { ox, oy } = overflow();
    let { x, y } = d;
    // Arrow keys move the visible part, like panning: right shows more of the right side.
    if (e.key === 'ArrowLeft') x -= step;
    else if (e.key === 'ArrowRight') x += step;
    else if (e.key === 'ArrowUp') y -= step;
    else if (e.key === 'ArrowDown') y += step;
    else return;
    e.preventDefault();
    patch(look, { x: ox > 0.5 ? clamp(x, 0, 100) : d.x, y: oy > 0.5 ? clamp(y, 0, 100) : d.y });
  }

  const pal = PAGE[look];
  const alpha = overlayAlpha(look, d.strength, d.lum);
  const frameStyle: CSSProperties = {
    backgroundColor: pal.page,
    ...(d.url
      ? { backgroundImage: `url("${d.url}")`, backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: `${d.x}% ${d.y}%` }
      : {}),
  };
  const { ox, oy } = overflow();
  const canMove = d.has && (ox > 0.5 || oy > 0.5);
  const status = !d.has
    ? `${LOOK_LABEL[look]} look: default background`
    : d.blob
      ? `${LOOK_LABEL[look]} look: new photo, not saved yet`
      : `${LOOK_LABEL[look]} look: your saved photo`;

  return (
    <div className={backdropCls(closing)} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        {...dlg}
        className={`${sheetAnimCls(closing)} focus:outline-none max-h-[95dvh] w-full max-w-md lg:max-w-lg overflow-y-auto rounded-t-2xl border border-neutral-800 bg-neutral-900 p-5 sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-500/15 ring-1 ring-green-500/30">
              <ImageIcon className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Background</h2>
              <p className="text-xs text-neutral-500">Your own photo behind the home screen</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close background settings"
            className="hit flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-4 mb-1.5 text-xs text-neutral-400">Pick the look to set a photo for</p>
        <div role="group" aria-label="Look" className={segCls}>
          {LOOKS.map((l) => (
            <button key={l} onClick={() => setLook(l)} aria-pressed={look === l} className={segBtn(look === l)}>
              {LOOK_LABEL[l]}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-neutral-500" aria-live="polite">
          {status}
        </p>

        <div className="mb-1.5 mt-4 flex items-center justify-between gap-3">
          <p className={labelCls}>Preview</p>
          <div role="group" aria-label="Preview size" className="flex gap-1 rounded-lg border border-neutral-800 p-0.5">
            {(['phone', 'desktop'] as Device[]).map((v) => (
              <button
                key={v}
                onClick={() => setDevice(v)}
                aria-pressed={device === v}
                className={`hit rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
                  device === v ? 'bg-green-500 text-neutral-950' : 'text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {v === 'phone' ? 'Phone' : 'Desktop'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-center rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
          <div
            ref={frameRef}
            role="group"
            aria-label={d.has ? 'Photo position. Drag the picture, or use the arrow keys, to choose which part shows.' : 'Preview of the default background'}
            tabIndex={d.has ? 0 : -1}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onKeyDown={onKeyDown}
            style={{ ...frameStyle, aspectRatio: device === 'phone' ? '9 / 17' : '16 / 10', touchAction: d.has ? 'none' : 'auto' }}
            className={`relative overflow-hidden rounded-xl border border-black/20 select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500/70 ${
              device === 'phone' ? 'w-40' : 'w-full'
            } ${canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
          >
            {d.has && <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: pal.page, opacity: alpha }} />}
            <div className="pointer-events-none relative flex h-full flex-col gap-[6%] p-[6%]">
              <div className="flex items-center gap-[4%]">
                <div className="h-[0.9rem] w-[0.9rem] shrink-0 rounded-[0.3rem]" style={{ backgroundColor: pal.line }} />
                <div className="h-1.5 w-1/4 rounded-full" style={{ backgroundColor: pal.line }} />
              </div>
              {[0, 1, 2].slice(0, device === 'phone' ? 3 : 2).map((i) => (
                <div
                  key={i}
                  className="flex flex-col justify-center gap-1.5 rounded-lg px-[7%] py-[5%]"
                  style={{ backgroundColor: pal.card, flex: i === 0 ? '1.2 1 0' : '1 1 0' }}
                >
                  <div className="h-1.5 rounded-full" style={{ backgroundColor: pal.line, width: `${[58, 44, 52][i]}%` }} />
                  <div className="h-1 rounded-full" style={{ backgroundColor: pal.faint, width: `${[78, 66, 72][i]}%` }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-1.5 flex items-start justify-between gap-3">
          <p className="text-[0.6875rem] leading-relaxed text-neutral-500">
            {!d.has
              ? 'No photo: the normal background is used.'
              : canMove
                ? 'Drag the picture, or use the arrow keys, to choose which part shows. Nothing is stretched.'
                : 'This photo fits the screen exactly.'}
          </p>
          {canMove && (
            <button
              onClick={() => patch(look, { x: 50, y: 50 })}
              className="hit no-press inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium text-neutral-400 hover:text-white"
            >
              <RotateCcw className="h-3 w-3" />
              Centre
            </button>
          )}
        </div>

        <p className="mb-1.5 mt-4 text-xs text-neutral-400">Tint behind the cards</p>
        <div role="group" aria-label="Overlay strength" className={segCls}>
          {STRENGTHS.map((s) => (
            <button
              key={s}
              onClick={() => patch(look, { strength: s })}
              disabled={!d.has}
              aria-pressed={d.strength === s}
              className={segBtn(d.strength === s && d.has)}
            >
              {STRENGTH_LABEL[s]}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-neutral-500">
          A soft cover that keeps text readable. Bright photos get a little extra automatically.
        </p>

        {error && (
          <p role="alert" className="mt-3 text-xs text-red-400">
            {error}
          </p>
        )}

        <input
          ref={fileRef}
          type="file"
          data-testid="bg-file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            void onPick(f);
          }}
        />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={busyNow} className={actionCls}>
            <ImagePlus className="h-4 w-4" />
            {busy === 'prepare' ? 'Preparing…' : d.has ? 'Change photo' : 'Choose photo'}
          </button>
          <button onClick={removePhoto} disabled={busyNow || !d.has} className={actionCls}>
            <Trash2 className="h-4 w-4" />
            Remove photo
          </button>
        </div>
        <button
          onClick={() => void save()}
          disabled={!dirty || busyNow}
          className="hit no-press mt-2 w-full rounded-lg bg-green-500 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-green-400 disabled:opacity-40 disabled:hover:bg-green-500"
        >
          {busy === 'save' ? 'Saving…' : dirty ? 'Save' : 'Nothing to save'}
        </button>

        <p className="mt-3 text-[0.6875rem] leading-relaxed text-neutral-500">
          Photos stay on this device. They are shrunk to fit, are not part of backups, and never change your habits.
        </p>
      </div>
    </div>
  );
}
