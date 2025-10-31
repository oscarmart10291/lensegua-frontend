// src/auth/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  auth,
  loginWithGoogle,
  logout as firebaseLogout,
  completeRedirectIfAny,
} from "../lib/firebase"; // ✅ ruta relativa correcta

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1) Intenta completar un posible redirect (no bloquea el listener)
    completeRedirectIfAny().catch((e) => {
      console.warn("Redirect no completado:", e?.message || e);
    });

    // 2) Siempre monta el listener de auth (clave para no quedar en loading)
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setLoading(false);
    });

    // Cleanup correcto para evitar fugas en HMR / cambios de ruta
    return () => unsub();
  }, []);

  // ====== Login con Google ======
  const login = async () => {
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error("Error al iniciar sesión con Google:", err);
    }
  };

  // ====== Logout ======
  const logout = async () => {
    try {
      await firebaseLogout();
    } catch (err) {
      console.error("Error al cerrar sesión:", err);
    }
  };

  // ====== Obtener ID Token ======
  const getIdToken = async () => {
    const u = auth.currentUser;
    return u ? await u.getIdToken() : null;
  };

  const value: AuthCtx = {
    user,
    loading,
    login,
    logout,
    getIdToken,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ====== Hook personalizado ======
export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de un <AuthProvider>");
  }
  return ctx;
}
