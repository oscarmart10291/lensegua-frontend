// api/prisma-client.ts
import { PrismaClient } from "@prisma/client";

// Singleton para evitar múltiples instancias en desarrollo
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Helper para asegurar que el usuario existe en la BD
export async function ensureUsuario(firebase_uid: string, correo?: string, nombre?: string) {
  const usuario = await prisma.usuario.upsert({
    where: { firebase_uid },
    update: {
      correo: correo || undefined,
      nombre: nombre || "Usuario"
    },
    create: {
      firebase_uid,
      correo: correo || null,
      nombre: nombre || "Usuario",
      monedas: 0,
    },
  });
  return usuario;
}

// Helper para obtener o crear el módulo
export async function getModuloByKey(moduleKey: string) {
  return await prisma.modulo.findUnique({
    where: { module_key: moduleKey },
  });
}
