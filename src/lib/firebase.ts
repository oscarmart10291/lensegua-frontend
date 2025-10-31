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
  // ===== añadido =====
  initializeAuth,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  Auth,
} from "firebase/auth";
import { getStorage } from "firebase/storage";

// ===== Helpers =====
function normalizeBucket(name: string | undefined, projectId: string): string {
  let bucket =
    name?.trim() || `${projectId}.firebasestorage.app`;
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
  storageBucket, // <- *.firebasestorage.app
  messagingSenderId,
  appId,
};

// ===== Init =====
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ---- Auth con persistencias seguras (sin cambiar tu API) ----
let _auth: Auth;
try {
  // initializeAuth permite pasar varias persistencias para entornos con restricciones (iOS webview)
  _auth = initializeAuth(app, {
    persistence: [
      indexedDBLocalPersistence,
      browserLocalPersistence,
      inMemoryPersistence,
    ],
  });
} catch {
  // Si ya estaba inicializado (HMR) caemos al getAuth
  _auth = getAuth(app);
}
export const auth = _auth;

export const storage = getStorage(app);

// ===== Google provider =====
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Persistencia local (intentamos forzar la mejor disponible, manteniendo tu llamada existente)
setPersistence(auth, indexedDBLocalPersistence)
  .catch(() => setPersistence(auth, browserLocalPersistence))
  .catch((err) =>
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
    const msg = String(err?.message || "");
    // En iOS webviews / storage particionado, Firebase lanza este mensaje.
    // Lo ignoramos silenciosamente para no romper la UX.
    if (msg.includes("missing initial state")) {
      return;
    }
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
