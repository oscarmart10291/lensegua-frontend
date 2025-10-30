import { useEffect, useRef, useState } from "react";

export default function Webcam() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activo, setActivo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iniciar = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setActivo(true);
      }
    } catch (e: any) {
      setError(e?.message ?? "No se pudo acceder a la cámara");
    }
  };

  const detener = () => {
    const vid = videoRef.current;
    const stream = vid?.srcObject as MediaStream | null;
    stream?.getTracks().forEach(t => t.stop());
    if (vid) vid.srcObject = null;
    setActivo(false);
  };

  useEffect(() => () => detener(), []);

  return (
    <div style={{display:"grid",gap:12}}>
      <video
        ref={videoRef}
        width={640}
        height={480}
        style={{borderRadius:12,border:"1px solid #e5e7eb",background:"#000"}}
      />
      <div style={{display:"flex",gap:12,alignItems:"center"}}>
        {!activo ? (
          <button onClick={iniciar}>Iniciar cámara</button>
        ) : (
          <button onClick={detener}>Detener</button>
        )}
        {error && <span style={{color:"crimson"}}>{error}</span>}
      </div>
    </div>
  );
}
