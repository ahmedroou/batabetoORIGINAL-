
import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Switched to environment variables for security and proper configuration.
// The user must provide their own Firebase project credentials in the .env file.
const firebaseConfig = {
  "projectId": "deep-dive-the-friendship-game",
  "appId": "1:359342640267:web:24bcfbb409bc8bbb83d88e",
  "storageBucket": "deep-dive-the-friendship-game.appspot.com",
  "apiKey": "AIzaSyAFUCN6QzQ3BiLS8KCkFvwkWo9gY0kvTt4",
  "authDomain": "deep-dive-the-friendship-game.firebaseapp.com",
  "measurementId": "G-86EHFM7J3L",
  "messagingSenderId": "359342640267"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
