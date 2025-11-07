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

// 👇 TensorFlow.js para detección real
import * as tf from "@tensorflow/tfjs";

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

// =============== Configuración para detección ===============
const CFG = {
  MIRROR_X: true,
  USE_Z_BY_F: (F: number) => F === 63,
  SMOOTH_EMA: 0.5,
  MIN_CONFIDENCE: 0.60, // 60% mínimo para marcar como correcta
  DECAY_NOT_CONFIDENT: 0.90,
  MODEL_URL: "/models/estatico_last/model.json",
};

const MAX_ITEMS = 26; // todas las letras A-Z

// =============== Helper para convertir landmarks a vector ===============
function landmarksToVector(hand: MPPoint[], F: number): Float32Array {
  const expectZ = CFG.USE_Z_BY_F(F);

  let pts = hand.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 }));
  if (CFG.MIRROR_X) for (const p of pts) p.x = 1 - p.x;

  // Origen en muñeca
  const wrist = pts[0];
  for (const p of pts) {
    p.x -= wrist.x;
    p.y -= wrist.y;
    p.z -= wrist.z;
  }

  // Escala bbox
  let minX = +Infinity,
    minY = +Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const scale = Math.max(1e-6, Math.hypot(maxX - minX, maxY - minY));
  for (const p of pts) {
    p.x /= scale;
    p.y /= scale;
    p.z /= scale;
  }

  const out: number[] = [];
  for (const p of pts) {
    out.push(p.x, p.y);
    if (expectZ) out.push(p.z);
  }

  if (out.length < F) while (out.length < F) out.push(0);
  else if (out.length > F) out.length = F;

  return new Float32Array(out);
}

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
  const [score, setScore] = useState(0); // 0..1
  const [correct, setCorrect] = useState(false);
  const autoNextRef = useRef<number | null>(null);

  // Refs para cámara y MediaPipe
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handsRef = useRef<Hands | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const sendingRef = useRef(false);
  const lastInferAtRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Modelo de TensorFlow
  const modelRef = useRef<tf.LayersModel | null>(null);
  const [inputKind, setInputKind] = useState<"vector" | "sequence" | null>(null);
  const [vecLen, setVecLen] = useState<number | null>(null);
  const [seqShape, setSeqShape] = useState<{ T: number; F: number } | null>(null);
  const seqBufferRef = useRef<number[][]>([]);

  // Mapeo de clases
  const [classIndex, setClassIndex] = useState<Record<string, number> | null>(null);

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
    if (autoNextRef.current) {
      window.clearTimeout(autoNextRef.current);
      autoNextRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    resetScoreForCurrent();
  }, [open, idx, resetScoreForCurrent]);

  // Cargar modelo de TensorFlow
  useEffect(() => {
    if (!open) return;
    let active = true;

    (async () => {
      try {
        await tf.ready();
        const m = await tf.loadLayersModel(CFG.MODEL_URL);
        if (!active) return;
        modelRef.current = m;

        const inShape = m.inputs[0].shape as (number | null)[];
        if (inShape.length === 2) {
          setInputKind("vector");
          setVecLen(Number(inShape[1]));
        } else if (inShape.length === 3) {
          setInputKind("sequence");
          setSeqShape({ T: Number(inShape[1]), F: Number(inShape[2]) });
        }

        console.log("✅ Modelo cargado:", CFG.MODEL_URL);
      } catch (err) {
        console.error("❌ Error al cargar modelo:", err);
      }
    })();

    return () => {
      active = false;
      modelRef.current = null;
    };
  }, [open]);

  // Cargar mapeo de clases
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const base = CFG.MODEL_URL.replace(/\/model\.json$/i, "");
        const resp = await fetch(`${base}/class_index.json`, { cache: "no-store" });
        const fromFile = resp.ok ? await resp.json() : null;
        if (cancelled) return;
        if (fromFile) setClassIndex(fromFile);
      } catch (err) {
        console.warn("⚠️ No se pudo cargar class_index.json:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Inicializar cámara y MediaPipe
  const startCamera = useCallback(async () => {
    try {
      // Crear un nuevo AbortController para esta sesión de cámara
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      // Verificar si el componente está montado antes de proceder
      if (!mountedRef.current) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      // Verificar nuevamente después de la operación async
      if (!mountedRef.current || signal.aborted) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

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
              if (!mountedRef.current || signal.aborted) {
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

      // Verificar nuevamente antes de inicializar MediaPipe
      if (!mountedRef.current || signal.aborted) return;

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
        if (!mountedRef.current) return;

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
        }
        ctx.restore();

        const now = performance.now();
        if (now - lastInferAtRef.current > 225) {
          lastInferAtRef.current = now;
          inferScore(results);
        }
      });

      if (!mountedRef.current || signal.aborted) {
        hands.close();
        return;
      }

      handsRef.current = hands;

      // Bucle de envío de frames
      const processFrame = async () => {
        if (!mountedRef.current || !videoRef.current || !handsRef.current || sendingRef.current) return;
        sendingRef.current = true;
        try {
          await handsRef.current.send({ image: videoRef.current as any });
        } catch (err) {
          console.warn("Error al enviar frame:", err);
        }
        sendingRef.current = false;
        if (mountedRef.current) {
          rafRef.current = requestAnimationFrame(processFrame);
        }
      };
      rafRef.current = requestAnimationFrame(processFrame);
    } catch (err: any) {
      // Ignorar errores de abort, que son esperados cuando se cierra el modal
      if (err.name === "AbortError" || err.message?.includes("aborted")) {
        console.log("Inicialización de cámara cancelada (esperado)");
        return;
      }
      console.error("❌ Error en startCamera:", err);
      if (mountedRef.current) {
        alert("No se pudo acceder a la cámara. Revisa permisos del navegador.");
      }
    }
  }, []);

  // Inferencia con el modelo
  const inferScore = async (results: Results) => {
    const model = modelRef.current;
    if (!model || !inputKind) return;

    const hand = results.multiHandLandmarks?.[0];
    if (!hand) {
      setScore((prev) => prev * CFG.DECAY_NOT_CONFIDENT);
      return;
    }

    const currentLabel = items[idx]?.label;
    if (!currentLabel || !classIndex) {
      setScore((prev) => prev * CFG.DECAY_NOT_CONFIDENT);
      return;
    }

    const mappedIdx = classIndex[currentLabel];
    if (typeof mappedIdx !== "number") {
      setScore((prev) => prev * CFG.DECAY_NOT_CONFIDENT);
      return;
    }

    try {
      let probsArr: Float32Array | number[] | null = null;

      if (inputKind === "vector" && vecLen) {
        const frameVec = landmarksToVector(hand as MPPoint[], vecLen);
        probsArr = await tf.tidy(() => {
          const x = tf.tensor(frameVec, [1, vecLen]);
          const out = model.predict(x) as tf.Tensor;
          const soft = tf.softmax(out);
          return soft.dataSync();
        });
      } else if (inputKind === "sequence" && seqShape) {
        const { T, F } = seqShape;
        const frameVec = landmarksToVector(hand as MPPoint[], F);
        const buf = seqBufferRef.current;
        buf.push(Array.from(frameVec));
        if (buf.length > T) buf.shift();
        const pad = Array.from({ length: Math.max(0, T - buf.length) }, () =>
          new Array(F).fill(0)
        );
        const win = pad.concat(buf);
        probsArr = await tf.tidy(() => {
          const x = tf.tensor(win, [1, T, F]);
          const out = model.predict(x) as tf.Tensor;
          const soft = tf.softmax(out);
          return soft.dataSync();
        });
      }

      if (!probsArr) return;

      const labelProb = probsArr[mappedIdx] ?? 0;

      // Actualizar score con EMA
      setScore((prev) => {
        const ema = prev * CFG.SMOOTH_EMA + labelProb * (1 - CFG.SMOOTH_EMA);
        const newScore = labelProb > 0 ? ema : ema * CFG.DECAY_NOT_CONFIDENT;

        // Si alcanza el umbral y no está marcado como correcto
        if (newScore >= CFG.MIN_CONFIDENCE && !correct) {
          setCorrect(true);

          // Registrar intento en la base de datos
          const precision = Math.round(newScore * 100);
          registrarIntento("abecedario", precision, true)
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

          // Auto-avanzar a la siguiente letra
          if (!autoNextRef.current) {
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
            }, 1200);
          }
        }

        return newScore;
      });
    } catch (err) {
      console.error("Error en inferencia:", err);
    }
  };

  // Limpieza
  const cleanup = useCallback(() => {
    // Abortar cualquier inicialización de cámara en progreso
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

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
  }, []);

  useEffect(() => {
    if (!open) {
      mountedRef.current = false;
      return;
    }

    mountedRef.current = true;
    startCamera();

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [open, startCamera, cleanup]);

  if (!open) return null;

  const pct = Math.round(score * 100);

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
              <strong>Cámara (Detección Real con TensorFlow.js)</strong>
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
                  cleanup();
                  // Esperar un momento antes de reiniciar para que la limpieza termine
                  setTimeout(() => {
                    mountedRef.current = true;
                    startCamera();
                  }, 100);
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
