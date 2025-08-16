// lib/firebase.ts
// Client-side Firebase bootstrap for Next.js (App Router safe)


import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import {
  getAuth,
  type Auth,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
} from 'firebase/auth';

// Prefer ENV; fall back to current inline config (so nothing breaks).
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyAFUCN6QzQ3BiLS8KCkFvwkWo9gY0kvTt4',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'deep-dive-the-friendship-game.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'deep-dive-the-friendship-game',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'deep-dive-the-friendship-game.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '359342640267',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '1:359342640267:web:24bcfbb409bc8bbb83d88e',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? 'G-86EHFM7J3L', // optional
} as const;

// Initialize once
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Firestore is safe to create here (client SDK)
const db: Firestore = getFirestore(app);

// Auth: ensure it only runs in the browser; set robust persistence
let auth: Auth;
// eslint-disable-next-line no-constant-condition
if (typeof window !== 'undefined') {
  auth = getAuth(app);
  // choose best available persistence without breaking first paint
  (async () => {
    try {
      await setPersistence(auth!, indexedDBLocalPersistence);
    } catch {
      try {
        await setPersistence(auth!, browserLocalPersistence);
      } catch {
        await setPersistence(auth!, browserSessionPersistence);
      }
    }

    // Optional: connect to emulators in dev if flag is set
    if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true') {
      try {
        connectAuthEmulator(auth!, 'http://localhost:9099', { disableWarnings: true });
        // Firestore emulator is set up where it's used (if needed).
      } catch {
        // ignore if emulator not running
      }
    }
  })();

  // Optional & non-blocking: Analytics (only if supported by the browser)
  if (firebaseConfig.measurementId) {
    import('firebase/analytics')
      .then(async ({ getAnalytics, isSupported }) => {
        if (await isSupported()) getAnalytics(app);
      })
      .catch(() => {});
  }
}

// Exports expected by the app
export { app, db, auth };
