// src/components/LessonMedia.tsx
import React, { useEffect, useState } from "react";
import { getAbecedarioUrls, AbcMediaItem } from "../lib/storage";

type Props = {
  moduleKey: string;
  lessonKey: "A_I" | "J_R" | "S_Z" | (string & {}); // por si viene en minúsculas
  title?: string;
  /** Callback para abrir el modal de práctica desde Leccion.tsx */
  onPractice?: (label: string) => void;
};

// Helper por si "kind" no viene (backward-compatible)
function isVideoItem(it: AbcMediaItem) {
  if (it.kind) return it.kind === "video";
  return /\.(mp4|webm|mov)(\?|$)/i.test(it.url);
}

export default function LessonMedia({
  moduleKey,
  lessonKey,
  title = "Material",
  onPractice,
}: Props) {
  const [items, setItems] = useState<AbcMediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        setLoading(true);
        if (moduleKey.toUpperCase() === "ABECEDARIO") {
          const seg = lessonKey.toUpperCase() as "A_I" | "J_R" | "S_Z";
          const data = await getAbecedarioUrls(seg);
          if (alive) setItems(data);
        } else {
          if (alive) setItems([]);
        }
      } catch (e) {
        console.error(e);
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [moduleKey, lessonKey]);

  return (
    <section style={{ marginTop: 16 }}>
      <h3 style={{ margin: "0 0 12px 0" }}>{title}</h3>

      {loading && <div style={{ color: "#64748b" }}>Cargando material…</div>}

      {!loading && items.length === 0 && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 16,
            color: "#64748b",
          }}
        >
          No hay material disponible aún.
        </div>
      )}

      {!loading && items.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))",
            gap: 16,
          }}
        >
          {items.map((it) => (
            <article
              key={(it as any).name ?? it.label}
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: "0 6px 16px rgba(0,0,0,.04)",
                display: "grid",
              }}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "4/3",
                  background: "#f1f5f9",
                  overflow: "hidden",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {isVideoItem(it) ? (
                  <video
                    src={it.url}
                    controls
                    preload="metadata"
                    playsInline
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <img
                    src={it.url}
                    alt={`Seña de la letra ${it.label}`}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    loading="lazy"
                  />
                )}
              </div>

              <div
                style={{
                  background: "#3b82f6",
                  color: "#fff",
                  padding: "10px 12px",
                  fontWeight: 700,
                }}
              >
                {it.label}
              </div>

              <div style={{ padding: 12, display: "grid", gap: 8 }}>
                {it.note && <p style={{ margin: 0, color: "#475569" }}>{it.note}</p>}

                <button
                  type="button"
                  style={{
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    color: "#0f172a",
                    padding: "8px 10px",
                    borderRadius: 10,
                    cursor: "pointer",
                    fontSize: 13,
                    justifySelf: "start",
                  }}
                  onClick={() => onPractice?.(it.label)}  // ← dispara el modal
                >
                  Practicar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
