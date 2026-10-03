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

let enabled = readSetting();
let lastAt = -Infinity;
let installed = false;

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function isHapticsOn(): boolean {
  return enabled;
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
    navigator.vibrate(PATTERNS[kind]);
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
