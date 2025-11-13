import React, { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import { Hands, HAND_CONNECTIONS, Results } from "@mediapipe/hands";
import { drawConnectors } from "@mediapipe/drawing_utils";
import * as tf from "@tensorflow/tfjs";
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

/* =================== Tipos y props =================== */
type Props = {
  label: string;              // "A", "B", ...
  open: boolean;
  onClose: () => void;
  modelUrl?: string;          // default: /models/estatico_last/model.json
  mode?: "tensorflow" | "heuristic";  // default: tensorflow
};

type MPPoint = { x: number; y: number; z?: number };

type HeuristicState = "idle" | "countdown" | "capturing" | "analyzing" | "result";

type HeuristicResult = {
  score: number;
  decision: "accepted" | "rejected" | "ambiguous";
  distance: number;
};

/* =================== Configuración =================== */
const CFG = {
  MIRROR_X: true,                         // invierte X si entrenaste con cámara frontal
  USE_Z_BY_F: (F: number) => F === 63,    // Z solo si F=63 (21*3)
  SCALE_MODE: "bbox" as "palm" | "bbox" | "maxnorm",
  ROT_ALIGN: false,

  SMOOTH_EMA: 0.5,
  MIN_CONFIDENCE: 0.40,                   // umbral para barra en modo general
  DECAY_NOT_CONFIDENT: 0.90,
};

const LS_KEY = "lensegua_class_index";    // respaldo local del mapeo

/* =================== Componente =================== */
export default function PracticeModal({
  label,
  open,
  onClose,
  modelUrl = "/models/estatico_last/model.json",
  mode = "heuristic", // Por defecto heurístico
}: Props) {
  const webcamRef = useRef<Webcam | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handsRef = useRef<Hands | null>(null);
  const rafRef = useRef<number>(0);
  const sendingRef = useRef(false);
  const lastInferAtRef = useRef(0);

  // cámara
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  // modelo e input (TensorFlow)
  const modelRef = useRef<tf.LayersModel | null>(null);
  const [inputKind, setInputKind] = useState<"vector" | "sequence" | "image" | null>(null);
  const [vecLen, setVecLen] = useState<number | null>(null);
  const [seqShape, setSeqShape] = useState<{ T: number; F: number } | null>(null);
  const [imgShape, setImgShape] = useState<[number, number, number] | null>(null);
  const [numClasses, setNumClasses] = useState<number>(0);
  const [lastActivation, setLastActivation] = useState<string>("(?)");

  // salida / debug (TensorFlow)
  const [score, setScore] = useState(0);
  const [topIdx, setTopIdx] = useState<number | null>(null);
  const [topProb, setTopProb] = useState<number>(0);
  const seqBufferRef = useRef<number[][]>([]);

  // mapeo (TensorFlow)
  const [classIndex, setClassIndex] = useState<Record<string, number> | null>(null);
  const [calMode, setCalMode] = useState(false); // modo calibración (UI)

  // === MODO HEURÍSTICO ===
  const [heuristicState, setHeuristicState] = useState<HeuristicState>("idle");
  const [countdown, setCountdown] = useState(3);
  const [heuristicResult, setHeuristicResult] = useState<HeuristicResult | null>(null);
  const capturedFramesRef = useRef<Sequence>([]);
  const templatesRef = useRef<Template[]>([]);
  const templateDictRef = useRef<TemplateDict>({});
  const countdownTimerRef = useRef<number | null>(null);

  // Refs para acceder al estado actual desde el callback de MediaPipe
  const heuristicStateRef = useRef<HeuristicState>("idle");
  const modeRef = useRef<"tensorflow" | "heuristic">(mode);

  /* ---------- helpers mapeo ---------- */
  const loadLocalMapping = () => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw) as Record<string, number>;
    } catch {}
    return null;
  };

  const saveLocalMapping = (map: Record<string, number>) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch {}
  };

  const mergeMapping = (a: Record<string, number> | null, b: Record<string, number> | null) => {
    return { ...(a || {}), ...(b || {}) };
  };

  const assignTopToCurrentLabel = () => {
    if (topIdx == null) return;
    setClassIndex(prev => {
      const next = { ...(prev || {}) };
      next[label] = topIdx;
      saveLocalMapping(next);
      return next;
    });
  };

  const downloadJSON = () => {
    const map = classIndex || {};
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.download = "class_index.json";
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ---------- funciones modo heurístico ---------- */
  const startHeuristicCountdown = () => {
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
        // Iniciar fase de captura
        startCapture();
      }
    }, 1000);
  };

  const startCapture = () => {
    setHeuristicState("capturing");
    heuristicStateRef.current = "capturing";
    setCountdown(3); // 3 segundos para realizar la seña

    let count = 3;
    countdownTimerRef.current = window.setInterval(() => {
      count--;
      setCountdown(count);
      if (count === 0) {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        analyzeHeuristicCapture();
      }
    }, 1000);
  };

  const analyzeHeuristicCapture = async () => {
    setHeuristicState("analyzing");
    heuristicStateRef.current = "analyzing"; // Actualizar ref también

    // Esperar un poco para mostrar el estado "Analizando..."
    await new Promise(resolve => setTimeout(resolve, 500));

    const captured = capturedFramesRef.current;
    console.log(`\n🔍 ===== ANÁLISIS HEURÍSTICO: ${label} =====`);
    console.log(`📊 Frames capturados: ${captured.length}`);

    if (captured.length < DEFAULT_CONFIG.minFramesRequired) {
      console.log(`❌ Muy pocos frames (mínimo: ${DEFAULT_CONFIG.minFramesRequired})`);
      setHeuristicResult({
        score: 0,
        decision: "rejected",
        distance: Infinity,
      });
      setHeuristicState("result");
      return;
    }

    // Obtener plantillas de la letra objetivo
    const targetTemplates = templatesRef.current;
    console.log(`📁 Plantillas de "${label}": ${targetTemplates.length}`);

    if (targetTemplates.length === 0) {
      console.log(`❌ No hay plantillas para la letra "${label}"`);
      setHeuristicResult({
        score: 0,
        decision: "rejected",
        distance: Infinity,
      });
      setHeuristicState("result");
      return;
    }

    // Seleccionar impostores
    const impostors = selectImpostorTemplates(templateDictRef.current, label, 5);
    console.log(`👥 Impostores seleccionados: ${impostors.length} letras diferentes`);

    // Ejecutar matching
    const result = matchSequence(captured, targetTemplates, DEFAULT_CONFIG, impostors);

    console.log(`\n📈 RESULTADO:`);
    console.log(`   Score: ${result.score.toFixed(2)}%`);
    console.log(`   Decision: ${result.decision}`);
    console.log(`   Distance: ${result.distance.toFixed(4)}`);
    if (result.topCandidates && result.topCandidates.length > 0) {
      console.log(`   Top 3 candidatos:`);
      result.topCandidates.forEach((c, i) => {
        console.log(`      ${i + 1}. ${c.letter}: ${c.distance.toFixed(4)}`);
      });
    }
    console.log(`======================================\n`);

    setHeuristicResult({
      score: Math.round(result.score),
      decision: result.decision,
      distance: result.distance,
    });
    setHeuristicState("result");
    heuristicStateRef.current = "result"; // Actualizar ref también
  };

  const retryHeuristic = () => {
    setHeuristicResult(null);
    capturedFramesRef.current = [];
    startHeuristicCountdown();
  };

  const closeHeuristic = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    setHeuristicState("idle");
    heuristicStateRef.current = "idle"; // Actualizar ref también
    setHeuristicResult(null);
    capturedFramesRef.current = [];
    onClose();
  };

  /* ---------- sincronizar refs con estado ---------- */
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  /* ---------- cargar plantillas heurísticas ---------- */
  useEffect(() => {
    if (!open || mode !== "heuristic") return;

    let cancelled = false;

    (async () => {
      try {
        // Cargar plantillas de la letra objetivo
        const templates = await loadTemplatesForLetter("/landmarks", label, 3);
        if (cancelled) return;

        templatesRef.current = templates;

        // Cargar también algunas plantillas de otras letras para impostor check
        // (esto podría precargarse en un contexto global)
        const allLetters = ["A", "B", "C", "E", "G", "H", "I", "K", "L", "M", "N", "O", "Q", "RR", "T", "U", "V", "W", "X", "Y", "Z"];
        const otherLetters = allLetters.filter(l => l !== label).slice(0, 5);

        for (const letter of otherLetters) {
          const otherTemplates = await loadTemplatesForLetter("/landmarks", letter, 1);
          if (cancelled) return;
          if (otherTemplates.length > 0) {
            templateDictRef.current[letter] = otherTemplates;
          }
        }

        // Iniciar countdown automáticamente
        if (!cancelled) {
          startHeuristicCountdown();
        }
      } catch (error) {
        console.error("Error cargando plantillas:", error);
      }
    })();

    return () => {
      cancelled = true;
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [open, mode, label]);

  /* ---------- cargar modelo ---------- */
  useEffect(() => {
    if (!open || mode !== "tensorflow") return;
    let active = true;
    setScore(0); setTopIdx(null); setTopProb(0);
    seqBufferRef.current = [];

    (async () => {
      await tf.ready();
      const m = await tf.loadLayersModel(modelUrl);
      if (!active) return;
      modelRef.current = m;

      const inShape = m.inputs[0].shape as (number | null)[];
      const outShape = m.outputs[0].shape as (number | null)[];
      if (inShape.length === 2) { setInputKind("vector"); setVecLen(Number(inShape[1])); }
      else if (inShape.length === 3) { setInputKind("sequence"); setSeqShape({ T: Number(inShape[1]), F: Number(inShape[2]) }); }
      else if (inShape.length === 4) { setInputKind("image"); setImgShape([Number(inShape[1]), Number(inShape[2]), Number(inShape[3])]); }
      else setInputKind(null);

      if (outShape) setNumClasses(Number(outShape[outShape.length - 1]));
      const last = m.layers[m.layers.length - 1] as any;
      setLastActivation(last?.getConfig?.().activation ?? "(?)");
    })();

    return () => { active = false; modelRef.current = null; };
  }, [open, mode, modelUrl]);

  /* ---------- cargar mapeo (archivo + localStorage) ---------- */
  useEffect(() => {
    if (!open || mode !== "tensorflow") return;
    let cancelled = false;

    const fromLS = loadLocalMapping();

    (async () => {
      try {
        const base = modelUrl.replace(/\/model\.json$/i, "");
        const resp = await fetch(`${base}/class_index.json`, { cache: "no-store" });
        const fromFile = resp.ok ? (await resp.json()) : null;
        if (cancelled) return;
        const merged = mergeMapping(fromFile, fromLS);
        if (Object.keys(merged).length > 0) setClassIndex(merged);
        else setClassIndex(null);
      } catch {
        // si falla, usa solo LS
        if (fromLS) setClassIndex(fromLS);
        else setClassIndex(null);
      }
    })();

    return () => { cancelled = true; };
  }, [open, mode, modelUrl]);

  /* ---------- mediapipe ---------- */
  useEffect(() => {
    if (!open) return;

    setCamError(null); setCamReady(false);

    const hands = new Hands({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
    });
    hands.setOptions({
      selfieMode: true,
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    hands.onResults((results: Results) => {
      const video = webcamRef.current?.video as HTMLVideoElement | undefined;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;

      const w = (canvas.width = video.videoWidth || 640);
      const h = (canvas.height = video.videoHeight || 480);

      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, w, h);
      if (results.image) ctx.drawImage(results.image as any, 0, 0, w, h);

      const hand = results.multiHandLandmarks?.[0];
      if (hand) {
        drawConnectors(ctx as any, hand as any, HAND_CONNECTIONS, { color: "#ffffff", lineWidth: 2 });
        ctx.save();
        ctx.fillStyle = "#22c55e"; ctx.strokeStyle = "#065f46"; ctx.lineWidth = 1.5;
        const R = Math.max(2.5, Math.min(w, h) * 0.006);
        for (const p of hand) { const x = p.x * w, y = p.y * h; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI*2); ctx.fill(); ctx.stroke(); }
        ctx.restore();

        // === CAPTURA PARA MODO HEURÍSTICO ===
        if (modeRef.current === "heuristic" && heuristicStateRef.current === "capturing" && hand) {
          const frame = parseLandmarks(hand.map(p => ({ x: p.x, y: p.y, z: p.z ?? 0 })));
          capturedFramesRef.current.push(frame);
        }
      }

      // === INFERENCIA PARA MODO TENSORFLOW ===
      if (modeRef.current === "tensorflow") {
        const now = performance.now();
        if (now - lastInferAtRef.current > 225) {
          lastInferAtRef.current = now;
          inferScore(results);
        }
      }
    });

    handsRef.current = hands;
    return () => { cancelAnimationFrame(rafRef.current); handsRef.current?.close(); handsRef.current = null; sendingRef.current = false; };
  }, [open, inputKind]);

  const handleUserMedia = () => {
    setCamReady(true); setCamError(null);
    const tick = () => {
      const v = webcamRef.current?.video as HTMLVideoElement | undefined;
      const h = handsRef.current;
      if (v && v.readyState === 4 && h && !sendingRef.current) {
        sendingRef.current = true;
        h.send({ image: v as any }).finally(() => (sendingRef.current = false));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };
  const handleUserMediaError = (err: any) => {
    console.error(err);
    setCamError(err?.name === "NotAllowedError"
      ? "Permiso de cámara denegado. Concede acceso y recarga la página."
      : "No se pudo acceder a la cámara.");
  };

  /* ---------- inferencia ---------- */
  const inferScore = async (results: Results) => {
    const model = modelRef.current;
    if (!model || !inputKind) return;

    let probsArr: Float32Array | number[] | null = null;

    if ((inputKind === "vector" && vecLen) || (inputKind === "sequence" && seqShape)) {
      const hand = results.multiHandLandmarks?.[0];
      const F = inputKind === "vector" ? vecLen! : seqShape!.F;
      if (!hand) { setScore(prev => prev * CFG.DECAY_NOT_CONFIDENT); setTopIdx(null); setTopProb(0); return; }

      const frameVec = landmarksToVector(hand as MPPoint[], F);

      if (inputKind === "vector") {
        probsArr = await tf.tidy(() => {
          const x = tf.tensor(frameVec, [1, vecLen!]);
          const out = model.predict(x) as tf.Tensor;
          // NO aplicar softmax - el modelo ya lo tiene en la capa de salida
          return out.dataSync();
        });
      } else {
        const { T, F } = seqShape!;
        const buf = seqBufferRef.current;
        buf.push(Array.from(frameVec));
        if (buf.length > T) buf.shift();
        const pad = Array.from({ length: Math.max(0, T - buf.length) }, () => new Array(F).fill(0));
        const win = pad.concat(buf);
        probsArr = await tf.tidy(() => {
          const x = tf.tensor(win, [1, T, F]);
          const out = model.predict(x) as tf.Tensor;
          // NO aplicar softmax - el modelo ya lo tiene en la capa de salida
          return out.dataSync();
        });
      }
    } else if (inputKind === "image" && imgShape) {
      const [H, W, C] = imgShape;
      const v = webcamRef.current?.video as HTMLVideoElement | undefined;
      if (!v || v.readyState !== 4) return;
      probsArr = await tf.tidy(() => {
        let img = tf.browser.fromPixels(v);
        img = tf.image.resizeBilinear(img, [H, W], true);
        if (C === 1) img = tf.mean(img, 2).expandDims(-1);
        img = CFG.MIRROR_X ? img.reverse(1) : img;
        img = img.toFloat().div(255);
        const x = img.expandDims(0);
        const out = model.predict(x) as tf.Tensor;
        // NO aplicar softmax - el modelo ya lo tiene en la capa de salida
        return out.dataSync();
      });
    }
    if (!probsArr) return;

    // top-1 (solo considerar clases válidas según el mapeo)
    const validIndices = classIndex ? new Set(Object.values(classIndex)) : null;
    let tIdx = 0, tProb = probsArr[0] ?? 0;

    for (let i = 1; i < probsArr.length; i++) {
      // Si hay mapeo, solo considerar índices válidos
      if (validIndices && !validIndices.has(i)) continue;
      if (probsArr[i] > tProb) { tProb = probsArr[i]; tIdx = i; }
    }

    setTopIdx(tIdx); setTopProb(tProb);

    // score:
    // - si hay mapeo para la letra, usa ese índice
    // - si no hay mapeo, usa confianza general (top-1 con umbral)
    const mappedIdx = classIndex?.[label];
    const labelProb =
      typeof mappedIdx === "number" ? (probsArr[mappedIdx] ?? 0)
      : (tProb >= CFG.MIN_CONFIDENCE ? tProb : 0);

    setScore(prev => {
      const ema = prev * CFG.SMOOTH_EMA + labelProb * (1 - CFG.SMOOTH_EMA);
      return (labelProb > 0) ? ema : ema * CFG.DECAY_NOT_CONFIDENT;
    });
  };

  function landmarksToVector(hand: MPPoint[], F: number): Float32Array {
    const expectZ = CFG.USE_Z_BY_F(F);

    let pts = hand.map(p => ({ x: p.x, y: p.y, z: p.z ?? 0 }));
    if (CFG.MIRROR_X) for (const p of pts) p.x = 1 - p.x;

    // origen en muñeca
    const wrist = pts[0];
    for (const p of pts) { p.x -= wrist.x; p.y -= wrist.y; p.z -= wrist.z; }

    // escala bbox
    let minX=+Infinity,minY=+Infinity,maxX=-Infinity,maxY=-Infinity;
    for (const p of pts) { if (p.x<minX) minX=p.x; if (p.x>maxX) maxX=p.x; if (p.y<minY) minY=p.y; if (p.y>maxY) maxY=p.y; }
    const scale = Math.max(1e-6, Math.hypot(maxX - minX, maxY - minY));
    for (const p of pts) { p.x/=scale; p.y/=scale; p.z/=scale; }

    if (CFG.ROT_ALIGN) {
      const a = pts[0], b = pts[9];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const cos = Math.cos(-ang), sin = Math.sin(-ang);
      for (const p of pts) { const x=p.x, y=p.y; p.x = x*cos - y*sin; p.y = x*sin + y*cos; }
    }

    const out: number[] = [];
    for (const p of pts) { out.push(p.x, p.y); if (expectZ) out.push(p.z); }

    if (out.length < F) while (out.length < F) out.push(0);
    else if (out.length > F) out.length = F;

    return new Float32Array(out);
  }

  /* ---------- UI ---------- */
  if (!open) return null;

  const dbgInput =
    inputKind === "vector" ? `input: vector · N: ${vecLen}` :
    inputKind === "sequence" && seqShape ? `input: seq · T×F: ${seqShape.T}×${seqShape.F}` :
    inputKind === "image" && imgShape ? `input: img · HWC: ${imgShape.join("×")}` :
    "input: (?)";

  const mappedIdx = classIndex?.[label];
  const hasMapping = typeof mappedIdx === "number";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Práctica — ${label}`}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", zIndex: 1000, padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ width: "min(1100px, 96vw)", background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,.25)", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ fontWeight: 800, color: "#0f172a" }}>Práctica — {label}</div>
          {mode === "heuristic" && heuristicResult && (
            <div style={{ marginLeft: "auto", fontSize: 13, color: "#475569" }}>
              Coincidencia: <strong>{heuristicResult.score}%</strong>
            </div>
          )}
          {mode === "tensorflow" && (
            <div style={{ marginLeft: "auto", fontSize: 13, color: "#475569" }}>
              Coincidencia: <strong>{Math.round(score * 100)}%</strong>
            </div>
          )}
          <button
            onClick={mode === "heuristic" ? closeHeuristic : onClose}
            style={{ marginLeft: mode === "tensorflow" ? 8 : "auto", border: "1px solid #e5e7eb", background: "#fff", color: "#0f172a", padding: "8px 10px", borderRadius: 10, cursor: "pointer", fontSize: 13 }}
          >
            Cerrar
          </button>
        </div>

        {/* Debug + Calibración (solo en modo TensorFlow) */}
        {mode === "tensorflow" && (
          <div style={{ padding: "8px 12px", background: "#f8fafc", borderBottom: "1px solid #e5e7eb", fontSize: 12, color: "#0f172a" }}>
            <b>Debug</b> · {dbgInput} · clases: {numClasses} · última: {lastActivation}
            {hasMapping ? <> · índice "{label}": {mappedIdx}</> : <> · índice "{label}": —</>}
            {topIdx != null && <> · top: #{topIdx} ({Math.round(topProb * 100)}%)</>}
            {hasMapping && topIdx != null && mappedIdx !== topIdx && (
              <span style={{ color: "#b45309" }}> · (top ≠ índice mapeado)</span>
            )}
            <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
              <button
                onClick={() => setCalMode(v => !v)}
                title="Activa modo calibración para capturar índices"
                style={{ border: "1px solid #e5e7eb", background: calMode ? "#fef3c7" : "#fff", padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}
              >
                Calibrar (C)
              </button>
              <button
                onClick={assignTopToCurrentLabel}
                disabled={!calMode || topIdx == null}
                title="Asigna el índice 'top' actual a la letra"
                style={{ border: "1px solid #e5e7eb", background: calMode ? "#eef2ff" : "#fff", padding: "6px 10px", borderRadius: 8, cursor: calMode && topIdx != null ? "pointer" : "not-allowed" }}
              >
                Asignar top → "{label}"
              </button>
              <button
                onClick={downloadJSON}
                title="Descarga class_index.json con el mapeo actual"
                style={{ border: "1px solid #e5e7eb", background: "#fff", padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}
              >
                Descargar JSON
              </button>
              {!hasMapping && (
                <span style={{ alignSelf: "center", color: "#b45309" }}>
                  (Sin mapeo para "{label}", usando confianza general)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 0, minHeight: 420 }}>
          {/* Video + Canvas */}
          <div style={{ position: "relative", background: "#000", minHeight: 420 }}>
            <Webcam
              ref={webcamRef}
              audio={false}
              mirrored
              muted
              onUserMedia={handleUserMedia}
              onUserMediaError={handleUserMediaError}
              videoConstraints={{ width: 1280, height: 720, facingMode: "user" }}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.18 }}
            />
            <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
            {!camReady && !camError && (
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#e2e8f0", fontSize: 14 }}>
                Solicitando acceso a la cámara…
              </div>
            )}
            {camError && (
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#b91c1c", background: "rgba(254,242,242,.8)", fontSize: 14, padding: 12, textAlign: "center" }}>
                {camError}
              </div>
            )}
          </div>

          {/* Panel derecho */}
          <div style={{ padding: 16 }}>
            {mode === "heuristic" ? (
              <>
                {/* === MODO HEURÍSTICO === */}
                {heuristicState === "countdown" && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 380 }}>
                    <div style={{ fontSize: 96, fontWeight: 800, color: "#0f172a", marginBottom: 24 }}>{countdown}</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: "#334155", marginBottom: 12 }}>
                      Prepárate...
                    </div>
                    <div style={{ fontSize: 14, color: "#64748b", textAlign: "center", maxWidth: 300 }}>
                      La captura iniciará cuando llegue a cero.
                    </div>
                  </div>
                )}

                {heuristicState === "capturing" && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 380 }}>
                    <div style={{ fontSize: 96, fontWeight: 800, color: "#16a34a", marginBottom: 24 }}>{countdown}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "#16a34a", marginBottom: 12 }}>
                      ¡Ahora!
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#334155", marginBottom: 12 }}>
                      Realiza la seña de <strong>{label}</strong>
                    </div>
                    <div style={{ marginTop: 24, padding: "8px 12px", background: "#dcfce7", borderRadius: 8, fontSize: 12, color: "#166534" }}>
                      Capturando: {capturedFramesRef.current.length} frames
                    </div>
                  </div>
                )}

                {heuristicState === "analyzing" && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 380 }}>
                    <div style={{ fontSize: 48, marginBottom: 24 }}>🔍</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: "#334155", marginBottom: 12 }}>
                      Analizando...
                    </div>
                    <div style={{ fontSize: 14, color: "#64748b", textAlign: "center" }}>
                      Comparando tu seña con las plantillas de referencia
                    </div>
                  </div>
                )}

                {heuristicState === "result" && heuristicResult && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 380 }}>
                    {heuristicResult.decision === "accepted" ? (
                      <>
                        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: "#16a34a", marginBottom: 8 }}>
                          ¡Aprobado!
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 64, marginBottom: 16 }}>❌</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>
                          Intenta nuevamente
                        </div>
                      </>
                    )}
                    <div style={{ fontSize: 48, fontWeight: 800, color: "#0f172a", marginTop: 12 }}>
                      {heuristicResult.score}%
                    </div>
                    <div style={{ fontSize: 14, color: "#64748b", marginBottom: 24 }}>
                      de coincidencia
                    </div>

                    {heuristicResult.score < 70 && (
                      <div style={{ marginTop: 16, padding: "12px 16px", background: "#fef3c7", borderRadius: 8, fontSize: 13, color: "#92400e", maxWidth: 320, textAlign: "center" }}>
                        <strong>Consejo:</strong> Asegúrate de formar la seña correctamente y mantenerla estable durante el conteo.
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
                      <button
                        onClick={retryHeuristic}
                        style={{ padding: "10px 20px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600 }}
                      >
                        Reintentar
                      </button>
                      <button
                        onClick={closeHeuristic}
                        style={{ padding: "10px 20px", background: "#e5e7eb", color: "#0f172a", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600 }}
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                )}

                {heuristicState === "idle" && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 380 }}>
                    <div style={{ fontSize: 48, marginBottom: 24 }}>⏳</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: "#334155", marginBottom: 12 }}>
                      Preparando...
                    </div>
                    <div style={{ fontSize: 14, color: "#64748b", textAlign: "center" }}>
                      Cargando plantillas de referencia
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* === MODO TENSORFLOW === */}
                <p style={{ marginTop: 4, color: "#334155" }}>
                  Coloca tu mano como la seña de <strong>{label}</strong>.
                  {hasMapping ? (
                    <> Este modo compara <em>solo</em> contra <b>{label}</b>.</>
                  ) : (
                    <> (Sin mapeo: se muestra confianza general del modelo.)</>
                  )}
                </p>

                <div style={{ marginTop: 12 }}>
                  <div style={{ height: 10, width: "100%", background: "#e2e8f0", borderRadius: 999, overflow: "hidden", border: "1px solid #e5e7eb" }}>
                    <div style={{ height: "100%", width: `${Math.round(score * 100)}%`, background: "#16a34a", transition: "width .15s linear" }} />
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13, color: "#475569" }}>
                    Precisión actual: <strong>{Math.round(score * 100)}%</strong>
                  </div>
                </div>

                <ul style={{ marginTop: 16, paddingLeft: 18, color: "#475569" }}>
                  <li>Usa buena iluminación y mantén la mano estable.</li>
                  <li>Evita recortar dedos fuera del encuadre.</li>
                  <li>Si el índice top no coincide con "{label}", usa <b>Asignar top → "{label}"</b>.</li>
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =================== Helpers =================== */
function landmarksToVector(hand: MPPoint[], F: number): Float32Array {
  const expectZ = CFG.USE_Z_BY_F(F);

  let pts = hand.map(p => ({ x: p.x, y: p.y, z: p.z ?? 0 }));
  if (CFG.MIRROR_X) for (const p of pts) p.x = 1 - p.x;

  const wrist = pts[0];
  for (const p of pts) { p.x -= wrist.x; p.y -= wrist.y; p.z -= wrist.z; }

  let minX=+Infinity,minY=+Infinity,maxX=-Infinity,maxY=-Infinity;
  for (const p of pts) { if (p.x<minX) minX=p.x; if (p.x>maxX) maxX=p.x; if (p.y<minY) minY=p.y; if (p.y>maxY) maxY=p.y; }
  const scale = Math.max(1e-6, Math.hypot(maxX - minX, maxY - minY));
  for (const p of pts) { p.x/=scale; p.y/=scale; p.z/=scale; }

  const out: number[] = [];
  for (const p of pts) { out.push(p.x, p.y); if (expectZ) out.push(p.z); }

  if (out.length < F) while (out.length < F) out.push(0);
  else if (out.length > F) out.length = F;

  return new Float32Array(out);
}
