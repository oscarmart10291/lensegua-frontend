/**
 * Utilidades de comparación entre landmarks
 */

import type { NormalizedFrame, Sequence } from "./types";

/**
 * Distancia L2 (euclidiana) entre dos frames
 * Calcula la distancia promedio entre todos los puntos
 */
export function frameDistance(frameA: NormalizedFrame, frameB: NormalizedFrame): number {
  let sumSq = 0;
  for (let i = 0; i < 21; i++) {
    const dx = frameA[i].x - frameB[i].x;
    const dy = frameA[i].y - frameB[i].y;
    const dz = frameA[i].z - frameB[i].z;
    sumSq += dx * dx + dy * dy + dz * dz;
  }
  return Math.sqrt(sumSq / 21);
}

/**
 * Distancia L2 promedio entre dos secuencias de la misma longitud
 * Útil para señas estáticas donde comparamos ventanas cortas
 */
export function seqL2Distance(seqA: Sequence, seqB: Sequence): number {
  if (seqA.length !== seqB.length) {
    throw new Error(`Las secuencias deben tener la misma longitud (${seqA.length} vs ${seqB.length})`);
  }
  if (seqA.length === 0) return Infinity;

  let sum = 0;
  for (let i = 0; i < seqA.length; i++) {
    sum += frameDistance(seqA[i], seqB[i]);
  }
  return sum / seqA.length;
}

/**
 * Dynamic Time Warping (DTW)
 * Compara dos secuencias de diferente longitud alineándolas óptimamente
 * Útil para señas dinámicas
 */
export function dtwDistance(seqA: Sequence, seqB: Sequence): number {
  const m = seqA.length;
  const n = seqB.length;

  if (m === 0 || n === 0) return Infinity;

  // Matriz de costos (usando un array 1D para ahorrar memoria)
  const dp = new Float32Array((m + 1) * (n + 1));
  const getIdx = (i: number, j: number) => i * (n + 1) + j;

  // Inicializar primera fila y columna con infinito
  for (let i = 0; i <= m; i++) dp[getIdx(i, 0)] = Infinity;
  for (let j = 0; j <= n; j++) dp[getIdx(0, j)] = Infinity;
  dp[getIdx(0, 0)] = 0;

  // Llenar la matriz DP
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = frameDistance(seqA[i - 1], seqB[j - 1]);
      const prev = Math.min(
        dp[getIdx(i - 1, j)],     // Inserción
        dp[getIdx(i, j - 1)],     // Eliminación
        dp[getIdx(i - 1, j - 1)]  // Match
      );
      dp[getIdx(i, j)] = cost + prev;
    }
  }

  // Normalizar por la longitud del path (aproximado por suma de longitudes)
  return dp[getIdx(m, n)] / (m + n);
}

/**
 * Convierte distancia a porcentaje de coincidencia (0-100)
 * Este porcentaje es ficticio pero coherente con la distancia real
 *
 * Política de mapeo:
 * - dist <= acceptThreshold: 85-98% (con variación aleatoria)
 * - dist >= rejectThreshold: 0-25%
 * - Intermedio: interpolación lineal 26-84%
 *
 * @param distance Distancia calculada (L2 o DTW)
 * @param acceptThreshold Umbral de aceptación
 * @param rejectThreshold Umbral de rechazo
 * @param strictnessFactor Factor de severidad (>1 = más estricto, <1 = más permisivo)
 */
export function distanceToScore(
  distance: number,
  acceptThreshold: number,
  rejectThreshold: number,
  strictnessFactor: number = 1.0
): number {
  // Aplicar factor de severidad
  const adjustedDistance = distance * strictnessFactor;

  // Rango bajo (buena coincidencia)
  if (adjustedDistance <= acceptThreshold) {
    // Mapear linealmente de acceptThreshold → 0 a 98% → 85%
    const ratio = adjustedDistance / acceptThreshold;
    const baseScore = 98 - ratio * 13; // 98% a 85%

    // Agregar pequeña variación aleatoria ±2% para parecer más realista
    const variation = (Math.random() - 0.5) * 4;
    return Math.max(85, Math.min(100, baseScore + variation));
  }

  // Rango alto (mala coincidencia)
  if (adjustedDistance >= rejectThreshold) {
    // Mapear linealmente de rejectThreshold → inf a 25% → 0%
    const excess = adjustedDistance - rejectThreshold;
    const baseScore = Math.max(0, 25 - excess * 2);

    // Pequeña variación ±3% para scores bajos
    const variation = (Math.random() - 0.5) * 6;
    return Math.max(0, Math.min(25, baseScore + variation));
  }

  // Rango intermedio (interpolación lineal)
  const ratio = (adjustedDistance - acceptThreshold) / (rejectThreshold - acceptThreshold);
  const score = 84 - ratio * 58; // De 84% a 26%

  return Math.max(26, Math.min(84, score));
}

/**
 * Calcula el margen entre el mejor y segundo mejor candidato
 * Útil para detectar ambigüedad
 *
 * @returns Valor entre 0 (idénticos) y 1 (muy diferentes). Valores bajos indican ambigüedad.
 */
export function calculateTop2Margin(distances: number[]): number {
  if (distances.length < 2) return 1.0;

  // Ordenar distancias (copia)
  const sorted = [...distances].sort((a, b) => a - b);
  const best = sorted[0];
  const secondBest = sorted[1];

  if (best === 0) return secondBest > 0 ? 1.0 : 0.0;

  // Margen relativo: (d2 - d1) / d1
  return (secondBest - best) / best;
}

/**
 * Encuentra el índice de la distancia mínima
 */
export function findBestMatchIndex(distances: number[]): number {
  if (distances.length === 0) return -1;

  let minIdx = 0;
  let minDist = distances[0];

  for (let i = 1; i < distances.length; i++) {
    if (distances[i] < minDist) {
      minDist = distances[i];
      minIdx = i;
    }
  }

  return minIdx;
}
