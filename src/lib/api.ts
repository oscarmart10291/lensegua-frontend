import { auth } from "./firebase";

const API_URL = "http://localhost:4000";

async function authFetch(path: string, init: RequestInit = {}) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("No hay sesión activa");
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

// ===========================
// Tipos para la nueva API
// ===========================

export type ModuleProgress = {
  id: string;
  name: string;
  progress: number;
  attempts: number;
  bestScore: number;
  medal: 'none' | 'bronze' | 'silver' | 'gold';
  coinsEarned: number;
  currentLetterIndex?: number; // Para abecedario: índice de la letra actual
};

export type UserStats = {
  totalCoins: number;
  completed: number;
  medals: {
    gold: number;
    silver: number;
    bronze: number;
  };
  modules: ModuleProgress[];
};

export type IntentoResponse = {
  ok: boolean;
  progreso: {
    porcentaje: number;
    intentos: number;
    mejorPuntaje: number;
    medalla: string;
    monedasGanadas: number;
  };
  monedas: number;
  coinEarned: boolean;
};

// ===========================
// API Legacy (mantener compatibilidad)
// ===========================

export type ProgressRow = {
  module_key: string;
  lesson_key: string;
  completed: boolean;
  updated_at: string;
};

export async function getProgress(): Promise<ProgressRow[]> {
  const res = await authFetch("/api/progress");
  if (!res.ok) throw new Error("No se pudo leer progreso");
  return res.json();
}

export async function saveProgress(moduleKey: string, lessonKey: string, completed: boolean) {
  const res = await authFetch("/api/progress", {
    method: "PUT",
    body: JSON.stringify({ moduleKey, lessonKey, completed }),
  });
  if (!res.ok) throw new Error("No se pudo guardar progreso");
  return res.json();
}

export async function clearModule(moduleKey: string) {
  const res = await authFetch(`/api/progress/${moduleKey}`, { method: "DELETE" });
  if (!res.ok) throw new Error("No se pudo limpiar el módulo");
  return res.json();
}

// ===========================
// Nueva API - Sistema de progreso y monedas
// ===========================

/**
 * Obtener estadísticas completas del usuario
 */
export async function getUserStats(): Promise<UserStats> {
  const res = await authFetch("/api/stats");
  if (!res.ok) throw new Error("No se pudieron obtener las estadísticas");
  return res.json();
}

/**
 * Obtener progreso de un módulo específico
 */
export async function getModuleProgress(moduleKey: string): Promise<ModuleProgress> {
  const res = await authFetch(`/api/progreso/${moduleKey}`);
  if (!res.ok) throw new Error(`No se pudo obtener el progreso del módulo ${moduleKey}`);
  return res.json();
}

/**
 * Registrar un intento de práctica
 * @param moduleKey - Clave del módulo (ej: 'abecedario')
 * @param precision - Nivel de precisión (0-100)
 * @param correcta - Si el intento fue correcto
 * @param senaId - ID de la seña (opcional)
 * @param currentLetterIndex - Índice actual de la letra (para abecedario)
 */
export async function registrarIntento(
  moduleKey: string,
  precision: number,
  correcta: boolean,
  senaId?: number,
  currentLetterIndex?: number
): Promise<IntentoResponse> {
  const res = await authFetch("/api/intentos", {
    method: "POST",
    body: JSON.stringify({
      moduleKey,
      precision,
      correcta,
      senaId,
      currentLetterIndex,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "unknown" }));
    throw new Error(error.error || "No se pudo registrar el intento");
  }

  return res.json();
}

/**
 * Obtener señas de un módulo
 */
export async function getSenas(moduleKey: string) {
  const res = await authFetch(`/api/senas/${moduleKey}`);
  if (!res.ok) throw new Error(`No se pudieron obtener las señas del módulo ${moduleKey}`);
  return res.json();
}

/**
 * Obtener todos los módulos disponibles
 */
export async function getModulos() {
  const res = await authFetch("/api/modulos");
  if (!res.ok) throw new Error("No se pudieron obtener los módulos");
  return res.json();
}
