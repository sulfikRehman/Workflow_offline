// Dark / light / follow-the-phone appearance. Only a tiny bit of state, kept on this device.
export type ThemePref = 'dark' | 'light' | 'auto';
export const THEME_PREFS: ThemePref[] = ['dark', 'light', 'auto'];

const KEY = 'habitflow:theme';
const META_COLOR = { dark: '#0a0a0a', light: '#f5f5f5' };

function isPref(v: unknown): v is ThemePref {
  return v === 'dark' || v === 'light' || v === 'auto';
}

/** The saved choice. Dark is the default, as before. */
export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (isPref(v)) return v;
  } catch {
    /* storage blocked */
  }
  return 'dark';
}

/** Which look to show for a choice. `systemLight` says whether the phone itself is in light mode. */
export function resolveTheme(pref: ThemePref, systemLight: boolean): 'dark' | 'light' {
  if (pref === 'auto') return systemLight ? 'light' : 'dark';
  return pref;
}

function systemIsLight(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  } catch {
    return false;
  }
}

/** Puts the look on the page. */
export function applyTheme(pref: ThemePref = getThemePref()): 'dark' | 'light' {
  const theme = resolveTheme(pref, systemIsLight());
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[theme]);
  return theme;
}

/** Remembers a choice on this device and shows it. */
export function setThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* storage blocked: still applies for this visit */
  }
  applyTheme(pref);
}

/** While the choice is "auto", follow the phone when it switches. Returns a function that stops. */
export function watchSystemTheme(): () => void {
  let mq: MediaQueryList;
  try {
    mq = window.matchMedia('(prefers-color-scheme: light)');
  } catch {
    return () => {};
  }
  const onChange = () => {
    if (getThemePref() === 'auto') applyTheme('auto');
  };
  mq.addEventListener?.('change', onChange);
  return () => mq.removeEventListener?.('change', onChange);
}
