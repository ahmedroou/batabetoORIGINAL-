
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

// Configuration is now loaded exclusively from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // optional
};

// Simple check to ensure all required config values are present.
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error("Firebase config is missing. Please set up your .env file with NEXT_PUBLIC_FIREBASE_ variables.");
}


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
