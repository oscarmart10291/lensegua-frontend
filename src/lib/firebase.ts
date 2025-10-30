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

// ====== Variables de entorno (Vite) ======
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string;

// Usa valores de entorno o defaults seguros
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain:
    (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ||
    `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket:
    (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ||
    `${projectId}.appspot.com`,
  messagingSenderId: import.meta.env
    .VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

// ====== Inicialización segura ======
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);

// ====== Provider de Google ======
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// ====== Persistencia de sesión (localStorage) ======
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("No se pudo establecer persistencia:", err.message);
});

// ====== Funciones de autenticación ======
export async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err: any) {
    const code = err?.code as string | undefined;

    // Fallback automático si el popup falla o se bloquea
    if (
      code === "auth/popup-closed-by-user" ||
      code === "auth/popup-blocked" ||
      code === "auth/cancelled-popup-request" ||
      code === "auth/operation-not-supported-in-this-environment"
    ) {
      console.warn("Popup bloqueado o cerrado, usando redirect...");
      await signInWithRedirect(auth, googleProvider);
    } else {
      console.error("Error en login con Google:", code, err?.message);
      throw err;
    }
  }
}

// Completa flujos de redirección (debe llamarse al iniciar la app)
export async function completeRedirectIfAny() {
  try {
    await getRedirectResult(auth);
  } catch (err: any) {
    console.warn("No hay redirect pendiente o falló:", err.message);
  }
}

// Cierra la sesión del usuario
export async function logout() {
  try {
    await signOut(auth);
  } catch (err: any) {
    console.error("Error al cerrar sesión:", err.message);
  }
}

// ====== Debug opcional (quitar en producción) ======
// Muestra un resumen de configuración para verificar que las envs se inyectan bien
if (import.meta.env.DEV || window.location.hostname.includes("netlify")) {
  console.log("✅ Firebase config cargada:", {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    storageBucket: firebaseConfig.storageBucket,
    apiKeyEndsWith: firebaseConfig.apiKey?.slice(-6),
  });
}
