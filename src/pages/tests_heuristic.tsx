// src/pages/tests_heuristic.tsx
// Nueva versión con sistema heurístico

import React, { useEffect, useRef, useState, useCallback } from "react";
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

import { MODULES } from "../constants/modules";
import { getAbecedarioMaybe as getAbecedarioUrls, AbcMediaItem } from "../lib/storage";

// MediaPipe Hands
import { Hands, HAND_CONNECTIONS, Results } from "@mediapipe/hands";
import { drawConnectors } from "@mediapipe/drawing_utils";

// Sistema heurístico
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

// API para progreso y monedas
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

const HEURISTIC_CFG = {
  MIN_SCORE: 60, // 60% mínimo para marcar como correcta
  CAPTURE_DURATION: 3000, // 3 segundos capturando frames
  MIN_FRAMES: 20, // Mínimo de frames para analizar
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

  // Estado de detección heurística
  const [capturing, setCapturing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [score, setScore] = useState(0); // Score del último análisis
  const [correct, setCorrect] = useState(false);
  const autoNextRef = useRef<number | null>(null);

  // Refs para cámara y MediaPipe
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handsRef = useRef<Hands | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const sendingRef = useRef(false);

  // Sistema heurístico
  const capturedFramesRef = useRef<Sequence>([]);
  const templatesRef = useRef<Template[]>([]);
  const templateDictRef = useRef<TemplateDict>({});
  const captureStartRef = useRef<number>(0);
  const lastAnalysisRef = useRef<number>(0);

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

  // Resetear estado al cambiar de letra
  const resetScoreForCurrent = useCallback(() => {
    setScore(0);
    setCorrect(false);
    setCapturing(false);
    setAnalyzing(false);
    capturedFramesRef.current = [];
    if (autoNextRef.current) {
      window.clearTimeout(autoNextRef.current);
      autoNextRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    resetScoreForCurrent();
  }, [open, idx, resetScoreForCurrent]);

  // Cargar plantillas heurísticas para la letra actual
  useEffect(() => {
    if (!open || !items[idx]) return;

    const currentLabel = items[idx].label;
    if (!currentLabel) return;

    let cancelled = false;

    (async () => {
      try {
        // Cargar plantillas de la letra objetivo
        const templates = await loadTemplatesForLetter("/landmarks", currentLabel, 3);
        if (cancelled) return;

        templatesRef.current = templates;
        console.log(`✅ Plantillas cargadas para "${currentLabel}": ${templates.length}`);

        // Cargar plantillas de otras letras para impostor check
        const allLetters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "RR", "S", "T", "U", "V", "W", "X", "Y", "Z"];
        const otherLetters = allLetters.filter(l => l !== currentLabel).slice(0, 5);

        for (const letter of otherLetters) {
          const otherTemplates = await loadTemplatesForLetter("/landmarks", letter, 1);
          if (cancelled) return;
          if (otherTemplates.length > 0) {
            templateDictRef.current[letter] = otherTemplates;
          }
        }
      } catch (error) {
        console.error("Error cargando plantillas:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, idx, items]);

  // Iniciar cámara y MediaPipe
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
        minDetectionConfidence: 0.5,
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

          // Capturar frames si estamos en modo captura
          if (capturing && !analyzing) {
            const frame = parseLandmarks(hand.map(p => ({ x: p.x, y: p.y, z: p.z ?? 0 })));
            capturedFramesRef.current.push(frame);
          }
        }
        ctx.restore();

        // Gestión automática de captura y análisis
        const now = performance.now();

        // Iniciar captura automáticamente si no está capturando ni analizando
        if (!capturing && !analyzing && !correct) {
          setCapturing(true);
          capturedFramesRef.current = [];
          captureStartRef.current = now;
        }

        // Si estamos capturando, verificar si debemos analizar
        if (capturing && now - captureStartRef.current >= HEURISTIC_CFG.CAPTURE_DURATION) {
          setCapturing(false);
          analyzeCapture();
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
  }, [capturing, analyzing, correct]);

  // Analizar captura con sistema heurístico
  const analyzeCapture = async () => {
    const captured = capturedFramesRef.current;
    const currentLabel = items[idx]?.label;

    if (!currentLabel) return;

    setAnalyzing(true);

    console.log(`\n🔍 ===== ANÁLISIS TEST: ${currentLabel} =====`);
    console.log(`📊 Frames capturados: ${captured.length}`);

    if (captured.length < HEURISTIC_CFG.MIN_FRAMES) {
      console.log(`❌ Muy pocos frames (mínimo: ${HEURISTIC_CFG.MIN_FRAMES})`);
      setAnalyzing(false);
      setScore(0);
      // Reiniciar captura automáticamente
      setTimeout(() => {
        setCapturing(true);
        capturedFramesRef.current = [];
        captureStartRef.current = performance.now();
      }, 500);
      return;
    }

    const targetTemplates = templatesRef.current;
    if (targetTemplates.length === 0) {
      console.log(`❌ No hay plantillas para "${currentLabel}"`);
      setAnalyzing(false);
      setScore(0);
      return;
    }

    // Seleccionar impostores
    const impostors = selectImpostorTemplates(templateDictRef.current, currentLabel, 5);

    // Ejecutar matching
    const result = matchSequence(captured, targetTemplates, DEFAULT_CONFIG, impostors);

    console.log(`📈 RESULTADO: Score=${result.score.toFixed(2)}%, Decision=${result.decision}`);

    const finalScore = Math.round(result.score);
    setScore(finalScore);
    setAnalyzing(false);

    // Si es correcto y no está ya marcado
    if (result.decision === "accepted" && finalScore >= HEURISTIC_CFG.MIN_SCORE && !correct) {
      setCorrect(true);

      // Registrar intento en la base de datos
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
        }, 1500);
      }
    } else {
      // No pasó, reiniciar captura después de un breve delay
      setTimeout(() => {
        capturedFramesRef.current = [];
        setCapturing(true);
        captureStartRef.current = performance.now();
      }, 1000);
    }
  };

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
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.7)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: 16,
          padding: "32px",
          maxWidth: 900,
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
          position: "relative",
        }}
      >
        {/* Botón cerrar */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 8,
          }}
          aria-label="Cerrar"
        >
          <X size={24} />
        </button>

        <h2 style={{ marginBottom: 24, fontSize: 28, fontWeight: 700 }}>
          Test del Abecedario
        </h2>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>Cargando...</div>
        ) : (
          <>
            {/* Progreso */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, marginBottom: 8, color: "#64748b" }}>
                Letra {idx + 1} de {items.length}
              </div>
              <div
                style={{
                  width: "100%",
                  height: 8,
                  backgroundColor: "#e2e8f0",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${((idx + 1) / items.length) * 100}%`,
                    height: "100%",
                    backgroundColor: "#3b82f6",
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </div>

            {/* Letra actual */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {/* Imagen de referencia */}
              <div>
                <h3 style={{ marginBottom: 12, fontSize: 18, fontWeight: 600 }}>
                  Letra: {items[idx]?.label}
                </h3>
                {items[idx] && (
                  <img
                    src={items[idx].url}
                    alt={items[idx].label}
                    style={{ width: "100%", borderRadius: 8 }}
                  />
                )}
              </div>

              {/* Vista de cámara */}
              <div>
                <h3 style={{ marginBottom: 12, fontSize: 18, fontWeight: 600 }}>
                  Tu seña
                </h3>
                <div style={{ position: "relative" }}>
                  <video
                    ref={videoRef}
                    style={{ display: "none" }}
                    playsInline
                    muted
                  />
                  <canvas
                    ref={canvasRef}
                    style={{ width: "100%", borderRadius: 8, backgroundColor: "#000" }}
                  />

                  {/* Estado */}
                  <div
                    style={{
                      position: "absolute",
                      top: 12,
                      left: 12,
                      padding: "6px 12px",
                      borderRadius: 6,
                      backgroundColor: capturing
                        ? "#3b82f6"
                        : analyzing
                        ? "#f59e0b"
                        : correct
                        ? "#10b981"
                        : "#6b7280",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {capturing
                      ? "Capturando..."
                      : analyzing
                      ? "Analizando..."
                      : correct
                      ? "¡Correcto!"
                      : "Esperando..."}
                  </div>

                  {/* Score */}
                  {score > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: 12,
                        right: 12,
                        padding: "6px 12px",
                        borderRadius: 6,
                        backgroundColor: correct ? "#10b981" : "#6b7280",
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      {score}%
                    </div>
                  )}

                  {/* Checkmark cuando correcto */}
                  {correct && (
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      <CheckCircle size={80} color="#10b981" />
                    </div>
                  )}
                </div>

                {/* Instrucciones */}
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    backgroundColor: "#f1f5f9",
                    borderRadius: 6,
                    fontSize: 13,
                    color: "#475569",
                  }}
                >
                  {capturing
                    ? `Mantén la seña de "${items[idx]?.label}"...`
                    : analyzing
                    ? "Analizando tu seña..."
                    : correct
                    ? "¡Excelente! Avanzando a la siguiente..."
                    : `Haz la seña de "${items[idx]?.label}"`}
                </div>
              </div>
            </div>

            {/* Navegación */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 24,
              }}
            >
              <button
                onClick={() => {
                  if (idx > 0) {
                    setIdx(idx - 1);
                  }
                }}
                disabled={idx === 0}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "none",
                  backgroundColor: idx === 0 ? "#e2e8f0" : "#3b82f6",
                  color: idx === 0 ? "#94a3b8" : "#fff",
                  cursor: idx === 0 ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Left size={18} />
                Anterior
              </button>

              <button
                onClick={() => {
                  if (idx < items.length - 1) {
                    setIdx(idx + 1);
                  }
                }}
                disabled={idx >= items.length - 1}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "none",
                  backgroundColor: idx >= items.length - 1 ? "#e2e8f0" : "#3b82f6",
                  color: idx >= items.length - 1 ? "#94a3b8" : "#fff",
                  cursor: idx >= items.length - 1 ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                Siguiente
                <Right size={18} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// =================== Página principal ===================
export default function TestsPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [modules, setModules] = useState<ModuleProgress[]>([]);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  // Cargar stats del usuario
  useEffect(() => {
    if (!user) return;

    getUserStats()
      .then((data) => {
        setStats(data);

        // Construir módulos de progreso
        const moduleData: ModuleProgress[] = MODULES.map((m) => {
          const moduleAttempts = data.intentos.filter((i) => i.tipo === m.id);
          const totalAttempts = moduleAttempts.length;
          const successfulAttempts = moduleAttempts.filter((i) => i.correcta).length;
          const progress = totalAttempts > 0 ? (successfulAttempts / totalAttempts) * 100 : 0;
          const bestScore = moduleAttempts.length > 0
            ? Math.max(...moduleAttempts.map((i) => i.precision))
            : 0;

          let medal: MedalTier = "none";
          if (bestScore >= 90) medal = "gold";
          else if (bestScore >= 75) medal = "silver";
          else if (bestScore >= 60) medal = "bronze";

          return {
            id: m.id,
            name: m.name,
            subtitle: m.subtitle,
            progress: Math.round(progress),
            attempts: totalAttempts,
            bestScore,
            medal,
            coinsEarned: moduleAttempts.reduce((sum, i) => sum + (i.monedas_ganadas || 0), 0),
          };
        });

        setModules(moduleData);
      })
      .catch((err) => {
        console.error("Error cargando stats:", err);
      });
  }, [user]);

  const refreshStats = () => {
    if (!user) return;
    getUserStats()
      .then((data) => {
        setStats(data);

        const moduleData: ModuleProgress[] = MODULES.map((m) => {
          const moduleAttempts = data.intentos.filter((i) => i.tipo === m.id);
          const totalAttempts = moduleAttempts.length;
          const successfulAttempts = moduleAttempts.filter((i) => i.correcta).length;
          const progress = totalAttempts > 0 ? (successfulAttempts / totalAttempts) * 100 : 0;
          const bestScore = moduleAttempts.length > 0
            ? Math.max(...moduleAttempts.map((i) => i.precision))
            : 0;

          let medal: MedalTier = "none";
          if (bestScore >= 90) medal = "gold";
          else if (bestScore >= 75) medal = "silver";
          else if (bestScore >= 60) medal = "bronze";

          return {
            id: m.id,
            name: m.name,
            subtitle: m.subtitle,
            progress: Math.round(progress),
            attempts: totalAttempts,
            bestScore,
            medal,
            coinsEarned: moduleAttempts.reduce((sum, i) => sum + (i.monedas_ganadas || 0), 0),
          };
        });

        setModules(moduleData);
      })
      .catch((err) => {
        console.error("Error refrescando stats:", err);
      });
  };

  return (
    <div className={s.page}>
      <Navbar />

      <div className={s.container}>
        <header className={s.header}>
          <h1>Tests de Práctica</h1>
          <p>Pon a prueba tus conocimientos y gana medallas</p>
        </header>

        {/* Resumen de stats */}
        {stats && (
          <div className={s.statsCard}>
            <div className={s.statItem}>
              <Coins size={24} color="#f59e0b" />
              <div>
                <div className={s.statValue}>{stats.monedas_totales}</div>
                <div className={s.statLabel}>Monedas</div>
              </div>
            </div>
            <div className={s.statItem}>
              <Trophy size={24} color="#10b981" />
              <div>
                <div className={s.statValue}>{stats.medallas_totales}</div>
                <div className={s.statLabel}>Medallas</div>
              </div>
            </div>
            <div className={s.statItem}>
              <Star size={24} color="#3b82f6" />
              <div>
                <div className={s.statValue}>{stats.puntos_totales}</div>
                <div className={s.statLabel}>Puntos</div>
              </div>
            </div>
          </div>
        )}

        {/* Módulos */}
        <div className={s.moduleGrid}>
          {modules.map((module) => (
            <div key={module.id} className={s.moduleCard}>
              <div className={s.moduleHeader}>
                <Camera size={32} color="#3b82f6" />
                <div className={s.moduleInfo}>
                  <h3>{module.name}</h3>
                  <p>{module.subtitle}</p>
                </div>
              </div>

              <div className={s.moduleStats}>
                <div className={s.moduleStat}>
                  <span>Progreso</span>
                  <strong>{module.progress}%</strong>
                </div>
                <div className={s.moduleStat}>
                  <span>Mejor Score</span>
                  <strong>{module.bestScore}%</strong>
                </div>
                <div className={s.moduleStat}>
                  <span>Medalla</span>
                  <strong>{medalLabel(module.medal)}</strong>
                </div>
              </div>

              <button
                className={s.startButton}
                onClick={() => setSelectedModule(module.id)}
              >
                Comenzar Test
                <ChevronRight size={20} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Modal del test */}
      <AbecedarioTestModal
        open={selectedModule === "abecedario"}
        onClose={() => setSelectedModule(null)}
        onProgressUpdate={refreshStats}
      />
    </div>
  );
}
