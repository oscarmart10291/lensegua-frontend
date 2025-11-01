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
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";

type MedalTier = "none" | "bronze" | "silver" | "gold";

export type ModuleProgress = {
  id: string;
  name: string;
  subtitle: string;
  progress: number;   // 0 - 100
  attempts: number;
  bestScore: number;  // 0 - 100
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

const MAX_ITEMS = 21; // mostramos hasta 21 imágenes

// =============== Modal interno para el Test Abecedario ===============
function AbecedarioTestModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<AbcMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);

  // ---- Simulador de coincidencia (prototipo) ----
  const [match, setMatch] = useState(0);            // 0..100
  const [correct, setCorrect] = useState(false);    // bandera de "✔ Correcto"
  const targetRef = useRef<number>(80);             // objetivo aleatorio ≥ 61
  const autoNextRef = useRef<number | null>(null);  // timeout para avanzar

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handsRef = useRef<Hands | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  // Cargar imágenes del abecedario desde Firebase
  useEffect(() => {
    if (!open) return;

    let mounted = true;
    setLoading(true);

    getAbecedarioUrls()
      .then((arr) => {
        if (!mounted) return;
        const onlyImages = arr.filter(
          (it) =>
            (it.kind ? it.kind === "image" : /\.(png|jpe?g|webp|gif)(\?|$)/i.test(it.url))
        );
        // Limitar a 21
        setItems(onlyImages.slice(0, MAX_ITEMS));
        setIdx(0);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));

    return () => {
      mounted = false;
    };
  }, [open]);

  // Reinicia el objetivo y la barra cuando cambia de imagen
  const resetMatchForCurrent = useCallback(() => {
    const target = Math.floor(61 + Math.random() * 38); // 61..98
    targetRef.current = target;
    setMatch(0);
    setCorrect(false);
    if (autoNextRef.current) {
      window.clearTimeout(autoNextRef.current);
      autoNextRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    resetMatchForCurrent();
  }, [open, idx, resetMatchForCurrent]);

  // Inicializar MediaPipe + cámara
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

        // Ajustar tamaño del canvas al del video
        canvasEl.width = videoEl.videoWidth || 1280;
        canvasEl.height = videoEl.videoHeight || 720;

        // Limpiar y dibujar frame
        ctx.save();
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);

        const hasHand =
          !!results.multiHandLandmarks && results.multiHandLandmarks.length > 0;

        // Dibujar landmarks
        if (hasHand) {
          for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(ctx as any, landmarks, HAND_CONNECTIONS, { lineWidth: 2 });
            drawLandmarks(ctx as any, landmarks, { lineWidth: 1, radius: 3 });
          }
        }
        ctx.restore();

        // ---------- Simulación de coincidencia ----------
        if (hasHand && !correct) {
          // Incremento suave hacia el objetivo
          setMatch((prev) => {
            const target = targetRef.current;
            const step = 5; // velocidad de subida
            const next = Math.min(prev + step, target);
            if (next >= target && !correct) {
              // Marcamos correcto y pasamos a la siguiente
              setCorrect(true);
              if (!autoNextRef.current) {
                autoNextRef.current = window.setTimeout(() => {
                  autoNextRef.current = null;
                  setCorrect(false);
                  // avanzar
                  setIdx((p) => {
                    const nextIdx = p + 1;
                    if (nextIdx >= (items.length || 0)) {
                      alert("¡Test finalizado! ✅");
                      return p; // ya no avanzamos
                    }
                    return nextIdx;
                  });
                }, 800); // pequeña pausa para mostrar el check
              }
            }
            return next;
          });
        } else if (!hasHand && !correct) {
          // sin mano, tendemos a bajar lentamente (opcional)
          setMatch((prev) => Math.max(0, prev - 1));
        }
      });

      handsRef.current = hands;

      // Bucle de envío de frames al modelo
      const processFrame = async () => {
        if (!videoRef.current || !handsRef.current) return;
        await handsRef.current.send({ image: videoRef.current as any });
        rafRef.current = requestAnimationFrame(processFrame);
      };
      rafRef.current = requestAnimationFrame(processFrame);
    } catch (err) {
      console.error(err);
      alert("No se pudo acceder a la cámara. Revisa permisos del navegador.");
    }
  }, [correct, items.length]);

  // Limpieza (detener cámara/RAF/timeout) al cerrar/desmontar
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

  const pct = Math.round(match);

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
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Prueba: Abecedario</h3>
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

            {/* Controles de navegación manual (opcional) */}
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
                    items.length === 0 || idx === items.length - 1
                      ? "not-allowed"
                      : "pointer",
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
              <strong>Cámara (MediaPipe Hands)</strong>
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
                  Objetivo: {targetRef.current}%
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
                  // Reiniciar cámara y también la simulación
                  resetMatchForCurrent();
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

        {/* Responsive: grid -> columnas en pantallas pequeñas */}
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
  // Construimos los módulos a partir de MODULES, todo en cero
  const modules: ModuleProgress[] = useMemo(
    () =>
      MODULES.map((m) => ({
        id: m.key,
        name: m.title,
        subtitle: m.subtitle,
        progress: 0,
        attempts: 0,
        bestScore: 0,
        medal: "none",
        coinsEarned: 0,
        locked: false,
      })),
    []
  );

  // Stats en cero
  const stats = useMemo(
    () => ({
      totalCoins: 0,
      completed: 0,
      medals: { gold: 0, silver: 0, bronze: 0 },
    }),
    []
  );

  const [showAbcModal, setShowAbcModal] = useState(false);

  const onAction = (m: ModuleProgress) => {
    const isAbc = m.id.toLowerCase() === "abecedario" || m.name.toLowerCase() === "abecedario";
    if (isAbc) {
      setShowAbcModal(true);
    } else {
      alert("Pronto disponible para este módulo.");
    }
  };

  return (
    <>
      <Navbar />
      <main className={`${s.wrapper} ${s.withNavbar}`}>
        <header className={s.header}>
          <div className={s.headerTop}>
            <h1 className={s.title}>Resultados y Tests</h1>
            <p className={s.subtitle}>
              Revisa tu progreso por módulo, gana <strong>monedas</strong> y obtén <strong>medallas</strong> al completar.
            </p>
          </div>

          <div className={s.statsRow} role="region" aria-label="Estadísticas de progreso">
            <div className={s.statCard}>
              <div className={s.statIconWrap}><Coins aria-hidden /></div>
              <div className={s.statMeta}>
                <span className={s.statLabel}>Monedas</span>
                <span className={s.statValue}>{stats.totalCoins}</span>
              </div>
            </div>

            <div className={s.statCard}>
              <div className={s.statIconWrap}><Trophy aria-hidden /></div>
              <div className={s.statMeta}>
                <span className={s.statLabel}>Módulos completados</span>
                <span className={s.statValue}>{stats.completed}</span>
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
                  <b>{stats.medals.gold}</b> oro · <b>{stats.medals.silver}</b> plata · <b>{stats.medals.bronze}</b> bronce
                </span>
              </div>
            </div>
          </div>
        </header>

        <section className={s.grid} aria-label="Progreso por módulo">
          {modules.map((m) => {
            const isAbc = m.id.toLowerCase() === "abecedario" || m.name.toLowerCase() === "abecedario";
            return (
              <article key={m.id} className={s.card}>
                <div className={s.cardHeader}>
                  <div className={s.iconWrap}><Star aria-hidden /></div>

                  <div className={s.cardHeadings}>
                    <h3 className={s.cardTitle}>{m.name}</h3>
                    <p className={s.cardSubtitle}>{m.subtitle}</p>
                  </div>

                  <div className={s.rewardArea}>
                    <span className={s.badgeMuted}>{medalLabel("none")}</span>
                  </div>
                </div>

                <div className={s.progressRow} aria-label="Progreso 0%">
                  <div className={s.progressBar}>
                    <div className={s.progressFill} style={{ width: "0%" }} />
                  </div>
                  <span className={s.progressLabel}>0%</span>
                </div>

                <div className={s.metaRow}>
                  <span className={s.pill}>Intentos: <b>0</b></span>
                  <span className={s.pill}>Mejor: <b>0%</b></span>
                  <span className={s.pill}><Coins size={14} /> 0</span>
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
      <AbecedarioTestModal open={showAbcModal} onClose={() => setShowAbcModal(false)} />
    </>
  );
}
