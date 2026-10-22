// Custom home-screen backgrounds: one optional photo for the dark look and one for the light look.
//
// Where things live (all on this device only):
//  - The photo itself: IndexedDB (database "habitflow-backgrounds"). Photos are far too big for
//    localStorage, which is shared with the habit data and holds only about 5 MB.
//  - The small settings (is there a photo, where it is positioned, how strong the overlay is):
//    localStorage key "habitflow:backgrounds". Habit data and the other settings are never touched.
//
// On the page a photo is one fixed layer (#hf-bg) behind the content, plus <html data-bg="on">, which
// is what the CSS in index.css hooks onto. With no photo there is no layer and no attribute, so the
// app looks exactly as it did before this feature.

export type Look = 'dark' | 'light';
export const LOOKS: Look[] = ['dark', 'light'];
export type Strength = 'subtle' | 'medium' | 'strong';
export const STRENGTHS: Strength[] = ['subtle', 'medium', 'strong'];

export type LookSettings = {
  /** A photo is set for this look. */
  on: boolean;
  /** Focal point in percent (0 = left/top edge, 100 = right/bottom edge). 50/50 is the centre. */
  x: number;
  y: number;
  strength: Strength;
  /** Average brightness of the stored photo, 0 (black) to 1 (white). Used to pick the overlay. */
  lum: number;
};
export type BackgroundSettings = { v: 1; rev: number; dark: LookSettings; light: LookSettings };

const SETTINGS_KEY = 'habitflow:backgrounds';
const DB_NAME = 'habitflow-backgrounds';
const STORE = 'images';

/** Longest side of a stored photo, in pixels. Bigger photos are shrunk (never stretched). */
export const MAX_SIDE = 2560;
/** Refuse files over this size before even trying to read them. */
export const MAX_FILE_BYTES = 40 * 1024 * 1024;
/** Refuse pictures with more pixels than this (a decoded 150-megapixel picture would need ~600 MB). */
const MAX_PIXELS = 150_000_000;

/** An error with a message that is fine to show to the person. */
export class BackgroundError extends Error {}

export const defaultLook = (): LookSettings => ({ on: false, x: 50, y: 50, strength: 'medium', lum: 0.5 });
const defaults = (): BackgroundSettings => ({ v: 1, rev: 0, dark: defaultLook(), light: defaultLook() });

// ---------- Settings ----------

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function cleanLook(v: unknown): LookSettings {
  const d = defaultLook();
  if (!v || typeof v !== 'object') return d;
  const o = v as Record<string, unknown>;
  const num = (k: string, fallback: number, lo: number, hi: number) =>
    typeof o[k] === 'number' && Number.isFinite(o[k] as number) ? clamp(o[k] as number, lo, hi) : fallback;
  return {
    on: o.on === true,
    x: num('x', d.x, 0, 100),
    y: num('y', d.y, 0, 100),
    strength: STRENGTHS.includes(o.strength as Strength) ? (o.strength as Strength) : d.strength,
    lum: num('lum', d.lum, 0, 1),
  };
}

function readSettings(): BackgroundSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults();
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      v: 1,
      rev: typeof o.rev === 'number' && Number.isFinite(o.rev) ? o.rev : 0,
      dark: cleanLook(o.dark),
      light: cleanLook(o.light),
    };
  } catch {
    return defaults(); // storage blocked or damaged: behave as "no photos"
  }
}

let settings: BackgroundSettings = readSettings();

function withLook(s: BackgroundSettings, look: Look, value: LookSettings): BackgroundSettings {
  return look === 'dark' ? { ...s, dark: value } : { ...s, light: value };
}

function writeSettings(next: BackgroundSettings): void {
  settings = next;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: the photo still shows for this visit */
  }
}

/** A copy of the saved settings. */
export function getBackgroundSettings(): BackgroundSettings {
  return { v: 1, rev: settings.rev, dark: { ...settings.dark }, light: { ...settings.light } };
}

// ---------- IndexedDB (a tiny hand-written helper: no library) ----------

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new BackgroundError('This browser cannot keep photos here (private browsing can cause this).'));
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch {
      reject(new BackgroundError('This browser cannot keep photos here (private browsing can cause this).'));
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // The database exists but is empty (something created it half-way): add the missing store.
        const next = db.version + 1;
        db.close();
        let again: IDBOpenDBRequest;
        try {
          again = indexedDB.open(DB_NAME, next);
        } catch {
          reject(new BackgroundError('This browser cannot keep photos here (private browsing can cause this).'));
          return;
        }
        again.onupgradeneeded = () => {
          if (!again.result.objectStoreNames.contains(STORE)) again.result.createObjectStore(STORE);
        };
        again.onsuccess = () => {
          const fixed = again.result;
          fixed.onversionchange = () => {
            fixed.close();
            dbPromise = null;
          };
          resolve(fixed);
        };
        again.onerror = () => reject(new BackgroundError('This browser cannot keep photos here (private browsing can cause this).'));
        again.onblocked = () => reject(new BackgroundError('The photo storage is busy. Close other HabitFlow tabs and try again.'));
        return;
      }
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(new BackgroundError('This browser cannot keep photos here (private browsing can cause this).'));
    req.onblocked = () => reject(new BackgroundError('The photo storage is busy. Close other HabitFlow tabs and try again.'));
  });
  dbPromise.catch(() => {
    dbPromise = null; // allow a later retry
  });
  return dbPromise;
}

async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, mode);
    } catch (e) {
      dbPromise = null;
      reject(e);
      return;
    }
    const req = run(tx.objectStore(STORE));
    let result: T;
    req.onsuccess = () => {
      result = req.result;
    };
    // Resolve only when the whole transaction is safely stored, not just when the request ran.
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? req.error);
    tx.onabort = () => reject(tx.error ?? new Error('aborted'));
  });
}

const getBlob = (look: Look) => idb<Blob | undefined>('readonly', (s) => s.get(look));
const putBlob = (look: Look, blob: Blob) => idb('readwrite', (s) => s.put(blob, look));
const deleteBlob = (look: Look) => idb('readwrite', (s) => s.delete(look));

function storageMessage(e: unknown): string {
  if (e instanceof BackgroundError) return e.message;
  const name = (e as { name?: string } | null)?.name;
  if (name === 'QuotaExceededError') return 'This device is out of storage space for the photo. Free some space and try again.';
  return 'The photo could not be saved on this device. Nothing was changed.';
}

// ---------- Showing it on the page ----------

const urls: Partial<Record<Look, string>> = {};
/** Looks whose photo was meant to be there but could not be read (the browser cleared it, say). */
const missing = new Set<Look>();
let loaded = false;
const listeners = new Set<() => void>();

/** Looks that had a photo saved but it could not be loaded. Cleared when the person saves or removes it. */
export function getMissingLooks(): Look[] {
  return [...missing];
}

function currentLook(): Look {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Overlay opacity: a base per strength, raised when the photo is bright (dark look) or dark (light look). */
export function overlayAlpha(look: Look, strength: Strength, lum: number): number {
  const base =
    look === 'dark'
      ? { subtle: 0.62, medium: 0.72, strong: 0.84 }[strength]
      : { subtle: 0.64, medium: 0.76, strong: 0.88 }[strength];
  const hard = look === 'dark' ? lum : 1 - lum; // how much the photo fights the text
  return clamp(base + Math.max(0, hard - 0.35) * 0.4, base, 0.95);
}

function layer(create: boolean): HTMLDivElement | null {
  let el = document.getElementById('hf-bg') as HTMLDivElement | null;
  if (!el && create) {
    el = document.createElement('div');
    el.id = 'hf-bg';
    el.setAttribute('aria-hidden', 'true');
    document.body.prepend(el);
  }
  return el;
}

/** Shows the right photo (or none) for the current look. Safe to call at any time, as often as needed. */
export function applyBackground(look: Look = currentLook()): void {
  const root = document.documentElement;
  const s = settings[look];
  if (!loaded) {
    // Photos are still being read. Keep the early "photo expected" flag so the page does not flash.
    if (s.on) root.dataset.bg = 'on';
    else delete root.dataset.bg;
    return;
  }
  const url = urls[look];
  if (!s.on || !url) {
    delete root.dataset.bg;
    layer(false)?.remove();
    return;
  }
  root.dataset.bg = 'on';
  const el = layer(true)!;
  el.style.setProperty('--hf-bg-x', `${s.x}%`);
  el.style.setProperty('--hf-bg-y', `${s.y}%`);
  el.style.setProperty('--hf-bg-a', String(overlayAlpha(look, s.strength, s.lum)));
  if (el.dataset.src !== url) {
    // Show it only once it is decoded, so a big photo fades in instead of popping in half-drawn.
    const fresh = !el.dataset.src; // a brand-new layer fades in; an existing one just swaps picture
    el.dataset.src = url;
    if (fresh) el.classList.remove('ready');
    const probe = new Image();
    const show = () => {
      if (el.dataset.src !== url) return;
      el.style.setProperty('--hf-bg-img', `url("${url}")`);
      // Two frames: the browser must see the opacity-0 state first or there is nothing to fade from.
      if (fresh) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('ready')));
      else el.classList.add('ready');
    };
    probe.onload = show;
    probe.onerror = () => {
      if (el.dataset.src !== url) return;
      // The stored picture cannot be drawn: fall back to the normal look rather than a blank page.
      el.remove();
      delete root.dataset.bg;
    };
    probe.src = url;
  }
}

function setUrl(look: Look, blob: Blob | undefined): void {
  if (urls[look]) URL.revokeObjectURL(urls[look]!);
  if (blob) urls[look] = URL.createObjectURL(blob);
  else delete urls[look];
}

function notify(): void {
  listeners.forEach((l) => l());
}

/** Calls `fn` whenever the saved backgrounds change (also from another tab). Returns a stop function. */
export function onBackgroundsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Reads the saved photos from storage and shows the right one. Never throws. */
export async function loadBackgrounds(): Promise<void> {
  settings = readSettings();
  let changed = false;
  for (const look of LOOKS) {
    if (!settings[look].on) {
      setUrl(look, undefined);
      continue;
    }
    try {
      const blob = await getBlob(look);
      if (blob && blob.size > 0) {
        setUrl(look, blob);
        missing.delete(look);
      } else {
        throw new Error('no photo');
      }
    } catch {
      // The settings say there is a photo but it cannot be read: go back to the default look.
      setUrl(look, undefined);
      missing.add(look);
      settings = look === 'dark'
        ? { ...settings, dark: { ...settings.dark, on: false } }
        : { ...settings, light: { ...settings.light, on: false } };
      changed = true;
    }
  }
  if (changed) writeSettings({ ...settings, rev: settings.rev + 1 });
  loaded = true;
  applyBackground();
  notify();
}

/** The saved photo for a look as a picture address the page can show, or null. */
export function getBackgroundUrl(look: Look): string | null {
  return settings[look].on ? urls[look] ?? null : null;
}

/** Start-up: show the photo, and follow changes made in another tab. */
export function initBackgrounds(): void {
  void loadBackgrounds();
  window.addEventListener('storage', (e) => {
    if (e.key === SETTINGS_KEY) void loadBackgrounds();
  });
}

// ---------- Saving and removing ----------

export type Change =
  | { kind: 'set'; blob: Blob; x: number; y: number; strength: Strength; lum: number }
  | { kind: 'adjust'; x: number; y: number; strength: Strength }
  | { kind: 'remove' };

/**
 * Saves the changes for each look, photo first and settings only after the photo is safely stored,
 * so the settings never point at a photo that is not there. Throws a BackgroundError with a
 * readable message if something fails; looks that were already saved stay saved.
 */
export async function saveBackgrounds(changes: Partial<Record<Look, Change>>): Promise<void> {
  let next: BackgroundSettings = { ...settings };
  let failure: unknown = null;
  for (const look of LOOKS) {
    const c = changes[look];
    if (!c) continue;
    try {
      if (c.kind === 'set') {
        if (c.blob.size === 0) throw new BackgroundError('That picture came out empty. Please choose another.');
        await putBlob(look, c.blob);
        setUrl(look, c.blob);
        next = withLook(next, look, {
          on: true,
          x: clamp(c.x, 0, 100),
          y: clamp(c.y, 0, 100),
          strength: c.strength,
          lum: clamp(c.lum, 0, 1),
        });
      } else if (c.kind === 'adjust') {
        if (!next[look].on) continue;
        next = withLook(next, look, { ...next[look], x: clamp(c.x, 0, 100), y: clamp(c.y, 0, 100), strength: c.strength });
      } else {
        try {
          await deleteBlob(look);
        } catch {
          /* nothing stored, or storage unavailable: removing the setting is what matters */
        }
        setUrl(look, undefined);
        next = withLook(next, look, defaultLook());
      }
      missing.delete(look);
    } catch (e) {
      failure = e;
      break;
    }
  }
  writeSettings({ ...next, rev: next.rev + 1 });
  loaded = true;
  applyBackground();
  notify();
  if (failure) throw new BackgroundError(storageMessage(failure));
}

// ---------- Importing a photo ----------

export type Processed = { blob: Blob; width: number; height: number; lum: number };

const FRIENDLY_TYPES = 'JPEG, PNG, WebP, GIF or BMP';

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

/** Checks the file before decoding it. Throws a readable BackgroundError for anything we cannot use. */
export function checkFile(file: File): void {
  const type = (file.type || '').toLowerCase();
  const ext = extOf(file.name);
  if (type === 'image/svg+xml' || ext === 'svg') {
    throw new BackgroundError(`SVG drawings are not supported. Choose a photo (${FRIENDLY_TYPES}).`);
  }
  if (type === 'image/heic' || type === 'image/heif' || ext === 'heic' || ext === 'heif') {
    throw new BackgroundError(`HEIC photos cannot be opened by this browser. Choose a ${FRIENDLY_TYPES} picture instead.`);
  }
  if (type && !type.startsWith('image/')) {
    throw new BackgroundError(`That file is not a picture. Choose a photo (${FRIENDLY_TYPES}).`);
  }
  if (!type && !['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'].includes(ext)) {
    throw new BackgroundError(`That file is not a picture this app can use. Choose a photo (${FRIENDLY_TYPES}).`);
  }
  if (file.size === 0) throw new BackgroundError('That file is empty.');
  if (file.size > MAX_FILE_BYTES) {
    throw new BackgroundError('That photo is too big (over 40 MB). Choose a smaller one.');
  }
}

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: File): Promise<Decoded> {
  // Preferred: createImageBitmap, which also applies the camera's rotation flag.
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() };
    } catch {
      /* fall through to the <img> route */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode'));
      img.src = url;
    });
    // <img> shows the picture the right way up by itself (modern browsers read the rotation flag).
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Turns a chosen file into the picture that gets stored: checked, upright, shrunk so its long side is
 * at most 2560 px (never enlarged), flattened onto the look's page colour (so see-through PNGs look
 * right), and saved as WebP (JPEG where WebP is not available). Throws a readable BackgroundError.
 */
export async function processImage(file: File, look: Look): Promise<Processed> {
  checkFile(file);
  let dec: Decoded;
  try {
    dec = await decode(file);
  } catch {
    throw new BackgroundError('That picture could not be opened. It may be damaged or in a format this browser does not support.');
  }
  try {
    const { width, height } = dec;
    if (!width || !height) throw new BackgroundError('That picture has no size. Please choose another.');
    if (width * height > MAX_PIXELS) throw new BackgroundError('That picture is far too large to use. Choose a smaller one.');
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new BackgroundError('This browser cannot prepare pictures.');
    ctx.fillStyle = look === 'dark' ? '#0a0a0a' : '#f4efe4';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(dec.source, 0, 0, w, h);

    // Average brightness from a tiny copy: decides how strong the overlay needs to be.
    const t = document.createElement('canvas');
    t.width = 24;
    t.height = 24;
    const tctx = t.getContext('2d');
    let lum = 0.5;
    if (tctx) {
      tctx.drawImage(canvas, 0, 0, 24, 24);
      const px = tctx.getImageData(0, 0, 24, 24).data;
      let sum = 0;
      for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      lum = clamp(sum / (px.length / 4) / 255, 0, 1);
    }

    let blob = await toBlob(canvas, 'image/webp', 0.86);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.88);
    if (!blob || blob.size === 0) throw new BackgroundError('That picture could not be prepared. Please try another.');
    canvas.width = canvas.height = 0; // let the browser free the memory now
    return { blob, width: w, height: h, lum };
  } finally {
    dec.close();
  }
}

/** Short status for the menu, e.g. "Dark: your photo · Light: default". */
export function backgroundSummary(): string {
  const part = (look: Look) => `${look === 'dark' ? 'Dark' : 'Light'}: ${settings[look].on ? 'your photo' : 'default'}`;
  return `${part('dark')} · ${part('light')}`;
}
