// Firebase initialization and Auth/Firestore exports (CDN modular SDK)
// Note: Keys here are client-side config and not secrets.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAnalytics, isSupported as analyticsIsSupported } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-analytics.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {
  getFirestore,
  enableIndexedDbPersistence,
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Firebase project configuration (provided by the user)
const firebaseConfig = {
  apiKey: "AIzaSyD-ITb1EOg-wp7BAEbwqL3dGYFBQJaxOi4",
  authDomain: "aadhyapath60844.firebaseapp.com",
  projectId: "aadhyapath60844",
  storageBucket: "aadhyapath60844.firebasestorage.app",
  messagingSenderId: "592453333446",
  appId: "1:592453333446:web:c6444dcf22833292b782c7",
  measurementId: "G-7M05ELLNNQ",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable offline persistence for Firestore (best effort)
try {
  enableIndexedDbPersistence(db).catch(() => {});
} catch (_) {}

// Persist sessions in local storage (PWA friendly)
export async function initAuthPersistence() {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (_) {
    // Ignore persistence errors and continue with default (in-memory)
  }
}

// Initialize Analytics if supported (optional)
export let analytics = null;
try {
  analyticsIsSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {});
} catch (_) {
  // Analytics not available in unsupported environments (e.g., http/local)
}

// Re-export commonly used auth APIs
export {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
};

// Re-export Firestore helpers for convenience
export {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  deleteDoc,
};

// Upsert a user profile with role info into Firestore
export async function ensureUserProfile(user, role) {
  try {
    if (!user || !user.uid) return;
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref).catch(() => null);
    const base = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      role: role || 'citizen',
      updatedAt: serverTimestamp(),
    };
    if (snap && snap.exists && snap.exists()) {
      await setDoc(ref, base, { merge: true });
    } else {
      await setDoc(ref, { ...base, createdAt: serverTimestamp() }, { merge: true });
    }
  } catch (_) { /* noop */ }
}
