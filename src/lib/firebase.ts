// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Lee variables de entorno (Vite)
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string;

// Si no defines VITE_FIREBASE_STORAGE_BUCKET, usa "<projectId>.appspot.com"
const storageBucket =
  (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ||
  `${projectId}.appspot.com`;

// Si no defines VITE_FIREBASE_AUTH_DOMAIN, usa "<projectId>.firebaseapp.com"
const authDomain =
  (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ||
  `${projectId}.firebaseapp.com`;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain,
  projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  storageBucket,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Storage para leer imágenes/videos
export const storage = getStorage(app);
