// The "address" of the user's own Firebase project (1.12). These values are not secrets: Firebase web apps
// always carry them in the page, and access is controlled by the sign-in and the rules in the Firebase console.
//
// Two ways to provide them:
//  - paste them in the app (Menu → Cloud sync). Saved on that device only.
//  - or fill in DEFAULT_FIREBASE_CONFIG below once, so every device that installs the app already knows them.

export type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
};

/** Fill this in (and rebuild) to skip the pasting step on every device. Leave as null otherwise. */
export const DEFAULT_FIREBASE_CONFIG: FirebaseConfig | null = null;

const REQUIRED = ['apiKey', 'authDomain', 'projectId', 'appId'] as const;
const OPTIONAL = ['storageBucket', 'messagingSenderId'] as const;

function pick(text: string, key: string): string | null {
  // Matches   apiKey: "abc"   or   "apiKey": 'abc'   (the way Firebase shows it, or as JSON).
  const m = new RegExp(`["']?${key}["']?\\s*:\\s*["'\`]([^"'\`]+)["'\`]`).exec(text);
  return m ? m[1].trim() : null;
}

/** Reads the settings from what Firebase shows (the whole `const firebaseConfig = {...}` text, or just the {...}). Throws a plain-language Error. */
export function parseFirebaseConfig(text: string): FirebaseConfig {
  const t = text.trim();
  if (!t) throw new Error('Paste the Firebase settings first.');
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const k of REQUIRED) {
    const v = pick(t, k);
    if (v) out[k] = v;
    else missing.push(k);
  }
  if (missing.length) {
    throw new Error(`Those settings are missing: ${missing.join(', ')}. Copy the whole block that Firebase shows.`);
  }
  for (const k of OPTIONAL) {
    const v = pick(t, k);
    if (v) out[k] = v;
  }
  if (/\s/.test(out.apiKey) || out.apiKey.length < 20) throw new Error('The apiKey does not look right. Copy it again.');
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(out.authDomain)) throw new Error('The authDomain does not look right. It should look like your-project.firebaseapp.com.');
  if (!/^[a-z][a-z0-9-]{4,}$/.test(out.projectId)) throw new Error('The projectId does not look right. Copy it again.');
  if (!/^\d+:\d+:[a-z]+:[0-9a-f]+$/i.test(out.appId)) throw new Error('The appId does not look right. It should look like 1:123456789:web:abc123.');
  return out as FirebaseConfig;
}
