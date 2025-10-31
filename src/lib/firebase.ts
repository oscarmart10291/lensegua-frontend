// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  initializeAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
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
  storageBucket,
  messagingSenderId,
  appId,
};

// ===== Init =====
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ===== Auth con persistencias seguras =====
let _auth: Auth;
try {
  _auth = initializeAuth(app, {
    persistence: [
      indexedDBLocalPersistence,
      browserLocalPersistence,
      inMemoryPersistence,
    ],
  });
} catch {
  _auth = getAuth(app);
}
export const auth = _auth;
export const storage = getStorage(app);

// ===== Google Provider =====
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// ===== Persistencia local segura =====
setPersistence(auth, indexedDBLocalPersistence)
  .catch(() => setPersistence(auth, browserLocalPersistence))
  .catch(() => setPersistence(auth, inMemoryPersistence))
  .catch((err) =>
    console.warn("No se pudo establecer persistencia:", err?.message || err)
  );

// ===== Login con Google =====
export async function loginWithGoogle() {
  try {
    if (!authDomain || authDomain.trim() === "") {
      throw new Error("Firebase AuthDomain no configurado. Revisa tus variables .env");
    }
    await signInWithPopup(auth, googleProvider);
  } catch (err: any) {
    const code = err?.code || "";
    if (
      code === "auth/popup-closed-by-user" ||
      code === "auth/popup-blocked" ||
      code === "auth/cancelled-popup-request" ||
      code === "auth/operation-not-supported-in-this-environment"
    ) {
      console.warn("Popup bloqueado/cerrado, usando redirect...");
      await signInWithRedirect(auth, googleProvider);
    } else {
      console.error("Error en login con Google:", code, err?.message);
      throw err;
    }
  }
}

// ===== Completar redirect (si lo hubo) =====
export async function completeRedirectIfAny() {
  try {
    await getRedirectResult(auth);
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (msg.includes("missing initial state")) {
      // Safari / iOS WebView: no interrumpir UX
      console.warn("Ignorado: missing initial state (entorno iOS aislado)");
      return;
    }
    console.warn("Redirect no completado:", err?.message || err);
  }
}

// ===== Logout =====
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
