// Haptic feedback (phone vibration) using the Vibration API. It works in Chrome on Android;
// browsers without it (for example Safari on iPhone) simply do nothing.

const KEY = 'habitflow:haptics';

export type HapticKind =
  | 'tap' // any button
  | 'tick' // one minute on the timer dial
  | 'success' // a habit checked off, a habit added, a backup saved
  | 'undo' // a habit unchecked
  | 'confirm' // something deleted
  | 'breakAlarm'
  | 'endAlarm';

// Lengths are in milliseconds. Very short buzzes can be hard to feel on some phones,
// so these may need tuning after trying them on the real device.
export const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 15,
  tick: 10,
  success: [20, 50, 30],
  undo: 15,
  confirm: [25, 50, 25],
  breakAlarm: [150, 80, 150],
  endAlarm: [300, 100, 300, 100, 300],
};

function readSetting(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

// Phones cannot change how hard a buzz is, only how long it lasts. So "strength" scales the
// length of each buzz (the pauses inside a pattern stay the same).
export type HapticLevel = 'light' | 'medium' | 'strong';
export const LEVELS: HapticLevel[] = ['light', 'medium', 'strong'];
const LEVEL_KEY = 'habitflow:haptics-level';
const LEVEL_FACTOR: Record<HapticLevel, number> = { light: 0.6, medium: 1, strong: 1.6 };
const MIN_MS = 8;

/** Scales the buzz lengths of a pattern. In an array, even positions are buzzes, odd are pauses. */
export function scalePattern(p: number | number[], factor: number): number | number[] {
  const s = (n: number) => Math.max(MIN_MS, Math.round(n * factor));
  return Array.isArray(p) ? p.map((n, i) => (i % 2 === 0 ? s(n) : n)) : s(p);
}

function readLevel(): HapticLevel {
  try {
    const v = localStorage.getItem(LEVEL_KEY);
    if (v === 'light' || v === 'medium' || v === 'strong') return v;
  } catch {
    /* ignore */
  }
  return 'medium';
}

let enabled = readSetting();
let level = readLevel();
let lastAt = -Infinity;
let installed = false;

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function isHapticsOn(): boolean {
  return enabled;
}

export function getHapticLevel(): HapticLevel {
  return level;
}

/** Sets the buzz length level, remembers it on this phone, and plays a sample. */
export function setHapticLevel(next: HapticLevel): void {
  level = next;
  try {
    localStorage.setItem(LEVEL_KEY, next);
  } catch {
    /* ignore */
  }
  haptic('confirm');
}

/** Turns haptics on or off and remembers the choice on this phone. */
export function setHapticsOn(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  if (on) haptic('confirm');
  else {
    try {
      navigator.vibrate?.(0); // stop anything still buzzing
    } catch {
      /* ignore */
    }
  }
}

export function haptic(kind: HapticKind): void {
  if (!enabled || !hapticsSupported()) return;
  lastAt = Date.now();
  try {
    navigator.vibrate(scalePattern(PATTERNS[kind], LEVEL_FACTOR[level]));
  } catch {
    /* vibration blocked */
  }
}

const TAPPABLE =
  'button, a[href], summary, select, label, [role="button"], input[type="checkbox"], input[type="radio"]';

/**
 * True if a click on `el` should give the light "tap" buzz: it is on a button-like element
 * that is not disabled.
 */
export function isTappable(el: Element | null): boolean {
  const hit = el?.closest(TAPPABLE);
  if (!hit) return false;
  if ((hit as HTMLButtonElement).disabled) return false;
  if (hit.getAttribute('aria-disabled') === 'true') return false;
  return true;
}

/**
 * Gives every button in the app a light tap, with one listener for the whole page. It runs
 * before the button's own handler, so a button that plays a specific pattern (success,
 * confirm...) replaces the tap.
 */
export function installTapHaptics(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener(
    'click',
    (e) => {
      if (!(e.target instanceof Element) || !isTappable(e.target)) return;
      // A label click makes the browser send a second click to its input: only buzz once.
      if (Date.now() - lastAt < 80) return;
      haptic('tap');
    },
    true
  );
}
