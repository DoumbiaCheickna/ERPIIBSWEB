// firebaseConfig.ts
import { initializeApp, getApps, getApp, FirebaseOptions } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyAk9ReRsOP3615ysayTcfdEpXyIHv4eCAE",
  authDomain: "gestiondesetablissementsco.firebaseapp.com",
  projectId: "gestiondesetablissementsco",
  storageBucket: "gestiondesetablissementsco.firebasestorage.app",
  messagingSenderId: "359588684947",
  appId: "1:359588684947:web:79020fc0da0c3cf2c85966",
  measurementId: "G-T3NGPP7S81",
};

// ✅ évite “Firebase App named ‘[DEFAULT]’ already exists”
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// NEW: Firestore avec cache persistant (IndexedDB) + gestion multi-onglets
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export const auth = getAuth(app);
export const storage = getStorage(app);
