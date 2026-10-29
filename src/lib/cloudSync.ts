// Cloud sync, the part the app talks to (1.12). Optional and off until the person turns it on.
//
// Local-first: the app always reads and writes this device. Syncing runs in the background, a few seconds after
// a change, when the app is opened or comes back to the front, when the phone gets internet again, and when
// another device says it wrote something. A failed round changes nothing and is tried again later.
import * as store from './store.ts';
import { SyncDataError, syncOnce } from './syncEngine.ts';
import { DEFAULT_FIREBASE_CONFIG, parseFirebaseConfig } from './firebaseConfig.ts';
import type { FirebaseConfig } from './firebaseConfig.ts';
import type { Cloud, Session } from './firebaseCloud.ts';

const KEY = 'habitflow:sync';

type Saved = {
  v: 1;
  on: boolean;
  config: FirebaseConfig | null;
  email: string | null;
  last: string | null;
  /** Tells this device apart from the others, so it does not react to its own "something changed" ping. */
  device: string;
};

export type SyncStatus = 'off' | 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error';

export type SyncView = {
  on: boolean;
  configured: boolean;
  projectId: string | null;
  email: string | null;
  status: SyncStatus;
  last: string | null;
  /** The reason for 'offline' / 'error', in plain words. */
  message: string | null;
  /** One-off good news ("Loaded your data from the cloud"). */
  notice: string | null;
};

// ---------- saved settings ----------

function newDeviceId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `d${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function readSaved(): Saved {
  const fresh: Saved = { v: 1, on: false, config: null, email: null, last: null, device: newDeviceId() };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    const o = JSON.parse(raw) as Partial<Saved>;
    const config = o.config ? parseFirebaseConfig(JSON.stringify(o.config)) : null;
    return {
      v: 1,
      on: o.on === true && !!(config ?? DEFAULT_FIREBASE_CONFIG),
      config,
      email: typeof o.email === 'string' ? o.email : null,
      last: typeof o.last === 'string' ? o.last : null,
      device: typeof o.device === 'string' && o.device ? o.device : fresh.device,
    };
  } catch {
    return fresh;
  }
}

let saved = readSaved();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* the setting just will not survive a restart */
  }
}

const activeConfig = (): FirebaseConfig | null => saved.config ?? DEFAULT_FIREBASE_CONFIG;

// ---------- what the screen shows ----------

let status: SyncStatus = saved.on ? 'idle' : 'off';
let message: string | null = null;
let notice: string | null = null;
let view: SyncView = makeView();
const watchers = new Set<() => void>();

function makeView(): SyncView {
  const cfg = activeConfig();
  return {
    on: saved.on,
    configured: !!cfg,
    projectId: cfg?.projectId ?? null,
    email: saved.email,
    status,
    last: saved.last,
    message,
    notice,
  };
}

function publish(): void {
  view = makeView();
  watchers.forEach((f) => f());
}

export function getSyncView(): SyncView {
  return view;
}

export function subscribeSync(cb: () => void): () => void {
  watchers.add(cb);
  return () => watchers.delete(cb);
}

/** The line shown under "Cloud sync" in the menu. */
export function syncSummary(): string {
  const v = view;
  if (!v.on) return v.configured ? 'Off. Keep your devices in step' : 'Off. Keep your phone and PC in step';
  if (v.status === 'syncing') return 'Syncing…';
  if (v.status === 'offline') return 'On. Waiting for internet';
  if (v.status === 'error') return 'On. Needs attention';
  if (v.status === 'signed-out') return 'On. Sign in again';
  return v.last ? `On. Synced ${ago(v.last)}` : 'On';
}

export function ago(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s)) return 'a while ago';
  if (s < 45) return 'just now';
  if (s < 90) return '1 minute ago';
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 5400) return '1 hour ago';
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
}

// ---------- explaining what went wrong ----------

/** Turns an error into words for the person, and says whether it only means "no internet right now". */
export function explain(e: unknown): { offline: boolean; text: string } {
  if (e instanceof SyncDataError) return { offline: false, text: e.message };
  const err = e as { code?: unknown; name?: unknown; message?: unknown } | null;
  const code = typeof err?.code === 'string' ? err.code : '';
  const name = typeof err?.name === 'string' ? err.name : '';
  if (name === 'QuotaExceededError') return { offline: false, text: 'This device is out of storage, so the cloud data could not be saved here.' };
  if (/unavailable|network-request-failed|deadline-exceeded|network/i.test(code) || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return { offline: true, text: 'No internet right now. Your changes are safe on this device and will go up when you are back online.' };
  }
  if (code === 'permission-denied')
    return { offline: false, text: 'Google refused access. The Firestore rules from the setup guide are probably not published yet, or you are signed in with a different Google account.' };
  if (code === 'auth/unauthorized-domain')
    return { offline: false, text: 'This website address is not on the allowed list in Firebase yet. Add it under Authentication → Settings → Authorized domains.' };
  if (code === 'auth/operation-not-allowed') return { offline: false, text: 'Google sign-in is not turned on in your Firebase project yet.' };
  if (code === 'auth/popup-blocked') return { offline: false, text: 'The sign-in window was blocked. Allow pop-ups for this site and try again.' };
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return { offline: false, text: 'Sign-in was cancelled.' };
  if (code === 'auth/invalid-api-key' || code === 'auth/api-key-not-valid.-please-pass-a-valid-api-key.')
    return { offline: false, text: 'The Firebase settings look wrong. Paste them again.' };
  if (code === 'failed-precondition' || code === 'not-found')
    return { offline: false, text: 'The Firestore database has not been created in your Firebase project yet.' };
  if (code === 'resource-exhausted') return { offline: false, text: 'The free daily limit was reached. Syncing continues tomorrow; nothing is lost.' };
  if (code === 'auth/user-token-expired' || code === 'auth/requires-recent-login' || code === 'unauthenticated')
    return { offline: false, text: 'You need to sign in again.' };
  return { offline: false, text: `Syncing did not work${code ? ` (${code})` : ''}. It will try again.` };
}

// ---------- loading Firebase only when needed ----------

let cloudPromise: Promise<Cloud> | null = null;
let cloudFor: string | null = null;

/** Starts loading the Firebase code. Call when the Cloud sync window opens, so the sign-in tap is instant. */
export function preloadCloud(): Promise<Cloud> {
  const cfg = activeConfig();
  if (!cfg) return Promise.reject(new Error('Firebase settings are missing.'));
  const id = JSON.stringify(cfg);
  if (!cloudPromise || cloudFor !== id) {
    cloudFor = id;
    cloudPromise = import('./firebaseCloud.ts').then((m) => m.openCloud(cfg));
    cloudPromise.catch(() => {
      cloudPromise = null; // loading failed (offline the first time?): try again next time
    });
  }
  return cloudPromise;
}

// ---------- running a round ----------

let session: Session | null = null;
let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let retryStep = 0;
let adopting = false;
let stopListening: (() => void) | null = null;
let listeningFor: string | null = null;

const RETRY_MS = [20_000, 60_000, 5 * 60_000, 15 * 60_000];

/** Asks for a round soon. Many asks close together become one. */
export function requestSync(delayMs = 0): void {
  if (!saved.on) return;
  clearTimeout(timer);
  timer = setTimeout(() => void runRound(), delayMs);
}

function fail(e: unknown): void {
  const x = explain(e);
  message = x.text;
  status = x.offline ? 'offline' : 'error';
  if (/need to sign in/.test(x.text)) status = 'signed-out';
  if (x.text === 'Sign-in was cancelled.') status = saved.on ? 'idle' : 'off';
  if (status === 'offline' || status === 'error') {
    const wait = RETRY_MS[Math.min(retryStep++, RETRY_MS.length - 1)];
    requestSync(wait);
  }
}

async function runRound(): Promise<void> {
  if (!saved.on) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  status = 'syncing';
  message = null;
  publish();
  try {
    // No point waiting for Firebase to give up when the phone itself knows it has no connection.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw Object.assign(new Error('offline'), { code: 'unavailable' });
    const cloud = await preloadCloud();
    session ??= await cloud.restore();
    if (!session) {
      status = 'signed-out';
      message = 'You are signed out. Sign in again to keep syncing.';
      return;
    }
    const uid = session.uid;
    if (listeningFor !== uid) {
      stopListening?.();
      listeningFor = uid;
      stopListening = cloud.listen(uid, saved.device, () => requestSync(1500));
    }
    const result = await syncOnce(cloud.store(uid, saved.device), {
      read: () => store.getSyncData(),
      adopt: (db) => {
        adopting = true; // saving what came from the cloud must not start another round
        try {
          store.adoptSyncData(db);
        } finally {
          adopting = false;
        }
      },
    });
    saved = { ...saved, last: new Date().toISOString(), email: session.email ?? saved.email };
    persist();
    status = 'idle';
    retryStep = 0;
    if (result.tookCloudData) notice = 'Your data was loaded from the cloud onto this device.';
  } catch (e) {
    fail(e);
  } finally {
    running = false;
    publish();
    if (again) {
      again = false;
      requestSync(2000);
    }
  }
}

// ---------- what the person can do ----------

/** Saves the Firebase settings pasted by the person. Throws a plain-language Error if they do not look right. */
export function saveFirebaseSettings(text: string): void {
  const cfg = parseFirebaseConfig(text);
  const changed = activeConfig()?.projectId !== cfg.projectId;
  saved = { ...saved, config: cfg };
  if (changed) {
    saved = { ...saved, on: false, email: null, last: null };
    session = null;
    status = 'off';
  }
  message = null;
  persist();
  publish();
}

export function forgetFirebaseSettings(): void {
  void turnOff();
  saved = { ...saved, config: null };
  persist();
  publish();
}

/** Signs in with Google and starts syncing. Call straight from a tap, and after preloadCloud() if you can. */
export async function turnOn(): Promise<void> {
  message = null;
  notice = null;
  try {
    const cloud = await preloadCloud();
    session = await cloud.signIn();
  } catch (e) {
    const x = explain(e);
    message = x.text;
    status = x.text === 'Sign-in was cancelled.' ? (saved.on ? 'idle' : 'off') : 'error';
    publish();
    return;
  }
  saved = { ...saved, on: true, email: session.email };
  status = 'idle';
  persist();
  publish();
  requestSync(0);
}

/** Stops syncing and signs out. Everything stays on this device and in the cloud. */
export async function turnOff(): Promise<void> {
  clearTimeout(timer);
  stopListening?.();
  stopListening = null;
  listeningFor = null;
  const had = session;
  session = null;
  saved = { ...saved, on: false, email: null };
  status = 'off';
  message = null;
  notice = null;
  persist();
  publish();
  if (had && cloudPromise) {
    try {
      await (await cloudPromise).signOut();
    } catch {
      /* already signed out, or offline: nothing more to do */
    }
  }
}

/** Removes this account's data from the cloud, then turns syncing off. This device's data stays. */
export async function deleteCloudData(): Promise<boolean> {
  try {
    const cloud = await preloadCloud();
    const s = session ?? (await cloud.restore());
    if (!s) {
      message = 'Sign in first.';
      status = 'signed-out';
      publish();
      return false;
    }
    await cloud.wipe(s.uid);
  } catch (e) {
    message = explain(e).text;
    status = 'error';
    publish();
    return false;
  }
  await turnOff();
  notice = 'Your cloud data was deleted. Syncing is off; this device still has everything.';
  publish();
  return true;
}

export function syncNow(): void {
  retryStep = 0;
  requestSync(0);
}

export function clearNotice(): void {
  notice = null;
  publish();
}

// ---------- start-up ----------

let started = false;

/** Call once when the app starts. Does nothing at all unless sync was turned on before. */
export function initCloudSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  store.onLocalSave(() => {
    if (!adopting) requestSync(4000);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const old = saved.last ? Date.now() - Date.parse(saved.last) > 30_000 : true;
    if (old) requestSync(800);
  });
  window.addEventListener('online', () => {
    retryStep = 0;
    requestSync(500);
  });
  if (saved.on) requestSync(1500);
}
