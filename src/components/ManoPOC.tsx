import { useEffect, useRef, useState } from "react";
import { FilesetResolver, HandLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";

export default function ManoPOC() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lm, setLm] = useState<HandLandmarker | null>(null);
  const [on, setOn] = useState(false);
  const [cargando, setCargando] = useState(true);

  // Carga del modelo
  useEffect(() => {
    (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const handLm = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          },
          numHands: 2,
          runningMode: "VIDEO",
        });
        setLm(handLm);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const iniciar = async () => {
    if (!videoRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
    });
    videoRef.current.srcObject = stream;
    await videoRef.current.play();
    setOn(true);
    requestAnimationFrame(loop);
  };

  const detener = () => {
    const stream = (videoRef.current?.srcObject as MediaStream | null);
    stream?.getTracks().forEach(t => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setOn(false);
  };

  const loop = () => {
    if (!on || !videoRef.current || !canvasRef.current || !lm) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Dibuja el frame
    ctx.save();
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Detecta manos y dibuja landmarks
    const ts = performance.now();
    const result = lm.detectForVideo(video, ts);

    const drawer = new DrawingUtils(ctx);
    result.landmarks.forEach((lms) => {
      drawer.drawLandmarks(lms, { radius: 3 });
      drawer.drawConnectors(lms, HandLandmarker.HAND_CONNECTIONS);
    });

    requestAnimationFrame(loop);
  };

  useEffect(() => () => detener(), []);

  return (
    <div style={{display:"grid",gap:12}}>
      <canvas
        ref={canvasRef}
        style={{borderRadius:12,border:"1px solid #e5e7eb",background:"#000"}}
      />
      <div style={{display:"flex",gap:12,alignItems:"center"}}>
        <button onClick={iniciar} disabled={!lm || cargando}>
          {cargando ? "Cargando modelo…" : "Iniciar detección"}
        </button>
        <button onClick={detener}>Detener</button>
      </div>
      <video ref={videoRef} style={{display:"none"}} />
    </div>
  );
}
