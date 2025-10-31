// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
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

// ===== Helpers =====
function normalizeBucket(name: string | undefined, projectId: string): string {
  // Si viene vacío, usa el bucket real de Firebase Storage
  let bucket =
    name?.trim() ||
    // ⚠️ En tu proyecto el bucket real es *.firebasestorage.app
    `${projectId}.firebasestorage.app`;

  // Si alguien puso *.appspot.com, cámbialo al dominio correcto
  bucket = bucket.replace(/\.appspot\.com$/i, ".firebasestorage.app");

  return bucket;
}

// ===== Env vars (Vite) =====
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string;
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string;
const authDomain =
  (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ||
  `${projectId}.firebaseapp.com`;
const storageBucket = normalizeBucket(
  import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  projectId
);
const messagingSenderId = import.meta.env
  .VITE_FIREBASE_MESSAGING_SENDER_ID as string;
const appId = import.meta.env.VITE_FIREBASE_APP_ID as string;

// ===== Config =====
const firebaseConfig = {
  apiKey,
  authDomain,
  projectId,
  storageBucket, // <- ya normalizado a *.firebasestorage.app
  messagingSenderId,
  appId,
};

// ===== Init =====
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);

// ===== Google provider =====
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Persistencia local
setPersistence(auth, browserLocalPersistence).catch((err) =>
  console.warn("No se pudo establecer persistencia:", err?.message || err)
);

// ===== Auth helpers =====
export async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err: any) {
    const code = err?.code as string | undefined;
    if (
      code === "auth/popup-closed-by-user" ||
      code === "auth/popup-blocked" ||
      code === "auth/cancelled-popup-request" ||
      code === "auth/operation-not-supported-in-this-environment"
    ) {
      console.warn("Popup bloqueado/cerrado, usando redirect…");
      await signInWithRedirect(auth, googleProvider);
    } else {
      console.error("Error en login con Google:", code, err?.message);
      throw err;
    }
  }
}

export async function completeRedirectIfAny() {
  try {
    await getRedirectResult(auth);
  } catch (err: any) {
    // No hay redirect pendiente o falló; no interrumpe UX
    console.warn("Redirect no completado:", err?.message || err);
  }
}

export async function logout() {
  try {
    await signOut(auth);
  } catch (err: any) {
    console.error("Error al cerrar sesión:", err?.message || err);
  }
}

// ===== Debug breve (puedes quitarlo luego) =====
if (typeof window !== "undefined") {
  const ends = (apiKey || "").slice(-6);
  console.log("🔥 Firebase config:", {
    projectId,
    authDomain,
    storageBucket,
    apiKeyEndsWith: ends,
  });
}
