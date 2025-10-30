// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from "firebase/auth";
import { getStorage } from "firebase/storage";

// ====== Variables de entorno (Vite) ======
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string;

// Si no defines VITE_FIREBASE_STORAGE_BUCKET, usa "<projectId>.appspot.com"
const storageBucket =
  (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ||
  `${projectId}.appspot.com`;

// Si no defines VITE_FIREBASE_AUTH_DOMAIN, usa "<projectId>.firebaseapp.com"
const authDomain =
  (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ||
  `${projectId}.firebaseapp.com`;

// ====== Configuración de Firebase ======
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
export const storage = getStorage(app);

// ====== Provider de Google ======
export const googleProvider = new GoogleAuthProvider();
// Fuerza selector de cuenta (evita sesiones “fantasma”)
googleProvider.setCustomParameters({ prompt: "select_account" });

// ====== Persistencia de sesión (localStorage) ======
setPersistence(auth, browserLocalPersistence).catch(() => {});

// ====== Helpers de autenticación ======
export async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err: any) {
    const code = err?.code as string | undefined;
    // Fallback si el popup se bloquea o el entorno no lo soporta
    if (
      code === "auth/popup-closed-by-user" ||
      code === "auth/popup-blocked" ||
      code === "auth/cancelled-popup-request" ||
      code === "auth/operation-not-supported-in-this-environment"
    ) {
      await signInWithRedirect(auth, googleProvider);
    } else {
      console.error("Login error:", code, err?.message);
      throw err;
    }
  }
}

// Debe llamarse una vez al montar la app para completar flujos por redirect
export async function completeRedirectIfAny() {
  try {
    await getRedirectResult(auth);
  } catch {
    // No hay redirect pendiente; ignora
  }
}

// Cierra la sesión
export async function logout() {
  await signOut(auth);
}
