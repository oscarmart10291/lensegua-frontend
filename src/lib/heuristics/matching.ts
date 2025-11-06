/**
 * Motor de matching heurístico con control estricto de falsos positivos
 */

import type { Template, Sequence, MatchingConfig, MatchingResult } from "./types";
import { normalizeFrame, smoothSequence, resampleSequence } from "./landmarkUtils";
import { seqL2Distance, dtwDistance, distanceToScore, calculateTop2Margin, findBestMatchIndex } from "./comparison";

/**
 * Realiza matching de una secuencia capturada contra las plantillas de una letra objetivo
 *
 * @param capturedSeq Secuencia capturada del usuario (raw, sin normalizar)
 * @param templatesForLetter Plantillas de la letra objetivo
 * @param config Configuración del matching
 * @param impostorTemplates Plantillas de otras letras para impostor check (opcional)
 * @returns Resultado con score, distancia, decisión y detalles
 */
export function matchSequence(
  capturedSeq: Sequence,
  templatesForLetter: Template[],
  config: MatchingConfig,
  impostorTemplates?: Template[]
): MatchingResult {
  if (templatesForLetter.length === 0) {
    return {
      score: 0,
      distance: Infinity,
      matchedTemplateId: "",
      decision: "rejected",
    };
  }

  // Preprocesar la secuencia capturada
  const preprocessed = preprocessSequence(capturedSeq, config);

  // Determinar el tipo de seña (estática o dinámica) según las plantillas
  const signType = templatesForLetter[0].type;

  // Calcular distancias contra todas las plantillas del objetivo
  const distances = templatesForLetter.map(template => {
    const templateSeq = template.frames;

    if (signType === "static") {
      return compareStatic(preprocessed, templateSeq, config);
    } else {
      return compareDynamic(preprocessed, templateSeq, config);
    }
  });

  console.log(`🔢 Distancias calculadas (${signType}):`, distances.map(d => d.toFixed(4)).join(", "));

  // Encontrar la mejor coincidencia
  const bestIdx = findBestMatchIndex(distances);
  const bestDistance = distances[bestIdx];
  const bestTemplate = templatesForLetter[bestIdx];

  console.log(`🎯 Mejor coincidencia: ${bestTemplate.id} con distancia ${bestDistance.toFixed(4)}`);

  // Seleccionar umbrales según tipo
  const acceptThreshold = signType === "static"
    ? config.staticAcceptThreshold
    : config.dynamicAcceptThreshold;
  const rejectThreshold = signType === "static"
    ? config.staticRejectThreshold
    : config.dynamicRejectThreshold;

  // === CONTROL DE FALSOS POSITIVOS ===

  // 1. Rechazo estricto: si la mejor distancia supera el umbral de rechazo
  if (bestDistance >= rejectThreshold) {
    return {
      score: distanceToScore(bestDistance, acceptThreshold, rejectThreshold, config.strictnessFactor),
      distance: bestDistance,
      matchedTemplateId: bestTemplate.id,
      decision: "rejected",
      topCandidates: buildTopCandidates(templatesForLetter, distances, 3),
    };
  }

  // 2. Top-2 margin: si hay poca diferencia entre las dos mejores, hay ambigüedad
  const margin = calculateTop2Margin(distances);
  console.log(`📏 Top-2 margin: ${(margin * 100).toFixed(2)}% (threshold: ${(config.top2MarginThreshold * 100).toFixed(0)}%)`);

  if (margin < config.top2MarginThreshold) {
    // Ambigüedad detectada - aplicar penalización
    console.log(`⚠️ Ambigüedad detectada: margin ${(margin * 100).toFixed(2)}% < ${(config.top2MarginThreshold * 100).toFixed(0)}%`);

    const degradedScore = distanceToScore(
      bestDistance * 1.3, // Penalizar 30%
      acceptThreshold,
      rejectThreshold,
      config.strictnessFactor
    );

    return {
      score: degradedScore,
      distance: bestDistance,
      matchedTemplateId: bestTemplate.id,
      decision: "ambiguous",
      topCandidates: buildTopCandidates(templatesForLetter, distances, 3),
    };
  }

  // 3. Impostor check: comparar contra plantillas de otras letras
  if (config.enableImpostorCheck && impostorTemplates && impostorTemplates.length > 0) {
    const impostorDistances = impostorTemplates.map(template => {
      if (signType === "static") {
        return compareStatic(preprocessed, template.frames, config);
      } else {
        return compareDynamic(preprocessed, template.frames, config);
      }
    });

    const bestImpostorDist = Math.min(...impostorDistances);
    console.log(`🕵️ Impostor check: mejor impostor = ${bestImpostorDist.toFixed(4)} vs objetivo = ${bestDistance.toFixed(4)}`);

    // Si algún impostor está más cerca que el objetivo, rechazar
    if (bestImpostorDist < bestDistance * 0.95) { // Margen del 5%
      console.log(`❌ Impostor más cercano que objetivo: ${bestImpostorDist.toFixed(4)} < ${(bestDistance * 0.95).toFixed(4)}`);
      return {
        score: distanceToScore(bestDistance * 1.5, acceptThreshold, rejectThreshold, config.strictnessFactor),
        distance: bestDistance,
        matchedTemplateId: bestTemplate.id,
        decision: "rejected",
        topCandidates: buildTopCandidates(templatesForLetter, distances, 3),
      };
    }
  }

  // === DECISIÓN FINAL ===
  console.log(`🎚️ Thresholds: accept=${acceptThreshold.toFixed(2)}, reject=${rejectThreshold.toFixed(2)}`);

  const decision: "accepted" | "rejected" | "ambiguous" =
    bestDistance <= acceptThreshold ? "accepted" :
    bestDistance >= rejectThreshold ? "rejected" :
    "ambiguous";

  console.log(`✅ Decisión final: ${decision} (distancia ${bestDistance.toFixed(4)} vs thresholds)`);

  const score = distanceToScore(
    bestDistance,
    acceptThreshold,
    rejectThreshold,
    config.strictnessFactor
  );

  return {
    score,
    distance: bestDistance,
    matchedTemplateId: bestTemplate.id,
    decision,
    topCandidates: buildTopCandidates(templatesForLetter, distances, 3),
  };
}

/**
 * Preprocesar secuencia capturada: normalizar, suavizar
 */
function preprocessSequence(sequence: Sequence, config: MatchingConfig): Sequence {
  // Normalizar cada frame
  const normalized = sequence.map(frame =>
    normalizeFrame(frame, {
      scaleMode: "bbox",
      enableRotation: config.enableRotation,
    })
  );

  // Suavizado temporal
  const smoothed = smoothSequence(normalized, config.smoothingWindow);

  return smoothed;
}

/**
 * Comparación para señas estáticas
 * Toma una ventana de los últimos N frames y compara con L2 promedio
 */
function compareStatic(
  capturedSeq: Sequence,
  templateSeq: Sequence,
  config: MatchingConfig
): number {
  // Para plantillas estáticas, templateSeq tiene 1 frame
  const templateFrame = templateSeq[0];

  // Tomar ventana de los últimos N frames capturados
  const windowSize = Math.min(config.staticWindowSize, capturedSeq.length);
  const window = capturedSeq.slice(-windowSize);

  if (window.length === 0) return Infinity;

  // Calcular distancia promedio de todos los frames en la ventana
  let sumDist = 0;
  for (const frame of window) {
    // Crear secuencia de 1 frame para usar seqL2Distance
    const dist = seqL2Distance([frame], [templateFrame]);
    sumDist += dist;
  }

  return sumDist / window.length;
}

/**
 * Comparación para señas dinámicas
 * Reamuestrea ambas secuencias y aplica DTW
 */
function compareDynamic(
  capturedSeq: Sequence,
  templateSeq: Sequence,
  config: MatchingConfig
): number {
  if (capturedSeq.length === 0 || templateSeq.length === 0) return Infinity;

  // Reamostrar ambas secuencias a longitud fija
  const resampledCaptured = resampleSequence(capturedSeq, config.dynamicResampleLength);
  const resampledTemplate = resampleSequence(templateSeq, config.dynamicResampleLength);

  // Calcular DTW
  return dtwDistance(resampledCaptured, resampledTemplate);
}

/**
 * Construye lista de top candidatos para debug
 */
function buildTopCandidates(
  templates: Template[],
  distances: number[],
  topN: number
): Array<{ templateId: string; distance: number; letter: string }> {
  const pairs = templates.map((template, idx) => ({
    templateId: template.id,
    distance: distances[idx],
    letter: template.letter,
  }));

  pairs.sort((a, b) => a.distance - b.distance);

  return pairs.slice(0, topN);
}
