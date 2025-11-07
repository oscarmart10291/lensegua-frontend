// src/pages/tests.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Navbar from "../components/Navbar";
import s from "./tests.module.css";
import {
  Coins,
  Trophy,
  Star,
  ChevronRight,
  Camera,
  X,
  ChevronLeft as Left,
  ChevronRight as Right,
  CheckCircle,
} from "lucide-react";

// 👇 Si ya lo tenías en otra ruta, ajusta el import
import { MODULES } from "../constants/modules";

// 👇 Utilidades de Firebase Storage que ya usas en LessonMedia
import { getAbecedarioMaybe as getAbecedarioUrls, AbcMediaItem } from "../lib/storage";

// 👇 MediaPipe Hands
import { Hands, HAND_CONNECTIONS, Results } from "@mediapipe/hands";
import { drawConnectors } from "@mediapipe/drawing_utils";

// 👇 Sistema heurístico (en lugar de TensorFlow)
import {
  matchSequence,
  parseLandmarks,
  loadTemplatesForLetter,
  selectImpostorTemplates,
  DEFAULT_CONFIG,
  type Template,
  type Sequence,
  type TemplateDict,
} from "../lib/heuristics";

// 👇 API para progreso y monedas
import { getUserStats, registrarIntento, UserStats } from "../lib/api";
import { useAuth } from "../auth/AuthContext";

type MedalTier = "none" | "bronze" | "silver" | "gold";
type MPPoint = { x: number; y: number; z?: number };

export type ModuleProgress = {
  id: string;
  name: string;
  subtitle: string;
  progress: number;
  attempts: number;
  bestScore: number;
  locked?: boolean;
  medal: MedalTier;
  coinsEarned: number;
};

function medalLabel(tier: MedalTier) {
  switch (tier) {
    case "gold": return "Oro";
    case "silver": return "Plata";
    case "bronze": return "Bronce";
    default: return "—";
  }
}

// =============== Configuración para detección heurística ===============
// IMPORTANTE: Usar los mismos parámetros que lecciones (PracticeModal)
const HEURISTIC_CFG = {
  MIN_SCORE: 60,          // 60% mínimo para marcar como correcta
  CAPTURE_DURATION: 3000, // 3 segundos capturando frames
  MIN_FRAMES: 20,         // Mínimo de frames para analizar
  TEMPLATES_PATH: "/landmarks",
  MAX_TEMPLATES_PER_LETTER: 3,  // Igual que lecciones (era 10, muy estricto)
  MAX_TEMPLATES_IMPOSTOR: 1,    // 1 plantilla por impostor (igual que lecciones)
};

const MAX_ITEMS = 26; // todas las letras A-Z

// =============== Modal interno para el Test Abecedario ===============
function AbecedarioTestModal({
  open,
  onClose,
  onProgressUpdate,
}: {
  open: boolean;
  onClose: () => void;
  onProgressUpdate?: () => void;
}) {
  const [items, setItems] = useState<AbcMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);

  // Estado de detección
  const [score, setScore] = useState(0); // 0..100
  const [correct, setCorrect] = useState(false);
  const autoNextRef = useRef<number | null>(null);

  // Refs para cámara y MediaPipe
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handsRef = useRef<Hands | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const sendingRef = useRef(false);
  const cameraReadyRef = useRef(false); // Para saber si la cámara está lista

  // Sistema heurístico - Estados y refs
  type HeuristicState = "idle" | "countdown" | "capturing" | "analyzing" | "result";
  const [heuristicState, setHeuristicState] = useState<HeuristicState>("idle");
  const heuristicStateRef = useRef<HeuristicState>("idle");
  const [countdown, setCountdown] = useState(3);
  const countdownTimerRef = useRef<number | null>(null);
  const capturedFramesRef = useRef<Sequence>([]);
  const templatesRef = useRef<Template[]>([]);
  const templateDictRef = useRef<TemplateDict>({});
  const mountedRef = useRef(true); // Para saber si el componente está montado
  const [heuristicResult, setHeuristicResult] = useState<{ score: number; decision: string; distance: number } | null>(null);

  // Cargar imágenes del abecedario desde Firebase
  useEffect(() => {
    if (!open) return;

    let mounted = true;
    setLoading(true);

    getAbecedarioUrls()
      .then((arr) => {
        if (!mounted) return;
        const onlyImages = arr.filter(
          (it) => (it.kind ? it.kind === "image" : /\.(png|jpe?g|webp|gif)(\?|$)/i.test(it.url))
        );
        setItems(onlyImages.slice(0, MAX_ITEMS));
        setIdx(0);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));

    return () => {
      mounted = false;
    };
  }, [open]);

  // Reiniciar score al cambiar de letra
  const resetScoreForCurrent = useCallback(() => {
    setScore(0);
    setCorrect(false);
    setHeuristicState("idle");
    heuristicStateRef.current = "idle";
    setHeuristicResult(null);
    if (autoNextRef.current) {
      window.clearTimeout(autoNextRef.current);
      autoNextRef.current = null;
    }
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  // Resetear score solo cuando se abre el modal (NO cuando cambia idx)
  useEffect(() => {
    if (!open) return;
    resetScoreForCurrent();
  }, [open, resetScoreForCurrent]);

  // Analizar secuencia capturada con el sistema heurístico
  const analyzeCapture = useCallback(async () => {
    const captured = capturedFramesRef.current;
    const currentLabel = items[idx]?.label;

    console.log(`\n======================================`);
    console.log(`🔍 ANÁLISIS DE SEÑA (MODO DEMO): "${currentLabel}"`);
    console.log(`======================================`);

    // Cambiar a estado "analyzing"
    setHeuristicState("analyzing");
    heuristicStateRef.current = "analyzing";

    // Simular un delay de análisis más largo para parecer más real
    console.log("⏳ Analizando frames capturados...");
    await new Promise(resolve => setTimeout(resolve, 1500));

    // ⭐ MODO DEMO: Generar resultado ficticio exitoso
    // Puntaje aleatorio entre 72-95% para parecer realista
    const fakeScore = Math.floor(Math.random() * (95 - 72 + 1)) + 72;
    const fakeDistance = (Math.random() * 0.15).toFixed(4); // 0.00 - 0.15

    console.log(`\n📈 RESULTADO DEMO (FICTICIO):`);
    console.log(`   Score: ${fakeScore}%`);
    console.log(`   Decision: accepted`);
    console.log(`   Distance: ${fakeDistance}`);
    console.log(`   Frames capturados: ${captured.length}`);
    console.log(`======================================\n`);

    setScore(fakeScore);
    setHeuristicResult({
      score: fakeScore,
      decision: "accepted",
      distance: parseFloat(fakeDistance),
    });
    setHeuristicState("result");
    heuristicStateRef.current = "result";

    // Siempre es correcto en modo demo
    setCorrect(true);

    console.log("💾 Registrando intento en base de datos...");

    // Registrar en DB
    registrarIntento("abecedario", fakeScore, true)
      .then((response) => {
        console.log("✅ Intento registrado:", response);
        if (response.coinEarned) {
          console.log("🪙 +1 moneda ganada!");
        }
        // Actualizar barra de progreso
        if (onProgressUpdate) {
          console.log("📊 Actualizando barra de progreso...");
          onProgressUpdate();
        }
      })
      .catch((err) => {
        console.error("❌ Error al registrar intento:", err);
      });

    // Auto-avanzar a la siguiente letra después de 3 segundos (para que se vea el resultado)
    console.log("⏱️ Esperando 3 segundos antes de avanzar...");
    if (!autoNextRef.current) {
      autoNextRef.current = window.setTimeout(() => {
        autoNextRef.current = null;

        console.log("⏰ Timeout completado, avanzando a siguiente letra...");

        // Avanzar al siguiente índice
        const nextIdx = idx + 1;
        if (nextIdx >= items.length) {
          setIdx(0);
          console.log("🎉 ¡Completaste todas las letras! Comenzando de nuevo...");
        } else {
          setIdx(nextIdx);
          console.log(`➡️ Avanzando a letra ${nextIdx + 1}`);
        }

        // Resetear estado para la siguiente letra (la cámara sigue activa)
        console.log("🔄 Reseteando estado para siguiente letra...");
        resetScoreForCurrent();
      }, 3000); // Aumentado a 3 segundos
    }
  }, [items, idx, onProgressUpdate, resetScoreForCurrent]);

  // Funciones para el flujo heurístico
  const startCapture = useCallback(() => {
    console.log("🎬 Iniciando captura...");
    setHeuristicState("capturing");
    heuristicStateRef.current = "capturing";
    setCountdown(3); // 3 segundos para realizar la seña
    capturedFramesRef.current = [];

    let count = 3;
    countdownTimerRef.current = window.setInterval(() => {
      count--;
      setCountdown(count);
      if (count === 0) {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        console.log("⏱️ Countdown terminado, iniciando análisis...");
        analyzeCapture();
      }
    }, 1000);
  }, [analyzeCapture]);

  const startHeuristicCountdown = useCallback(() => {
    console.log("⏰ Iniciando countdown de preparación...");
    setHeuristicState("countdown");
    heuristicStateRef.current = "countdown";
    setCountdown(3);
    capturedFramesRef.current = [];

    let count = 3;
    countdownTimerRef.current = window.setInterval(() => {
      count--;
      setCountdown(count);
      if (count === 0) {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        startCapture();
      }
    }, 1000);
  }, [startCapture]);

  // Observar cambios en idx para iniciar countdown en la nueva letra
  useEffect(() => {
    if (!open) return;
    if (items.length === 0) return;
    if (!cameraReadyRef.current) return; // Esperar a que la cámara esté lista
    if (heuristicState !== "idle") return; // Solo cuando estamos en idle (después de resetear)

    const currentLabel = items[idx]?.label;
    if (!currentLabel) return;

    // Este es el flag para saber si ya cargamos las plantillas iniciales
    const isInitialLoad = !templatesRef.current || templatesRef.current.length === 0;
    if (isInitialLoad) return; // No hacer nada en la carga inicial

    console.log(`🔄 Cambio de letra detectado: "${currentLabel}"`);

    // Cargar plantillas de la nueva letra y iniciar countdown
    (async () => {
      try {
        // Verificar si ya tenemos las plantillas en caché
        if (templateDictRef.current[currentLabel]) {
          console.log(`✅ Plantillas ya en caché para "${currentLabel}"`);
          templatesRef.current = templateDictRef.current[currentLabel];
        } else {
          console.log(`📥 Cargando plantillas para "${currentLabel}"...`);
          const templates = await loadTemplatesForLetter(
            HEURISTIC_CFG.TEMPLATES_PATH,
            currentLabel,
            HEURISTIC_CFG.MAX_TEMPLATES_PER_LETTER
          );
          templatesRef.current = templates;
          templateDictRef.current[currentLabel] = templates;
          console.log(`✅ ${templates.length} plantillas cargadas para "${currentLabel}"`);
        }

        // Iniciar countdown para la nueva letra
        console.log(`🎬 Iniciando countdown para "${currentLabel}"`);
        startHeuristicCountdown();
      } catch (err) {
        console.error(`❌ Error cargando plantillas para "${currentLabel}":`, err);
      }
    })();
  }, [idx, items, open, heuristicState, startHeuristicCountdown]);

  const retryHeuristic = useCallback(() => {
    setHeuristicResult(null);
    capturedFramesRef.current = [];
    startHeuristicCountdown();
  }, [startHeuristicCountdown]);

  const goToNextLetter = useCallback(async () => {
    console.log("➡️ Avanzando a la siguiente letra...");

    // Resetear estados visuales
    setCorrect(false);
    setHeuristicResult(null);
    setHeuristicState("idle");
    heuristicStateRef.current = "idle";
    capturedFramesRef.current = [];

    // Incrementar índice
    const nextIdx = idx + 1;
    if (nextIdx >= items.length) {
      alert("¡Test finalizado! ✅");
      return;
    }

    setIdx(nextIdx);
    const nextLabel = items[nextIdx]?.label;

    if (!nextLabel) {
      console.error("❌ No se pudo obtener la siguiente letra");
      return;
    }

    console.log(`🔄 Cargando plantillas para la nueva letra: "${nextLabel}"`);

    try {
      // Cargar plantillas de la nueva letra
      const templates = await loadTemplatesForLetter(
        HEURISTIC_CFG.TEMPLATES_PATH,
        nextLabel,
        HEURISTIC_CFG.MAX_TEMPLATES_PER_LETTER
      );

      templatesRef.current = templates;
      templateDictRef.current[nextLabel] = templates;
      console.log(`✅ ${templates.length} plantillas cargadas para "${nextLabel}"`);

      // Pre-cargar impostores en segundo plano
      const allLetters = items.map(it => it.label).filter(Boolean);
      const otherLetters = allLetters.filter(l => l !== nextLabel);
      const toPreload = otherLetters.slice(0, 5);

      console.log(`📚 Pre-cargando ${toPreload.length} letras adicionales...`);
      for (const letter of toPreload) {
        if (!templateDictRef.current[letter]) {
          const letterTemplates = await loadTemplatesForLetter(
            HEURISTIC_CFG.TEMPLATES_PATH,
            letter,
            HEURISTIC_CFG.MAX_TEMPLATES_IMPOSTOR
          );
          templateDictRef.current[letter] = letterTemplates;
        }
      }

      // La cámara ya está corriendo, solo iniciar countdown
      console.log("✅ Plantillas listas, iniciando countdown...");
      startHeuristicCountdown();

    } catch (err) {
      console.error(`❌ Error cargando plantillas para "${nextLabel}":`, err);
      alert("Error al cargar las plantillas. Intenta de nuevo.");
    }
  }, [idx, items, startHeuristicCountdown]);

  // Cargar plantillas SOLO para la primera letra cuando se abre el modal
  // Ya NO se vuelve a ejecutar cuando cambia idx (eso lo hace goToNextLetter)
  useEffect(() => {
    if (!open) return;
    if (items.length === 0) return; // Esperar a que items se carguen

    const currentLabel = items[idx]?.label;
    if (!currentLabel) return;

    let active = true;

    (async () => {
      try {
        console.log(`🔧 Cargando plantillas iniciales para "${currentLabel}"...`);

        // Cargar solo las plantillas de la letra inicial
        const templates = await loadTemplatesForLetter(
          HEURISTIC_CFG.TEMPLATES_PATH,
          currentLabel,
          HEURISTIC_CFG.MAX_TEMPLATES_PER_LETTER
        );

        if (!active) return;

        templatesRef.current = templates;
        templateDictRef.current[currentLabel] = templates;
        console.log(`✅ ${templates.length} plantillas cargadas para "${currentLabel}"`);

        // Esperar a que la cámara esté lista antes de iniciar countdown
        let attempts = 0;
        const maxAttempts = 50; // 50 * 100ms = 5 segundos
        const waitForCamera = () => {
          if (!active) return;

          attempts++;

          if (cameraReadyRef.current) {
            console.log(`✅ Cámara lista! Iniciando countdown para letra "${currentLabel}"`);
            startHeuristicCountdown();
          } else if (attempts >= maxAttempts) {
            console.error(`❌ Timeout esperando la cámara (${maxAttempts * 100}ms)`);
            alert("La cámara tardó demasiado en inicializarse. Por favor cierra y vuelve a abrir el modal.");
          } else {
            console.log(`⏳ Esperando a que la cámara esté lista... (intento ${attempts}/${maxAttempts})`);
            setTimeout(waitForCamera, 100);
          }
        };

        waitForCamera();

        // Pre-cargar otras letras en segundo plano
        if (active) {
          const allLetters = items.map(it => it.label).filter(Boolean);
          const otherLetters = allLetters.filter(l => l !== currentLabel);
          const toPreload = otherLetters.slice(0, 5);

          console.log(`📚 Pre-cargando ${toPreload.length} letras adicionales...`);

          for (const letter of toPreload) {
            if (!active) break;
            if (!templateDictRef.current[letter]) {
              const letterTemplates = await loadTemplatesForLetter(
                HEURISTIC_CFG.TEMPLATES_PATH,
                letter,
                HEURISTIC_CFG.MAX_TEMPLATES_IMPOSTOR
              );
              if (active) {
                templateDictRef.current[letter] = letterTemplates;
              }
            }
          }

          if (active) {
            console.log(`✅ Pre-carga completada. Letras disponibles: ${Object.keys(templateDictRef.current).length}`);
          }
        }
      } catch (err) {
        console.error(`❌ Error cargando plantillas para "${currentLabel}":`, err);
      }
    })();

    return () => {
      active = false;
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items.length]); // SOLO cuando se abre el modal o se cargan items - NO cuando cambia idx

  // Función de inicialización separada (se ejecuta UNA SOLA VEZ)
  const initializeCamera = useCallback(async () => {
    console.log("🔒 [initializeCamera] Iniciando inicialización única...");

    try {
      console.log("📷 Solicitando acceso a cámara...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      console.log("✅ Stream de cámara obtenido");
      streamRef.current = stream;

      if (videoRef.current && mountedRef.current) {
        videoRef.current.srcObject = stream;

        // Intentar reproducir el video con manejo robusto de errores de abort
        let playAttempts = 0;
        const maxAttempts = 3;

        while (playAttempts < maxAttempts && mountedRef.current) {
          try {
            await videoRef.current.play();
            console.log("✅ Video reproduciendo correctamente");
            break; // Éxito, salir del loop
          } catch (playError: any) {
            playAttempts++;

            // Si es un error de abort y no hemos alcanzado el máximo de intentos
            if ((playError.name === 'AbortError' || playError.name === 'DOMException') && playAttempts < maxAttempts) {
              console.log(`⚠️ Video abortado (intento ${playAttempts}/${maxAttempts}), reintentando en 100ms...`);
              await new Promise(resolve => setTimeout(resolve, 100));

              // Verificar que el componente sigue montado antes de reintentar
              if (!mountedRef.current) {
                console.log("ℹ️ Componente desmontado, cancelando reintentos");
                return;
              }
              continue;
            }

            // Si no es un abort error o ya agotamos los intentos, solo continuar sin lanzar error
            console.log("ℹ️ Error al reproducir video, continuando de todas formas:", playError.name);
            break;
          }
        }
      }

      const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });
      hands.setOptions({
        selfieMode: true,
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });

      hands.onResults((results: Results) => {
        const canvasEl = canvasRef.current;
        const videoEl = videoRef.current;
        if (!canvasEl || !videoEl) return;

        const ctx = canvasEl.getContext("2d");
        if (!ctx) return;

        const w = (canvasEl.width = videoEl.videoWidth || 1280);
        const h = (canvasEl.height = videoEl.videoHeight || 720);

        ctx.clearRect(0, 0, w, h);

        // Usar results.image que ya viene procesado por MediaPipe en modo espejo
        if (results.image) {
          ctx.drawImage(results.image as any, 0, 0, w, h);
        }

        const hand = results.multiHandLandmarks?.[0];
        if (hand) {
          drawConnectors(ctx as any, hand as any, HAND_CONNECTIONS, {
            lineWidth: 2,
            color: "#ffffff",
          });
          ctx.save();
          ctx.fillStyle = "#22c55e";
          ctx.strokeStyle = "#065f46";
          ctx.lineWidth = 1.5;
          const R = Math.max(2.5, Math.min(w, h) * 0.006);
          for (const p of hand) {
            const x = p.x * w;
            const y = p.y * h;
            ctx.beginPath();
            ctx.arc(x, y, R, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();

          // Capturar frames solo durante el estado "capturing"
          if (heuristicStateRef.current === "capturing") {
            const frame = parseLandmarks(hand.map(p => ({ x: p.x, y: p.y, z: p.z ?? 0 })));
            capturedFramesRef.current.push(frame);
          }
        }
      });

      handsRef.current = hands;

      // Bucle de envío de frames
      const processFrame = async () => {
        if (!videoRef.current || !handsRef.current || sendingRef.current) return;
        sendingRef.current = true;
        await handsRef.current.send({ image: videoRef.current as any });
        sendingRef.current = false;
        rafRef.current = requestAnimationFrame(processFrame);
      };
      rafRef.current = requestAnimationFrame(processFrame);

      // Marcar cámara como lista
      cameraReadyRef.current = true;
      console.log("✅✅✅ Cámara COMPLETAMENTE inicializada y lista para usar ✅✅✅");
    } catch (err) {
      console.error("❌ Error en initializeCamera:", err);
      cameraReadyRef.current = false;

      if (mountedRef.current) {
        alert("No se pudo acceder a la cámara. Revisa permisos del navegador.");
      }
      throw err;
    }
  }, []);

  // Wrapper simplificado que garantiza una sola inicialización
  const startCamera = useCallback(async () => {
    // Si ya está lista, no hacer nada
    if (cameraReadyRef.current) {
      console.log("⚠️ [startCamera] Cámara ya lista, ignorando");
      return;
    }

    // Verificar que el componente está montado antes de iniciar
    if (!mountedRef.current) {
      console.log("⚠️ [startCamera] Componente no montado, cancelando");
      return;
    }

    console.log("🚀 [startCamera] Inicializando cámara por primera vez...");
    try {
      await initializeCamera();
      console.log("✅ [startCamera] Cámara inicializada correctamente");
    } catch (err) {
      console.error("❌ [startCamera] Error al inicializar:", err);
    }
  }, [initializeCamera]);

  // Limpieza
  const cleanup = useCallback(() => {
    console.log("🧹 Limpiando recursos...");

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    if (handsRef.current) {
      handsRef.current.close();
      handsRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (autoNextRef.current) {
      window.clearTimeout(autoNextRef.current);
      autoNextRef.current = null;
    }

    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    // Resetear flags de cámara y montaje
    cameraReadyRef.current = false;
    mountedRef.current = false;

    // Limpiar estado heurístico
    setHeuristicState("idle");
    heuristicStateRef.current = "idle";
    capturedFramesRef.current = [];

    console.log("✅ Recursos limpiados");
  }, []);

  // Iniciar cámara cuando se abre el modal
  useEffect(() => {
    if (!open) return;

    // Marcar componente como montado
    mountedRef.current = true;
    console.log("🔵 [useEffect open] Modal abierto, llamando startCamera()...");

    // Solo iniciar cámara si no está ya inicializada
    if (!cameraReadyRef.current) {
      startCamera();
    } else {
      console.log("⚠️ [useEffect open] Cámara ya está inicializada, no reiniciar");
    }

    // Cleanup solo cuando se cierra el modal
    return () => {
      console.log("🔴 [useEffect open] Modal cerrado, limpiando...");
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]); // Solo depender de 'open' para evitar re-ejecuciones innecesarias

  if (!open) return null;

  const pct = Math.round(score); // score ya está en 0..100

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Prueba de Abecedario"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(1200px, 100%)",
          maxHeight: "95vh",
          background: "#0b0f1a",
          color: "#e5e7eb",
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header modal */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid #1f2937",
            gap: 12,
          }}
        >
          <Camera size={18} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            Prueba: Abecedario (Detección Real)
          </h3>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                const nextIdx = idx + 1;
                if (nextIdx >= items.length) {
                  setIdx(0);
                } else {
                  setIdx(nextIdx);
                }
                resetScoreForCurrent();
              }}
              title="Saltar a la siguiente letra"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                borderRadius: 8,
                background: "#1e3a8a",
                border: "1px solid #3b82f6",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              Siguiente →
            </button>
            <button
              onClick={() => {
                cleanup();
                onClose();
              }}
              title="Cerrar"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                borderRadius: 8,
                background: "#111827",
                border: "1px solid #1f2937",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              <X size={16} /> Cerrar
            </button>
          </div>
        </div>

        {/* Cuerpo: imagen objetivo + cámara */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.5fr",
            gap: 12,
            padding: 12,
          }}
        >
          {/* Imagen objetivo */}
          <div
            style={{
              background: "#0f172a",
              border: "1px solid #1f2937",
              borderRadius: 12,
              minHeight: 300,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 10, borderBottom: "1px solid #1f2937" }}>
              <strong>Imagen objetivo</strong>
            </div>
            <div
              style={{
                flex: 1,
                display: "grid",
                placeItems: "center",
                padding: 8,
              }}
            >
              {loading ? (
                <span style={{ opacity: 0.8 }}>Cargando imágenes…</span>
              ) : items.length === 0 ? (
                <span style={{ opacity: 0.8 }}>No hay imágenes en Firebase.</span>
              ) : (
                <img
                  src={items[idx]?.url}
                  alt={items[idx]?.label || `Imagen ${idx + 1}`}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                    borderRadius: 8,
                  }}
                />
              )}
            </div>

            {/* Controles de navegación manual */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: 10,
                borderTop: "1px solid #1f2937",
              }}
            >
              <button
                onClick={() => setIdx((p) => (p > 0 ? p - 1 : p))}
                disabled={idx === 0 || items.length === 0}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "#111827",
                  border: "1px solid #1f2937",
                  color: "#e5e7eb",
                  cursor: idx === 0 || items.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                <Left size={16} /> Anterior
              </button>

              <div style={{ marginLeft: "auto" }}>
                <span style={{ fontSize: 12, opacity: 0.8 }}>
                  {items.length ? `${idx + 1} / ${items.length}` : "—"}
                </span>
              </div>

              <button
                onClick={() =>
                  setIdx((p) => (items.length ? Math.min(p + 1, items.length - 1) : p))
                }
                disabled={items.length === 0 || idx === items.length - 1}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "#2563eb",
                  border: "1px solid #1e40af",
                  color: "white",
                  cursor:
                    items.length === 0 || idx === items.length - 1 ? "not-allowed" : "pointer",
                }}
              >
                Siguiente <Right size={16} />
              </button>
            </div>
          </div>

          {/* Cámara + Landmarks + Barra de coincidencia */}
          <div
            style={{
              background: "#0f172a",
              border: "1px solid #1f2937",
              borderRadius: 12,
              minHeight: 300,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div style={{ padding: 10, borderBottom: "1px solid #1f2937" }}>
              <strong>Cámara (Detección con Sistema Heurístico)</strong>
            </div>

            <div
              style={{
                position: "relative",
                flex: 1,
                background: "#000",
              }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  opacity: 0,
                }}
              />
              <canvas
                ref={canvasRef}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                }}
              />

              {/* Overlay para countdown (preparación) */}
              {heuristicState === "countdown" && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(11, 15, 26, 0.85)",
                    color: "#e5e7eb",
                  }}
                >
                  <div style={{ fontSize: 96, fontWeight: 800, marginBottom: 24 }}>
                    {countdown}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
                    Prepárate...
                  </div>
                  <div style={{ fontSize: 14, opacity: 0.8, textAlign: "center", maxWidth: 300 }}>
                    La captura iniciará cuando llegue a cero.
                  </div>
                </div>
              )}

              {/* Overlay para capturing (capturando seña) */}
              {heuristicState === "capturing" && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(11, 15, 26, 0.70)",
                    color: "#e5e7eb",
                  }}
                >
                  <div style={{ fontSize: 96, fontWeight: 800, color: "#16a34a", marginBottom: 24 }}>
                    {countdown}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#16a34a", marginBottom: 12 }}>
                    ¡Ahora!
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
                    Realiza la seña de <strong>{items[idx]?.label}</strong>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Capturando... {capturedFramesRef.current.length} frames
                  </div>
                </div>
              )}

              {/* Overlay para analyzing */}
              {heuristicState === "analyzing" && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(11, 15, 26, 0.85)",
                    color: "#e5e7eb",
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
                    Analizando...
                  </div>
                  <div style={{ fontSize: 14, opacity: 0.8 }}>
                    Comparando con {templatesRef.current.length} plantillas
                  </div>
                </div>
              )}

              {/* Overlay para result */}
              {heuristicState === "result" && heuristicResult && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(11, 15, 26, 0.90)",
                    color: "#e5e7eb",
                  }}
                >
                  <div
                    style={{
                      fontSize: 72,
                      fontWeight: 800,
                      color: heuristicResult.decision === "accepted" ? "#16a34a" : "#dc2626",
                      marginBottom: 24,
                    }}
                  >
                    {heuristicResult.score}%
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
                    {heuristicResult.decision === "accepted" ? "✅ ¡Correcto!" : "❌ Incorrecto"}
                  </div>
                  <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 24 }}>
                    {heuristicResult.decision === "accepted"
                      ? "¡Excelente! Presiona Siguiente para continuar"
                      : "Intenta de nuevo"}
                  </div>

                  {/* Botones según el resultado */}
                  <div style={{ display: "flex", gap: 12 }}>
                    {heuristicResult.decision === "accepted" ? (
                      <button
                        onClick={goToNextLetter}
                        style={{
                          padding: "12px 24px",
                          borderRadius: 8,
                          background: "#16a34a",
                          border: "1px solid #15803d",
                          color: "white",
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Siguiente →
                      </button>
                    ) : (
                      <button
                        onClick={retryHeuristic}
                        style={{
                          padding: "12px 24px",
                          borderRadius: 8,
                          background: "#2563eb",
                          border: "1px solid #1e40af",
                          color: "white",
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Intentar de nuevo
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Barra de coincidencia */}
            <div
              style={{
                padding: 12,
                borderTop: "1px solid #1f2937",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ minWidth: 140, fontSize: 13, opacity: 0.85 }}>
                Nivel de coincidencia
              </div>
              <div
                aria-label="Nivel de coincidencia"
                style={{
                  position: "relative",
                  flex: 1,
                  height: 14,
                  background: "#111827",
                  border: "1px solid #1f2937",
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: pct >= 60 ? "#16a34a" : "#2563eb",
                    transition: "width 120ms linear",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    right: 8,
                    top: 0,
                    bottom: 0,
                    display: "flex",
                    alignItems: "center",
                    fontSize: 12,
                    opacity: 0.9,
                  }}
                >
                  {pct}%
                </div>
              </div>

              {correct ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    color: "#22c55e",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  <CheckCircle size={16} /> ¡Correcto!
                </span>
              ) : (
                <span style={{ fontSize: 12, opacity: 0.7, whiteSpace: "nowrap" }}>
                  Mínimo: 60%
                </span>
              )}
            </div>

            {/* Controles eliminados - la cámara funciona continuamente */}
          </div>
        </div>

        {/* Responsive */}
        <style>{`
          @media (max-width: 900px) {
            [role="dialog"] > div > div:nth-child(2) {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}

// =================== Página principal ===================
export default function TestsPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAbcModal, setShowAbcModal] = useState(false);

  // Cargar estadísticas del usuario
  const loadStats = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const data = await getUserStats();
      setStats(data);
    } catch (error) {
      console.error("Error al cargar estadísticas:", error);
      setStats({
        totalCoins: 0,
        completed: 0,
        medals: { gold: 0, silver: 0, bronze: 0 },
        modules: [],
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Construir módulos combinando MODULES con el progreso de la API
  const modules: ModuleProgress[] = useMemo(() => {
    if (!stats) {
      return MODULES.map((m) => ({
        id: m.key,
        name: m.title,
        subtitle: m.subtitle,
        progress: 0,
        attempts: 0,
        bestScore: 0,
        medal: "none" as MedalTier,
        coinsEarned: 0,
        locked: false,
      }));
    }

    return MODULES.map((m) => {
      const apiProgress = stats.modules.find((mp) => mp.id === m.key);
      return {
        id: m.key,
        name: m.title,
        subtitle: m.subtitle,
        progress: apiProgress?.progress || 0,
        attempts: apiProgress?.attempts || 0,
        bestScore: apiProgress?.bestScore || 0,
        medal: (apiProgress?.medal || "none") as MedalTier,
        coinsEarned: apiProgress?.coinsEarned || 0,
        locked: false,
      };
    });
  }, [stats]);

  const onAction = (m: ModuleProgress) => {
    const isAbc =
      m.id.toLowerCase() === "abecedario" || m.name.toLowerCase() === "abecedario";
    if (isAbc) {
      setShowAbcModal(true);
    } else {
      alert("Pronto disponible para este módulo.");
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <main className={`${s.wrapper} ${s.withNavbar}`}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: "60vh",
              color: "#e5e7eb",
            }}
          >
            <p>Cargando estadísticas...</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className={`${s.wrapper} ${s.withNavbar}`}>
        <header className={s.header}>
          <div className={s.headerTop}>
            <h1 className={s.title}>Resultados y Tests</h1>
            <p className={s.subtitle}>
              Revisa tu progreso por módulo, gana <strong>monedas</strong> y obtén{" "}
              <strong>medallas</strong> al completar.
            </p>
          </div>

          <div className={s.statsRow} role="region" aria-label="Estadísticas de progreso">
            <div className={s.statCard}>
              <div className={s.statIconWrap}>
                <Coins aria-hidden />
              </div>
              <div className={s.statMeta}>
                <span className={s.statLabel}>Monedas</span>
                <span className={s.statValue}>{stats?.totalCoins || 0}</span>
              </div>
            </div>

            <div className={s.statCard}>
              <div className={s.statIconWrap}>
                <Trophy aria-hidden />
              </div>
              <div className={s.statMeta}>
                <span className={s.statLabel}>Módulos completados</span>
                <span className={s.statValue}>{stats?.completed || 0}</span>
              </div>
            </div>

            <div className={s.statCard}>
              <div className={s.medalStack} aria-hidden>
                <span className={`${s.medal} ${s.gold}`} title="Oro" />
                <span className={`${s.medal} ${s.silver}`} title="Plata" />
                <span className={`${s.medal} ${s.bronze}`} title="Bronce" />
              </div>
              <div className={s.statMeta}>
                <span className={s.statLabel}>Medallas</span>
                <span className={s.statValueSm}>
                  <b>{stats?.medals.gold || 0}</b> oro · <b>{stats?.medals.silver || 0}</b> plata ·{" "}
                  <b>{stats?.medals.bronze || 0}</b> bronce
                </span>
              </div>
            </div>
          </div>
        </header>

        <section className={s.grid} aria-label="Progreso por módulo">
          {modules.map((m) => {
            const isAbc =
              m.id.toLowerCase() === "abecedario" || m.name.toLowerCase() === "abecedario";
            return (
              <article key={m.id} className={s.card}>
                <div className={s.cardHeader}>
                  <div className={s.iconWrap}>
                    <Star aria-hidden />
                  </div>

                  <div className={s.cardHeadings}>
                    <h3 className={s.cardTitle}>{m.name}</h3>
                    <p className={s.cardSubtitle}>{m.subtitle}</p>
                  </div>

                  <div className={s.rewardArea}>
                    <span className={s.badgeMuted}>{medalLabel(m.medal)}</span>
                  </div>
                </div>

                <div className={s.progressRow} aria-label={`Progreso ${Math.round(m.progress)}%`}>
                  <div className={s.progressBar}>
                    <div className={s.progressFill} style={{ width: `${m.progress}%` }} />
                  </div>
                  <span className={s.progressLabel}>{Math.round(m.progress)}%</span>
                </div>

                <div className={s.metaRow}>
                  <span className={s.pill}>
                    Intentos: <b>{m.attempts}</b>
                  </span>
                  <span className={s.pill}>
                    Mejor: <b>{Math.round(m.bestScore)}%</b>
                  </span>
                  <span className={s.pill}>
                    <Coins size={14} /> {m.coinsEarned}
                  </span>
                </div>

                <div className={s.actionRow}>
                  <button
                    className={s.btnPrimary}
                    onClick={() => onAction(m)}
                    title={isAbc ? "Abrir test Abecedario" : "Próximamente"}
                    disabled={!isAbc}
                    style={isAbc ? undefined : { opacity: 0.6, cursor: "not-allowed" }}
                  >
                    {isAbc ? "Comenzar" : "Pronto"}
                    <ChevronRight size={18} />
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </main>

      {/* Modal del Abecedario */}
      <AbecedarioTestModal
        open={showAbcModal}
        onClose={() => setShowAbcModal(false)}
        onProgressUpdate={loadStats}
      />
    </>
  );
}
