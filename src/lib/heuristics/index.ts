/**
 * Sistema de reconocimiento heurístico de señas LENSEGUA
 *
 * Exportación pública de todas las funciones y tipos
 */

// Tipos
export type {
  LandmarkPoint,
  NormalizedFrame,
  Sequence,
  SignType,
  Template,
  MatchingConfig,
  MatchingResult,
} from "./types";

export { DEFAULT_CONFIG } from "./types";

// Utilidades de landmarks
export {
  parseLandmarks,
  centerOnWrist,
  scaleByBBox,
  scaleByTips,
  rotateCanonical,
  normalizeFrame,
  smoothSequence,
  resampleSequence,
  validateFrame,
  validateSequence,
} from "./landmarkUtils";

// Utilidades de comparación
export {
  frameDistance,
  seqL2Distance,
  dtwDistance,
  distanceToScore,
  calculateTop2Margin,
  findBestMatchIndex,
} from "./comparison";

// Motor de matching
export { matchSequence } from "./matching";

// Cargador de plantillas
export type { TemplateDict } from "./templateLoader";

export {
  LENSEGUA_CONFIG,
  parseTemplateJSON,
  loadTemplates,
  loadTemplatesForLetter,
  preloadAllTemplates,
  selectImpostorTemplates,
} from "./templateLoader";
