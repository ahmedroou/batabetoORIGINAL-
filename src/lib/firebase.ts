import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAFUCN6QzQ3BiLS8KCkFvwkWo9gY0kvTt4",
  authDomain: "deep-dive-the-friendship-game.firebaseapp.com",
  projectId: "deep-dive-the-friendship-game",
  storageBucket: "deep-dive-the-friendship-game.appspot.com",
  messagingSenderId: "359342640267",
  appId: "1:359342640267:web:24bcfbb409bc8bbb83d88e"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
