/**
 * Tipos para el sistema de reconocimiento heurístico de señas LENSEGUA
 */

/** Punto 3D de MediaPipe */
export type LandmarkPoint = {
  x: number;
  y: number;
  z: number;
};

/** Frame normalizado (21 puntos) */
export type NormalizedFrame = LandmarkPoint[];

/** Secuencia de frames */
export type Sequence = NormalizedFrame[];

/** Tipo de seña */
export type SignType = "static" | "dynamic";

/** Plantilla de referencia */
export type Template = {
  id: string;           // Identificador único (ej: "A_1", "RR_2")
  letter: string;       // Letra (ej: "A", "RR")
  type: SignType;       // Tipo de seña
  frames: Sequence;     // Secuencia de frames (1 para estáticas, N para dinámicas)
};

/** Configuración del matching */
export type MatchingConfig = {
  // Preprocesamiento
  enableRotation: boolean;
  smoothingWindow: number;

  // Parámetros para estáticas
  staticWindowSize: number;        // Número de frames a considerar
  staticAcceptThreshold: number;   // Distancia para aceptar (4-6)
  staticRejectThreshold: number;   // Distancia para rechazar (18-25)

  // Parámetros para dinámicas
  dynamicResampleLength: number;   // Longitud de resample (40)
  dynamicAcceptThreshold: number;  // Distancia DTW para aceptar (8-12)
  dynamicRejectThreshold: number;  // Distancia DTW para rechazar (35-45)

  // Control de falsos positivos
  top2MarginThreshold: number;     // Margen mínimo entre top-1 y top-2
  enableImpostorCheck: boolean;    // Activar comprobación de impostores
  strictnessFactor: number;        // Factor de severidad (1.0 = normal)

  // Captura
  minFramesRequired: number;       // Mínimo de frames válidos (20)
  countdownSeconds: number;        // Duración del countdown (3)
};

/** Resultado del matching */
export type MatchingResult = {
  score: number;              // Porcentaje de coincidencia 0-100 (ficticio pero coherente)
  distance: number;           // Distancia real calculada
  matchedTemplateId: string;  // ID de la plantilla que mejor coincide
  decision: "accepted" | "rejected" | "ambiguous";  // Decisión final
  topCandidates?: Array<{     // Top candidatos para debug
    templateId: string;
    distance: number;
    letter: string;
  }>;
};

/** Configuración por defecto */
export const DEFAULT_CONFIG: MatchingConfig = {
  enableRotation: false,
  smoothingWindow: 3,

  staticWindowSize: 8,
  staticAcceptThreshold: 8.0,   // MUY permisivo para debugging
  staticRejectThreshold: 25.0,  // Más alto

  dynamicResampleLength: 40,
  dynamicAcceptThreshold: 15.0,  // MUY permisivo para debugging
  dynamicRejectThreshold: 50.0,  // Más alto

  top2MarginThreshold: 0.001,  // Casi desactivado
  enableImpostorCheck: false,   // DESACTIVADO temporalmente para debugging
  strictnessFactor: 1.0,

  minFramesRequired: 20,
  countdownSeconds: 3,
};
