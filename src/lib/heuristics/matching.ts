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
  const targetLetter = templatesForLetter[0].letter;

  console.log(`\n🔬 MATCHING ENGINE - Letra: ${targetLetter}`);
  console.log(`   Tipo: ${signType}`);
  console.log(`   Frames capturados: ${capturedSeq.length} → preprocesados: ${preprocessed.length}`);
  console.log(`   Plantillas disponibles: ${templatesForLetter.length}`);

  // Calcular distancias contra todas las plantillas del objetivo
  const distances = templatesForLetter.map(template => {
    const templateSeq = template.frames;

    if (signType === "static") {
      return compareStatic(preprocessed, templateSeq, config);
    } else {
      return compareDynamic(preprocessed, templateSeq, config);
    }
  });

  // Encontrar la mejor coincidencia
  const bestIdx = findBestMatchIndex(distances);
  const bestDistance = distances[bestIdx];
  const bestTemplate = templatesForLetter[bestIdx];

  // Seleccionar umbrales según tipo
  const acceptThreshold = signType === "static"
    ? config.staticAcceptThreshold
    : config.dynamicAcceptThreshold;
  const rejectThreshold = signType === "static"
    ? config.staticRejectThreshold
    : config.dynamicRejectThreshold;

  console.log(`\n📏 DISTANCIAS:`);
  console.log(`   Mejor distancia: ${bestDistance.toFixed(4)}`);
  console.log(`   Umbral aceptación: ${acceptThreshold}`);
  console.log(`   Umbral rechazo: ${rejectThreshold}`);

  // === CONTROL DE FALSOS POSITIVOS ===

  // 1. Rechazo estricto: si la mejor distancia supera el umbral de rechazo
  console.log(`\n🚦 CHECK 1: Rechazo estricto`);
  if (bestDistance >= rejectThreshold) {
    console.log(`   ❌ RECHAZADO: distancia ${bestDistance.toFixed(4)} >= ${rejectThreshold}`);
    return {
      score: distanceToScore(bestDistance, acceptThreshold, rejectThreshold, config.strictnessFactor),
      distance: bestDistance,
      matchedTemplateId: bestTemplate.id,
      decision: "rejected",
      topCandidates: buildTopCandidates(templatesForLetter, distances, 3),
    };
  }
  console.log(`   ✅ PASÓ: distancia ${bestDistance.toFixed(4)} < ${rejectThreshold}`);

  // 2. Top-2 margin: si hay poca diferencia entre las dos mejores, hay ambigüedad
  const margin = calculateTop2Margin(distances);
  console.log(`\n🚦 CHECK 2: Top-2 margin`);
  console.log(`   Margen entre top-2: ${margin.toFixed(6)}`);
  console.log(`   Umbral mínimo: ${config.top2MarginThreshold}`);

  if (margin < config.top2MarginThreshold) {
    console.log(`   ⚠️ AMBIGUO: margen ${margin.toFixed(6)} < ${config.top2MarginThreshold}`);
    // Ambigüedad detectada - aplicar penalización fuerte

    // Usar distancia artificial alta para garantizar score bajo (26-50%)
    const artificialDistance = acceptThreshold + (rejectThreshold - acceptThreshold) * 0.8; // ~80% del rango

    const degradedScore = distanceToScore(
      artificialDistance,
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
  console.log(`   ✅ PASÓ: margen suficiente`);

  // 3. Impostor check: comparar contra plantillas de otras letras
  console.log(`\n🚦 CHECK 3: Impostor check`);
  if (config.enableImpostorCheck && impostorTemplates && impostorTemplates.length > 0) {
    console.log(`   Comparando contra ${impostorTemplates.length} plantillas de otras letras...`);
    const impostorDistances = impostorTemplates.map(template => {
      if (signType === "static") {
        return compareStatic(preprocessed, template.frames, config);
      } else {
        return compareDynamic(preprocessed, template.frames, config);
      }
    });

    const bestImpostorIdx = impostorDistances.indexOf(Math.min(...impostorDistances));
    const bestImpostorDist = impostorDistances[bestImpostorIdx];
    const bestImpostorLetter = impostorTemplates[bestImpostorIdx].letter;

    console.log(`   Mejor impostor: letra "${bestImpostorLetter}" con distancia ${bestImpostorDist.toFixed(4)}`);
    console.log(`   Distancia objetivo: ${bestDistance.toFixed(4)}`);

    // Si algún impostor está SIGNIFICATIVAMENTE más cerca que el objetivo, rechazar
    // Usamos diferencia absoluta en lugar de ratio para ser más permisivos
    const impostorMargin = 0.25; // Balanceado: más permisivo que 0.4 original
    const threshold = bestDistance - impostorMargin;

    console.log(`   Umbral impostor (objetivo - 0.25): ${threshold.toFixed(4)}`);

    if (bestImpostorDist < threshold) {
      console.log(`   ❌ RECHAZADO: impostor ${bestImpostorDist.toFixed(4)} < ${threshold.toFixed(4)}`);
      console.log(`   → La letra "${bestImpostorLetter}" está más cerca que "${targetLetter}"`);
      // Usar distancia artificial muy alta para garantizar score 0-25%
      const artificialDistance = rejectThreshold * 2.0;

      return {
        score: distanceToScore(artificialDistance, acceptThreshold, rejectThreshold, config.strictnessFactor),
        distance: bestDistance,
        matchedTemplateId: bestTemplate.id,
        decision: "rejected",
        topCandidates: buildTopCandidates(templatesForLetter, distances, 3),
      };
    }
    console.log(`   ✅ PASÓ: impostor no está demasiado cerca`);

    // Check adicional: si la diferencia entre objetivo e impostores es pequeña,
    // la seña no es lo suficientemente distintiva
    const avgImpostorDist = impostorDistances.reduce((a, b) => a + b, 0) / impostorDistances.length;
    const distinctiveness = avgImpostorDist - bestDistance;
    const distinctivenessThreshold = 0.08; // Balanceado: más permisivo que 0.10

    console.log(`\n🚦 CHECK 4: Distintividad`);
    console.log(`   Distancia promedio impostores: ${avgImpostorDist.toFixed(4)}`);
    console.log(`   Distancia objetivo: ${bestDistance.toFixed(4)}`);
    console.log(`   Distintividad (diferencia): ${distinctiveness.toFixed(4)}`);
    console.log(`   Umbral mínimo: ${distinctivenessThreshold}`);

    if (distinctiveness < distinctivenessThreshold) {
      console.log(`   ❌ RECHAZADO: seña no distintiva (${distinctiveness.toFixed(4)} < ${distinctivenessThreshold})`);
      const artificialDistance = rejectThreshold * 2.0;
      return {
        score: distanceToScore(artificialDistance, acceptThreshold, rejectThreshold, config.strictnessFactor),
        distance: bestDistance,
        matchedTemplateId: bestTemplate.id,
        decision: "rejected",
        topCandidates: buildTopCandidates(templatesForLetter, distances, 3),
      };
    }
    console.log(`   ✅ PASÓ: seña suficientemente distintiva`);
  } else {
    console.log(`   ⊘ DESHABILITADO o sin impostores`);
  }

  // === DECISIÓN FINAL ===
  console.log(`\n✨ DECISIÓN FINAL:`);
  const decision: "accepted" | "rejected" | "ambiguous" =
    bestDistance <= acceptThreshold ? "accepted" :
    bestDistance >= rejectThreshold ? "rejected" :
    "ambiguous";

  const score = distanceToScore(
    bestDistance,
    acceptThreshold,
    rejectThreshold,
    config.strictnessFactor
  );

  console.log(`   Distancia: ${bestDistance.toFixed(4)}`);
  console.log(`   Decision: ${decision}`);
  console.log(`   Score: ${score.toFixed(2)}%`);

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
