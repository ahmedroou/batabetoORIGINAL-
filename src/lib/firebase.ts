
import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAFUCN6QzQ3BiLS8KCkFvwkWo9gY0kvTt4",
  authDomain: "deep-dive-the-friendship-game.firebaseapp.com",
  projectId: "deep-dive-the-friendship-game",
  storageBucket: "deep-dive-the-friendship-game.appspot.com",
  messagingSenderId: "359342640267",
  appId: "1:359342640267:web:24bcfbb409bc8bbb83d88e",
  measurementId: "G-86EHFM7J3L"
};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
