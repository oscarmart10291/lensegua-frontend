/**
 * Utilidades para preprocesamiento de landmarks
 */

import type { LandmarkPoint, NormalizedFrame, Sequence } from "./types";

/**
 * Convierte el formato MediaPipe (array de {x,y,z}) a NormalizedFrame
 */
export function parseLandmarks(raw: Array<{ x: number; y: number; z?: number }>): NormalizedFrame {
  return raw.map(p => ({ x: p.x, y: p.y, z: p.z ?? 0 }));
}

/**
 * Centrar landmarks en el wrist (índice 0)
 */
export function centerOnWrist(frame: NormalizedFrame): NormalizedFrame {
  const wrist = frame[0];
  return frame.map(p => ({
    x: p.x - wrist.x,
    y: p.y - wrist.y,
    z: p.z - wrist.z,
  }));
}

/**
 * Escalar landmarks usando la métrica bbox (bounding box)
 * Calcula el área del bounding box 2D y normaliza por su diagonal
 */
export function scaleByBBox(frame: NormalizedFrame): NormalizedFrame {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const p of frame) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const scale = Math.max(1e-6, Math.hypot(maxX - minX, maxY - minY));
  return frame.map(p => ({
    x: p.x / scale,
    y: p.y / scale,
    z: p.z / scale,
  }));
}

/**
 * Escalar usando la media de distancias de tips (8, 12, 16, 20) al wrist
 * Más robusto para señas donde la bbox puede variar mucho
 */
export function scaleByTips(frame: NormalizedFrame): NormalizedFrame {
  const wrist = frame[0];
  const tips = [frame[8], frame[12], frame[16], frame[20]];

  const avgDist = tips.reduce((sum, tip) => {
    const dist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y, tip.z - wrist.z);
    return sum + dist;
  }, 0) / tips.length;

  const scale = Math.max(1e-6, avgDist);
  return frame.map(p => ({
    x: p.x / scale,
    y: p.y / scale,
    z: p.z / scale,
  }));
}

/**
 * Rotación canónica para alinear la mano
 * Rota en el plano XY para alinear wrist (0) con middle_mcp (9)
 */
export function rotateCanonical(frame: NormalizedFrame): NormalizedFrame {
  const wrist = frame[0];
  const middleMcp = frame[9];

  const dx = middleMcp.x - wrist.x;
  const dy = middleMcp.y - wrist.y;
  const angle = Math.atan2(dy, dx);

  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);

  return frame.map(p => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
    z: p.z,
  }));
}

/**
 * Normaliza un frame completo:
 * 1. Centrar en wrist
 * 2. Escalar
 * 3. Opcionalmente rotar
 */
export function normalizeFrame(
  frame: NormalizedFrame,
  options: {
    scaleMode?: "bbox" | "tips";
    enableRotation?: boolean;
  } = {}
): NormalizedFrame {
  const { scaleMode = "bbox", enableRotation = false } = options;

  let normalized = centerOnWrist(frame);
  normalized = scaleMode === "tips" ? scaleByTips(normalized) : scaleByBBox(normalized);

  if (enableRotation) {
    normalized = rotateCanonical(normalized);
  }

  return normalized;
}

/**
 * Suavizado temporal simple (media móvil)
 * Aplica promedio sobre una ventana de N frames
 */
export function smoothSequence(sequence: Sequence, windowSize: number): Sequence {
  if (windowSize <= 1 || sequence.length === 0) return sequence;

  const smoothed: Sequence = [];

  for (let i = 0; i < sequence.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(sequence.length, i + Math.ceil(windowSize / 2));
    const window = sequence.slice(start, end);

    const avgFrame: NormalizedFrame = [];
    for (let j = 0; j < 21; j++) {
      let sumX = 0, sumY = 0, sumZ = 0;
      for (const frame of window) {
        sumX += frame[j].x;
        sumY += frame[j].y;
        sumZ += frame[j].z;
      }
      const count = window.length;
      avgFrame.push({
        x: sumX / count,
        y: sumY / count,
        z: sumZ / count,
      });
    }
    smoothed.push(avgFrame);
  }

  return smoothed;
}

/**
 * Reamostrar secuencia a longitud fija usando interpolación lineal
 * Útil para comparar secuencias dinámicas de diferente duración
 */
export function resampleSequence(sequence: Sequence, targetLength: number): Sequence {
  if (sequence.length === 0) return [];
  if (sequence.length === targetLength) return sequence;
  if (targetLength === 1) return [sequence[0]];

  const resampled: Sequence = [];
  const ratio = (sequence.length - 1) / (targetLength - 1);

  for (let i = 0; i < targetLength; i++) {
    const idx = i * ratio;
    const idxFloor = Math.floor(idx);
    const idxCeil = Math.min(idxFloor + 1, sequence.length - 1);
    const t = idx - idxFloor;

    const frameA = sequence[idxFloor];
    const frameB = sequence[idxCeil];

    const interpolated: NormalizedFrame = [];
    for (let j = 0; j < 21; j++) {
      interpolated.push({
        x: frameA[j].x * (1 - t) + frameB[j].x * t,
        y: frameA[j].y * (1 - t) + frameB[j].y * t,
        z: frameA[j].z * (1 - t) + frameB[j].z * t,
      });
    }
    resampled.push(interpolated);
  }

  return resampled;
}

/**
 * Validar que un frame tenga exactamente 21 puntos
 */
export function validateFrame(frame: any[]): frame is NormalizedFrame {
  return Array.isArray(frame) && frame.length === 21 &&
    frame.every(p => typeof p.x === "number" && typeof p.y === "number" && typeof p.z === "number");
}

/**
 * Validar que una secuencia tenga al menos minFrames y todos sean válidos
 */
export function validateSequence(sequence: any[], minFrames: number = 1): sequence is Sequence {
  return Array.isArray(sequence) && sequence.length >= minFrames &&
    sequence.every(frame => validateFrame(frame));
}
