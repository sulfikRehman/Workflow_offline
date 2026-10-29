// The only file that talks to Firebase (1.12). It is loaded on demand (import('./firebaseCloud.ts')), so
// the app opens exactly as fast as before, and works offline, whether or not sync is used.
//
// Where things live in Firestore:  users/{your id}/pieces/{piece}   with { json, at }
// plus one tiny document, _ping, that a device touches after writing so the others know to look.
import { getApps, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import type { Auth, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDocsFromServer,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseConfig } from './firebaseConfig.ts';
import type { CloudStore } from './syncEngine.ts';

export type Session = { uid: string; email: string | null };

export type Cloud = {
  /** The account that is still signed in from last time, or null. Needs no internet. */
  restore(): Promise<Session | null>;
  /** Opens Google's sign-in window. Must be called straight from a tap. */
  signIn(): Promise<Session>;
  signOut(): Promise<void>;
  store(uid: string, device: string): CloudStore;
  /** Calls `onChange` when ANOTHER device wrote something. Returns a way to stop. */
  listen(uid: string, device: string, onChange: () => void): () => void;
  /** Deletes everything this account has stored in the cloud. */
  wipe(uid: string): Promise<void>;
};

const PING = '_ping';

export function openCloud(config: FirebaseConfig): Cloud {
  const name = `habitflow-${config.projectId}`;
  const app: FirebaseApp = getApps().find((a) => a.name === name) ?? initializeApp(config, name);
  const auth: Auth = getAuth(app);
  const db: Firestore = getFirestore(app);
  const pieces = (uid: string) => collection(db, 'users', uid, 'pieces');
  const session = (u: User): Session => ({ uid: u.uid, email: u.email });

  return {
    restore() {
      return new Promise((resolve) => {
        const sub: { done: boolean; stop?: () => void } = { done: false };
        sub.stop = onAuthStateChanged(auth, (u) => {
          if (sub.done) return;
          sub.done = true;
          sub.stop?.(); // (if Firebase answered at once, `stop` is not set yet and is called just below)
          resolve(u ? session(u) : null);
        });
        if (sub.done) sub.stop();
      });
    },

    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      return session(result.user);
    },

    async signOut() {
      await signOut(auth);
    },

    store(uid, device) {
      return {
        async list() {
          // From the server on purpose: with no internet this must fail, not answer "empty" from a cache.
          const snap = await getDocsFromServer(pieces(uid));
          const out: Record<string, string> = {};
          snap.forEach((d) => {
            const json = (d.data() as { json?: unknown }).json;
            if (d.id !== PING && typeof json === 'string') out[d.id] = json;
          });
          return out;
        },
        async update(id, change) {
          const ref = doc(db, 'users', uid, 'pieces', id);
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            const raw = snap.exists() ? (snap.data() as { json?: unknown }).json : null;
            const next = change(typeof raw === 'string' ? raw : null);
            if (next !== null) tx.set(ref, { json: next, at: serverTimestamp() });
          });
        },
        async touch() {
          await setDoc(doc(db, 'users', uid, 'pieces', PING), { by: device, at: serverTimestamp() });
        },
      };
    },

    listen(uid, device, onChange) {
      let first = true;
      return onSnapshot(
        doc(db, 'users', uid, 'pieces', PING),
        (snap) => {
          if (first) {
            first = false; // what was there when we started listening is not news
            return;
          }
          const by = (snap.data() as { by?: unknown } | undefined)?.by;
          if (by !== device) onChange();
        },
        () => {
          /* no internet or no access: the regular sync reports that */
        }
      );
    },

    async wipe(uid) {
      const snap = await getDocsFromServer(pieces(uid));
      const refs = snap.docs.map((d) => d.ref);
      for (let i = 0; i < refs.length; i += 400) {
        const batch = writeBatch(db);
        for (const r of refs.slice(i, i + 400)) batch.delete(r);
        await batch.commit();
      }
    },
  };
}
