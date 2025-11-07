/**
 * Cargador de plantillas JSON de landmarks LENSEGUA
 *
 * Estructura esperada de archivos:
 * - Estáticas: [[[ {x, y, z}, ... 21 puntos ]]] (3 niveles de arrays, 1 frame)
 * - Dinámicas: { frames: [[ {x, y, z}, ... ], ...] } (frames[i][0] = array de 21 puntos)
 */

import type { Template, SignType, Sequence } from "./types";
import { parseLandmarks, validateSequence } from "./landmarkUtils";

/**
 * Diccionario de plantillas cargadas: { letra: Template[] }
 */
export type TemplateDict = Record<string, Template[]>;

/**
 * Configuración de letras del abecedario LENSEGUA
 * Indica qué letras son estáticas y cuáles dinámicas
 */
export const LENSEGUA_CONFIG: Record<string, SignType> = {
  // Estáticas (la mayoría)
  A: "static", B: "static", C: "static", E: "static", G: "static",
  H: "static", I: "static", K: "static", L: "static", LL: "static", M: "static",
  N: "static", O: "static", Q: "static", R: "static", T: "static",
  U: "static", V: "static", W: "static", X: "static", Y: "static", Z: "static",

  // Dinámicas (con movimiento)
  D: "dynamic", F: "dynamic", J: "dynamic", P: "dynamic", RR: "dynamic", S: "dynamic",
};

/**
 * Parsea un archivo JSON de landmarks
 *
 * @param rawData Datos crudos del JSON
 * @param letter Letra asociada
 * @param templateId Identificador único (ej: "A_1")
 * @returns Template o null si falla el parseo
 */
export function parseTemplateJSON(
  rawData: any,
  letter: string,
  templateId: string
): Template | null {
  const signType = LENSEGUA_CONFIG[letter];
  if (!signType) {
    console.warn(`Letra desconocida: ${letter}`);
    return null;
  }

  try {
    let sequence: Sequence;

    // Detectar si tiene el campo "frames" (formato con metadata)
    let framesData: any;
    if (rawData && typeof rawData === "object" && "frames" in rawData) {
      framesData = rawData.frames;
    } else {
      framesData = rawData;
    }

    if (signType === "static") {
      // Formato estático: [[[ {x,y,z}, ... ]]]
      // Navegamos a través de los 3 niveles de arrays
      const framesLevel = framesData; // Nivel 1
      if (!Array.isArray(framesLevel) || framesLevel.length === 0) {
        throw new Error("Formato estático inválido: no hay frames");
      }

      const frameLevel = framesLevel[0]; // Nivel 2

      // Detectar archivos corruptos con [[null]]
      if (frameLevel === null || frameLevel === undefined) {
        throw new Error("Archivo corrupto: frameLevel es null/undefined");
      }

      if (!Array.isArray(frameLevel) || frameLevel.length === 0) {
        throw new Error("Formato estático inválido: no hay frame interno");
      }

      const landmarks = frameLevel[0]; // Nivel 3 (los 21 puntos)

      // Detectar archivos corruptos con [[null]]
      if (landmarks === null || landmarks === undefined) {
        throw new Error("Archivo corrupto: landmarks es null/undefined");
      }

      if (!Array.isArray(landmarks) || landmarks.length !== 21) {
        throw new Error(`Formato estático inválido: esperaba 21 puntos, encontró ${landmarks?.length}`);
      }

      sequence = [parseLandmarks(landmarks)];

    } else {
      // Formato dinámico: [[ {x,y,z}, ... ], ...]
      // donde cada elemento del array exterior es un frame
      let frames: any[];

      if (Array.isArray(framesData)) {
        frames = framesData;
      } else {
        throw new Error("Formato dinámico inválido: no se encontró array de frames");
      }

      if (frames.length === 0) {
        throw new Error("Formato dinámico inválido: frames vacío");
      }

      sequence = [];
      for (let i = 0; i < frames.length; i++) {
        const frameData = frames[i];

        // Detectar archivos corruptos
        if (frameData === null || frameData === undefined) {
          throw new Error(`Frame ${i} es null/undefined (archivo corrupto)`);
        }

        // frames[i] puede ser directamente el array de 21 puntos,
        // o puede ser frames[i][0]
        let landmarks: any[];
        if (Array.isArray(frameData) && frameData.length > 0) {
          if (typeof frameData[0] === "object" && frameData[0] !== null && "x" in frameData[0]) {
            // Es directamente el array de puntos
            landmarks = frameData;
          } else if (Array.isArray(frameData[0])) {
            // Es frames[i][0]
            landmarks = frameData[0];

            // Detectar null dentro del array
            if (landmarks === null || landmarks === undefined) {
              throw new Error(`Frame ${i}[0] es null/undefined (archivo corrupto)`);
            }
          } else {
            throw new Error(`Frame ${i} tiene formato inválido`);
          }
        } else {
          throw new Error(`Frame ${i} no es un array`);
        }

        if (landmarks.length !== 21) {
          throw new Error(`Frame ${i}: esperaba 21 puntos, encontró ${landmarks.length}`);
        }

        sequence.push(parseLandmarks(landmarks));
      }
    }

    // Validar la secuencia
    if (!validateSequence(sequence, 1)) {
      throw new Error("La secuencia parseada no es válida");
    }

    return {
      id: templateId,
      letter,
      type: signType,
      frames: sequence,
    };

  } catch (error) {
    // Los archivos corruptos se omiten silenciosamente
    // Puedes descomentar la línea siguiente para debugging:
    // console.warn(`⚠️ Archivo corrupto omitido: ${templateId} (letra ${letter}) -`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Carga todas las plantillas desde una estructura de carpetas
 *
 * Estructura recomendada:
 * public/landmarks/
 *   A/
 *     1.json
 *     2.json
 *     ...
 *   B/
 *     1.json
 *     ...
 *   RR/
 *     1.json
 *     2.json
 *     ...
 *
 * @param basePath Ruta base donde están las carpetas de letras (ej: "/landmarks")
 * @param letters Letras a cargar (ej: ["A", "B", "C", ...])
 * @param filesPerLetter Número de archivos JSON por letra (ej: 3)
 * @returns Promise<TemplateDict>
 */
export async function loadTemplates(
  basePath: string,
  letters: string[],
  filesPerLetter: number = 3
): Promise<TemplateDict> {
  const dict: TemplateDict = {};

  for (const letter of letters) {
    const templates: Template[] = [];

    for (let i = 1; i <= filesPerLetter; i++) {
      const url = `${basePath}/${letter}/${i}.json`;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`No se pudo cargar ${url}: ${response.status}`);
          continue;
        }

        const rawData = await response.json();
        const template = parseTemplateJSON(rawData, letter, `${letter}_${i}`);

        if (template) {
          templates.push(template);
        }
      } catch (error) {
        console.warn(`Error cargando ${url}:`, error);
      }
    }

    if (templates.length > 0) {
      dict[letter] = templates;
    }
  }

  return dict;
}

/**
 * Carga el manifest.json con la lista de archivos disponibles
 *
 * @param basePath Ruta base (ej: "/landmarks")
 * @returns Promise<Record<string, string[]>> Diccionario letra → array de nombres de archivo
 */
async function loadManifest(basePath: string): Promise<Record<string, string[]>> {
  try {
    const url = `${basePath}/manifest.json`;
    console.log(`📂 Intentando cargar manifest desde: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`❌ No se encontró manifest.json en ${basePath} (status: ${response.status}), se usará modo fallback`);
      return {};
    }
    const data = await response.json();
    console.log(`✅ Manifest cargado exitosamente. Letras disponibles: ${Object.keys(data).length}`);
    return data;
  } catch (error) {
    console.warn("❌ Error cargando manifest.json:", error);
    return {};
  }
}

/**
 * Carga plantillas de una sola letra
 *
 * @param basePath Ruta base (ej: "/landmarks")
 * @param letter Letra (ej: "A")
 * @param maxCount Número máximo de archivos a cargar (opcional, si no se especifica carga todos)
 * @returns Promise<Template[]>
 */
export async function loadTemplatesForLetter(
  basePath: string,
  letter: string,
  maxCount?: number
): Promise<Template[]> {
  const templates: Template[] = [];
  console.log(`\n🔧 loadTemplatesForLetter: letra="${letter}", maxCount=${maxCount}, basePath="${basePath}"`);

  // Intentar cargar desde manifest
  const manifest = await loadManifest(basePath);
  const files = manifest[letter];

  if (files && files.length > 0) {
    // Usar manifest
    console.log(`✅ Manifest tiene ${files.length} archivos para "${letter}"`);
    const filesToLoad = maxCount ? files.slice(0, maxCount) : files;
    console.log(`📥 Cargando ${filesToLoad.length} archivos...`);

    for (const filename of filesToLoad) {
      const url = `${basePath}/${letter}/${filename}`;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`⚠️ Error HTTP ${response.status} al cargar ${url}`);
          continue;
        }

        const rawData = await response.json();
        const templateId = filename.replace('.json', '');
        const template = parseTemplateJSON(rawData, letter, templateId);

        if (template) {
          templates.push(template);
          console.log(`  ✓ ${filename} OK`);
        } else {
          console.warn(`  ✗ ${filename} parseado como null (corrupto)`);
        }
      } catch (error) {
        console.warn(`❌ Error cargando ${url}:`, error);
      }
    }
  } else {
    // Fallback: intentar cargar archivos numerados
    console.warn(`⚠️ Manifest no tiene archivos para "${letter}", usando fallback`);
    const count = maxCount || 3;
    for (let i = 1; i <= count; i++) {
      const url = `${basePath}/${letter}/${i}.json`;
      try {
        const response = await fetch(url);
        if (!response.ok) continue;

        const rawData = await response.json();
        const template = parseTemplateJSON(rawData, letter, `${letter}_${i}`);

        if (template) {
          templates.push(template);
        }
      } catch (error) {
        // Silenciar errores en modo fallback
      }
    }
  }

  console.log(`📊 Total plantillas cargadas para "${letter}": ${templates.length}`);
  return templates;
}

/**
 * Precarga todas las plantillas al iniciar la aplicación
 * Se recomienda llamar esto en el App.tsx o en un contexto global
 *
 * @param basePath Ruta base (ej: "/landmarks")
 * @returns Promise<TemplateDict>
 */
export async function preloadAllTemplates(basePath: string = "/landmarks"): Promise<TemplateDict> {
  const allLetters = Object.keys(LENSEGUA_CONFIG);

  console.log(`Precargando plantillas para ${allLetters.length} letras...`);

  const dict = await loadTemplates(basePath, allLetters, 3);

  const loadedCount = Object.values(dict).reduce((sum, templates) => sum + templates.length, 0);
  console.log(`✓ Plantillas cargadas: ${loadedCount} archivos`);

  return dict;
}

/**
 * Selecciona N plantillas aleatorias de otras letras para impostor check
 *
 * @param templateDict Diccionario completo de plantillas
 * @param excludeLetter Letra a excluir (la letra objetivo)
 * @param count Número de impostores a seleccionar
 * @returns Template[]
 */
export function selectImpostorTemplates(
  templateDict: TemplateDict,
  excludeLetter: string,
  count: number = 5
): Template[] {
  const impostors: Template[] = [];
  const availableLetters = Object.keys(templateDict).filter(l => l !== excludeLetter);

  // Seleccionar letras aleatorias
  const shuffled = availableLetters.sort(() => Math.random() - 0.5);
  const selectedLetters = shuffled.slice(0, Math.min(count, shuffled.length));

  // Tomar 1 plantilla aleatoria de cada letra seleccionada
  for (const letter of selectedLetters) {
    const templates = templateDict[letter];
    if (templates && templates.length > 0) {
      const randomIdx = Math.floor(Math.random() * templates.length);
      impostors.push(templates[randomIdx]);
    }
  }

  return impostors;
}
