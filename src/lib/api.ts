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
