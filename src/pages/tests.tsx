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

// 👇 Sistema heurístico de reconocimiento
import {
  loadTemplatesForLetter,
  matchSequence,
  DEFAULT_CONFIG,
  type Sequence,
  type LandmarkPoint,
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

// =============== Configuración ===============
const MAX_ITEMS = 26; // todas las letras A-Z
const COUNTDOWN_SECONDS = 3; // Cuenta regresiva antes de capturar
const CAPTURE_SECONDS = 3; // Tiempo de captura de landmarks

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

  // Estados del workflow: idle → countdown → capturing → analyzing → result
  type Phase = "idle" | "countdown" | "capturing" | "analyzing" | "result";
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [captureProgress, setCaptureProgress] = useState(0);

  // Resultado del análisis heurístico
  const [matchResult, setMatchResult] = useState<{
    decision: "accepted" | "rejected" | "ambiguous";
    score: number;
    distance: number;
  } | null>(null);

  // Refs para cámara y MediaPipe
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handsRef = useRef<Hands | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const sendingRef = useRef(false);

  // Captura de landmarks para análisis heurístico
  const capturedSequenceRef = useRef<Sequence>([]);
  const captureStartTimeRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("idle");
  const countdownIntervalRef = useRef<number | null>(null);
  const autoNextRef = useRef<number | null>(null);

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

  // Reiniciar estado al cambiar de letra
  const resetForCurrentLetter = useCallback(() => {
    setPhase("idle");
    setMatchResult(null);
    setCaptureProgress(0);
    setCountdown(COUNTDOWN_SECONDS);
    capturedSequenceRef.current = [];
    if (autoNextRef.current) {
      window.clearTimeout(autoNextRef.current);
      autoNextRef.current = null;
    }
    if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    resetForCurrentLetter();
  }, [open, idx, resetForCurrentLetter]);

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
        }
        ctx.restore();

        // Capturar landmarks durante la fase de captura
        if (phaseRef.current === "capturing" && hand) {
          const frame: LandmarkPoint[] = hand.map((p: MPPoint) => ({
            x: p.x,
            y: p.y,
            z: p.z ?? 0,
          }));
          capturedSequenceRef.current.push(frame);

          // Actualizar progreso
          const elapsed = performance.now() - captureStartTimeRef.current;
          const progress = Math.min(100, (elapsed / (CAPTURE_SECONDS * 1000)) * 100);
          setCaptureProgress(progress);

          // Si completamos la captura, analizar
          if (elapsed >= CAPTURE_SECONDS * 1000) {
            phaseRef.current = "analyzing";
            setPhase("analyzing");
            analyzeCapture();
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
    } catch (err) {
      console.error(err);
      alert("No se pudo acceder a la cámara. Revisa permisos del navegador.");
    }
  }, []);

  // Iniciar cuenta regresiva
  const startCountdown = useCallback(() => {
    setPhase("countdown");
    phaseRef.current = "countdown";
    setCountdown(COUNTDOWN_SECONDS);
    capturedSequenceRef.current = [];
    setCaptureProgress(0);

    let remaining = COUNTDOWN_SECONDS;
    countdownIntervalRef.current = window.setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);

      if (remaining <= 0) {
        if (countdownIntervalRef.current) {
          window.clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        // Iniciar captura
        phaseRef.current = "capturing";
        setPhase("capturing");
        captureStartTimeRef.current = performance.now();
      }
    }, 1000);
  }, []);

  // Analizar la secuencia capturada con heurística
  const analyzeCapture = useCallback(async () => {
    const currentLabel = items[idx]?.label;
    if (!currentLabel) {
      setMatchResult({
        decision: "rejected",
        score: 0,
        distance: Infinity,
      });
      setPhase("result");
      return;
    }

    const captured = capturedSequenceRef.current;
    if (captured.length === 0) {
      setMatchResult({
        decision: "rejected",
        score: 0,
        distance: Infinity,
      });
      setPhase("result");
      return;
    }

    try {
      // Cargar plantillas para la letra actual
      const templates = await loadTemplatesForLetter("/landmarks", currentLabel, 3);

      if (templates.length === 0) {
        setMatchResult({
          decision: "rejected",
          score: 0,
          distance: Infinity,
        });
        setPhase("result");
        return;
      }

      // Ejecutar matching heurístico (sin impostores por ahora para simplificar)
      const result = matchSequence(captured, templates, DEFAULT_CONFIG);

      setMatchResult({
        decision: result.decision,
        score: result.score,
        distance: result.distance,
      });
      setPhase("result");

      // Si fue aceptado, registrar en la base de datos
      if (result.decision === "accepted") {
        const precision = Math.round(result.score);
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

        // Auto-avanzar a la siguiente letra después de 2 segundos
        autoNextRef.current = window.setTimeout(() => {
          autoNextRef.current = null;
          const nextIdx = idx + 1;
          if (nextIdx >= items.length) {
            alert("¡Test finalizado! ✅");
          } else {
            setIdx(nextIdx);
          }
        }, 2000);
      }
    } catch (err) {
      console.error("Error al analizar captura:", err);
      setMatchResult({
        decision: "rejected",
        score: 0,
        distance: Infinity,
      });
      setPhase("result");
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

    if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    phaseRef.current = "idle";
  }, []);

  useEffect(() => {
    if (!open) return;
    startCamera();
    return () => cleanup();
  }, [open, startCamera, cleanup]);

  if (!open) return null;

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
            Prueba: Abecedario (Sistema Heurístico)
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
            </div>

            {/* Estado del proceso */}
            <div
              style={{
                padding: 12,
                borderTop: "1px solid #1f2937",
                minHeight: 80,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                gap: 10,
              }}
            >
              {phase === "idle" && (
                <button
                  onClick={startCountdown}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "12px 24px",
                    borderRadius: 8,
                    background: "#2563eb",
                    border: "1px solid #1e40af",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  <Camera size={18} /> Comenzar prueba
                </button>
              )}

              {phase === "countdown" && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 48, fontWeight: 700, color: "#f59e0b" }}>
                    {countdown}
                  </div>
                  <div style={{ fontSize: 14, opacity: 0.8, marginTop: 4 }}>
                    Prepárate...
                  </div>
                </div>
              )}

              {phase === "capturing" && (
                <div style={{ width: "100%", textAlign: "center" }}>
                  <div style={{ fontSize: 14, marginBottom: 8, color: "#22c55e" }}>
                    ¡Capturando! Mantén la seña...
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: 14,
                      background: "#111827",
                      border: "1px solid #1f2937",
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${captureProgress}%`,
                        height: "100%",
                        background: "#22c55e",
                        transition: "width 100ms linear",
                      }}
                    />
                  </div>
                </div>
              )}

              {phase === "analyzing" && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#3b82f6" }}>
                    Analizando...
                  </div>
                </div>
              )}

              {phase === "result" && matchResult && (
                <div style={{ width: "100%", textAlign: "center" }}>
                  {matchResult.decision === "accepted" ? (
                    <>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 16,
                          color: "#22c55e",
                          fontWeight: 600,
                          marginBottom: 6,
                        }}
                      >
                        <CheckCircle size={20} /> ¡Correcto!
                      </div>
                      <div style={{ fontSize: 13, opacity: 0.8 }}>
                        Score: {Math.round(matchResult.score)}%
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                        Avanzando a la siguiente...
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          fontSize: 16,
                          color: matchResult.decision === "rejected" ? "#ef4444" : "#f59e0b",
                          fontWeight: 600,
                          marginBottom: 6,
                        }}
                      >
                        {matchResult.decision === "rejected" ? "Rechazado" : "Incierto"}
                      </div>
                      <div style={{ fontSize: 13, opacity: 0.8 }}>
                        Score: {Math.round(matchResult.score)}%
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                        Distancia: {matchResult.distance.toFixed(2)}
                      </div>
                      <button
                        onClick={() => {
                          resetForCurrentLetter();
                          startCountdown();
                        }}
                        style={{
                          marginTop: 10,
                          padding: "8px 16px",
                          borderRadius: 8,
                          background: "#2563eb",
                          border: "1px solid #1e40af",
                          color: "white",
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        Reintentar
                      </button>
                    </>
                  )}
                </div>
              )}
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
