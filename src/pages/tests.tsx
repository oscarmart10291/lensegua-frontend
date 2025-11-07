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
const HEURISTIC_CFG = {
  MIN_SCORE: 60,          // 60% mínimo para marcar como correcta
  CAPTURE_DURATION: 3000, // 3 segundos capturando frames
  MIN_FRAMES: 20,         // Mínimo de frames para analizar
  TEMPLATES_PATH: "/landmarks",
  MAX_TEMPLATES_PER_LETTER: 10,
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

  // Sistema heurístico - Estados y refs
  type HeuristicState = "idle" | "countdown" | "capturing" | "analyzing" | "result";
  const [heuristicState, setHeuristicState] = useState<HeuristicState>("idle");
  const heuristicStateRef = useRef<HeuristicState>("idle");
  const [countdown, setCountdown] = useState(3);
  const countdownTimerRef = useRef<number | null>(null);
  const capturedFramesRef = useRef<Sequence>([]);
  const templatesRef = useRef<Template[]>([]);
  const templateDictRef = useRef<TemplateDict>({});
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

  useEffect(() => {
    if (!open) return;
    resetScoreForCurrent();
  }, [open, idx, resetScoreForCurrent]);

  // Funciones para el flujo heurístico
  const startHeuristicCountdown = useCallback(() => {
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
  }, []);

  const startCapture = useCallback(() => {
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
        analyzeCapture();
      }
    }, 1000);
  }, []);

  const retryHeuristic = useCallback(() => {
    setHeuristicResult(null);
    capturedFramesRef.current = [];
    startHeuristicCountdown();
  }, [startHeuristicCountdown]);

  // Cargar plantillas heurísticas cuando cambia la letra
  useEffect(() => {
    if (!open) return;
    const currentLabel = items[idx]?.label;
    if (!currentLabel) return;

    let active = true;

    (async () => {
      try {
        console.log(`🔧 Cargando plantillas para "${currentLabel}"...`);

        const templates = await loadTemplatesForLetter(
          HEURISTIC_CFG.TEMPLATES_PATH,
          currentLabel,
          HEURISTIC_CFG.MAX_TEMPLATES_PER_LETTER
        );

        if (!active) return;

        templatesRef.current = templates;
        console.log(`✅ ${templates.length} plantillas cargadas para "${currentLabel}"`);

        // Pre-cargar todas las letras en el diccionario si aún no está
        if (Object.keys(templateDictRef.current).length === 0) {
          console.log("📚 Pre-cargando todas las plantillas...");
          const allLetters = items.map(it => it.label).filter(Boolean);

          for (const letter of allLetters) {
            const letterTemplates = await loadTemplatesForLetter(
              HEURISTIC_CFG.TEMPLATES_PATH,
              letter,
              HEURISTIC_CFG.MAX_TEMPLATES_PER_LETTER
            );
            templateDictRef.current[letter] = letterTemplates;
          }

          console.log(`✅ Pre-cargadas ${Object.keys(templateDictRef.current).length} letras`);
        }

        // Iniciar countdown automáticamente cuando las plantillas estén listas
        if (!active) return;
        startHeuristicCountdown();
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
  }, [open, idx, items, startHeuristicCountdown]);

  // Inicializar cámara y MediaPipe
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
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

        canvasEl.width = videoEl.videoWidth || 1280;
        canvasEl.height = videoEl.videoHeight || 720;

        ctx.save();
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);

        const hand = results.multiHandLandmarks?.[0];
        if (hand) {
          drawConnectors(ctx as any, hand as any, HAND_CONNECTIONS, {
            lineWidth: 2,
            color: "#ffffff",
          });
          ctx.fillStyle = "#22c55e";
          ctx.strokeStyle = "#065f46";
          ctx.lineWidth = 1.5;
          const R = Math.max(2.5, Math.min(canvasEl.width, canvasEl.height) * 0.006);
          for (const p of hand) {
            const x = p.x * canvasEl.width;
            const y = p.y * canvasEl.height;
            ctx.beginPath();
            ctx.arc(x, y, R, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }

          // Capturar frames solo durante el estado "capturing"
          if (heuristicStateRef.current === "capturing") {
            const frame = parseLandmarks(hand.map(p => ({ x: p.x, y: p.y, z: p.z ?? 0 })));
            capturedFramesRef.current.push(frame);
          }
        }
        ctx.restore();
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
    } catch (err) {
      console.error(err);
      alert("No se pudo acceder a la cámara. Revisa permisos del navegador.");
    }
  }, []);

  // Analizar secuencia capturada con el sistema heurístico
  const analyzeCapture = useCallback(async () => {
    const captured = capturedFramesRef.current;
    const currentLabel = items[idx]?.label;

    console.log(`\n======================================`);
    console.log(`🔍 ANÁLISIS DE SEÑA: "${currentLabel}"`);
    console.log(`======================================`);

    // Cambiar a estado "analyzing"
    setHeuristicState("analyzing");
    heuristicStateRef.current = "analyzing";

    if (captured.length < HEURISTIC_CFG.MIN_FRAMES) {
      console.log(`⚠️ Pocos frames capturados: ${captured.length} < ${HEURISTIC_CFG.MIN_FRAMES}`);
      setHeuristicResult({
        score: 0,
        decision: "rejected",
        distance: 999,
      });
      setHeuristicState("result");
      heuristicStateRef.current = "result";
      return;
    }

    if (!currentLabel) {
      console.log("⚠️ No hay letra seleccionada");
      setHeuristicState("idle");
      heuristicStateRef.current = "idle";
      return;
    }

    try {
      const targetTemplates = templatesRef.current;

      if (targetTemplates.length === 0) {
        console.warn(`⚠️ No hay plantillas para "${currentLabel}"`);
        setHeuristicResult({
          score: 0,
          decision: "rejected",
          distance: 999,
        });
        setHeuristicState("result");
        heuristicStateRef.current = "result";
        return;
      }

      // Seleccionar impostores (otras letras)
      const impostors = selectImpostorTemplates(templateDictRef.current, currentLabel, 5);
      console.log(`👥 Impostores seleccionados: ${impostors.length} letras diferentes`);

      console.log(`🔍 Analizando ${captured.length} frames contra ${targetTemplates.length} plantillas de "${currentLabel}"`);

      // Ejecutar matching con 4 checks
      const result = matchSequence(captured, targetTemplates, DEFAULT_CONFIG, impostors);

      const finalScore = Math.round(result.score);

      console.log(`\n📈 RESULTADO:`);
      console.log(`   Score: ${finalScore}%`);
      console.log(`   Decision: ${result.decision}`);
      console.log(`   Distance: ${result.distance.toFixed(4)}`);
      console.log(`   Mejor plantilla: ${result.bestTemplateId}`);
      if (result.topCandidates && result.topCandidates.length > 0) {
        console.log(`   Top 3 candidatos:`);
        result.topCandidates.forEach((c, i) => {
          console.log(`      ${i + 1}. ${c.letter}: ${c.distance.toFixed(4)}`);
        });
      }
      console.log(`======================================\n`);

      setScore(finalScore);
      setHeuristicResult({
        score: finalScore,
        decision: result.decision,
        distance: result.distance,
      });
      setHeuristicState("result");
      heuristicStateRef.current = "result";

      // Si es correcto, registrar en DB y auto-avanzar
      if (result.decision === "accepted" && finalScore >= HEURISTIC_CFG.MIN_SCORE) {
        setCorrect(true);

        registrarIntento("abecedario", finalScore, true)
          .then((response) => {
            console.log("✅ Intento registrado:", response);
            if (response.coinEarned) {
              console.log("🪙 +1 moneda ganada!");
            }
            if (onProgressUpdate) {
              onProgressUpdate();
            }
          })
          .catch((err) => {
            console.error("❌ Error al registrar intento:", err);
          });

        // Auto-avanzar a la siguiente letra después de 2 segundos
        autoNextRef.current = window.setTimeout(() => {
          autoNextRef.current = null;
          setCorrect(false);
          setIdx((p) => {
            const nextIdx = p + 1;
            if (nextIdx >= items.length) {
              alert("¡Test finalizado! ✅");
              return p;
            }
            return nextIdx;
          });
        }, 2000);
      }
    } catch (err) {
      console.error("❌ Error en análisis heurístico:", err);
      setHeuristicResult({
        score: 0,
        decision: "rejected",
        distance: 999,
      });
      setHeuristicState("result");
      heuristicStateRef.current = "result";
    }
  }, [items, idx, onProgressUpdate]);

  // Limpieza
  const cleanup = useCallback(() => {
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

    // Limpiar estado heurístico
    setHeuristicState("idle");
    heuristicStateRef.current = "idle";
    capturedFramesRef.current = [];
  }, []);

  useEffect(() => {
    if (!open) return;
    startCamera();
    return () => cleanup();
  }, [open, startCamera, cleanup]);

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
          <div style={{ marginLeft: "auto" }}>
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
                      ? "¡Excelente! Avanzando a la siguiente letra..."
                      : "Intenta de nuevo"}
                  </div>
                  {heuristicResult.decision !== "accepted" && (
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

            <div
              style={{
                display: "flex",
                gap: 8,
                padding: 10,
                borderTop: "1px solid #1f2937",
              }}
            >
              <button
                onClick={() => {
                  resetScoreForCurrent();
                  startCamera();
                }}
                title="Reiniciar cámara"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "#111827",
                  border: "1px solid #1f2937",
                  color: "#e5e7eb",
                  cursor: "pointer",
                }}
              >
                <Camera size={16} /> Reiniciar cámara
              </button>
            </div>
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
