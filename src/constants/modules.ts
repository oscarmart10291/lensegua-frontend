// src/constants/modules.ts

export type Module = {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
};

// Lista de módulos base (versión inicial)
export const MODULES: Module[] = [
  { key: "ABECEDARIO",     title: "Abecedario",          subtitle: "Manual A–Z",               icon: "🔤" },
  { key: "NUMEROS",        title: "Números",             subtitle: "0–20 y decenas",           icon: "🔢" },
  { key: "FRASES_SALUDOS", title: "Frases/Saludos",      subtitle: "Saludos y frases comunes", icon: "💬" },
  { key: "DIAS_SEMANA",    title: "Días de la semana",   subtitle: "Lunes–Domingo",            icon: "📅" },
  { key: "MESES",          title: "Meses",               subtitle: "Enero–Diciembre",          icon: "🗓️" },
];
