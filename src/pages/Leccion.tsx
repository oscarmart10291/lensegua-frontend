// src/pages/Leccion.tsx
import { Link, useParams } from "react-router-dom";
import React, { useMemo, useState } from "react"; // 👈 añadí useState
import s from "./Inicio.module.css";
import { getLessonContent } from "../lib/lessonContent";
import { ProgressProvider, useProgress } from "../contexts/ProgressContext";
import LessonMedia from "../components/LessonMedia";
import PracticeModal from "../components/PracticeModal"; // 👈 import modal

/* ---------- Helpers UI ---------- */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 999,
        padding: "6px 10px",
        background: "#fff",
        color: "#64748b",
        fontSize: 13,
        display: "inline-block",
      }}
    >
      {children}
    </span>
  );
}

function Callout({
  body,
  kind = "info",
}: {
  body: string;
  kind?: "info" | "tip" | "warning";
}) {
  const palette: Record<string, string> = {
    info: "#e0f2fe",
    tip: "#dcfce7",
    warning: "#fef9c3",
  };
  return (
    <section style={{ marginTop: 16 }}>
      <div
        style={{
          background: palette[kind] || "#f1f5f9",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 12,
          color: "#0f172a",
        }}
      >
        {body}
      </div>
    </section>
  );
}

function TextBlock({ title, body }: { title?: string; body: string }) {
  return (
    <section id={title} style={{ marginTop: 16 }}>
      {title && <h3 style={{ margin: "0 0 10px 0" }}>{title}</h3>}
      <p style={{ color: "#475569", margin: 0, whiteSpace: "pre-line" }}>{body}</p>
    </section>
  );
}

/* ---------- Segmentos ---------- */
type Segment = { key: string; title: string; short: string };

function getSegments(moduleKey: string): Segment[] {
  const mk = moduleKey.toUpperCase();
  if (mk === "ABECEDARIO") {
    return [
      { key: "A_I", title: "Segmento 1 (A–I)", short: "A–I" },
      { key: "J_R", title: "Segmento 2 (J–R)", short: "J–R" },
      { key: "S_Z", title: "Segmento 3 (S–Z)", short: "S–Z" },
    ];
  }
  return [];
}

function SegmentNav({
  moduleKey,
  currentLessonKey,
}: {
  moduleKey: string;
  currentLessonKey: string;
}) {
  const { isDone } = useProgress();
  const segments = getSegments(moduleKey);
  if (!segments.length) return null;

  return (
    <div
      aria-label="Navegación de segmentos"
      style={{
        display: "flex",
        gap: 8,
        padding: 6,
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        width: "fit-content",
        boxShadow: "0 6px 16px rgba(0,0,0,.04)",
        margin: "6px 0 14px 0",
      }}
    >
      {segments.map((seg) => {
        const active = seg.key.toUpperCase() === currentLessonKey.toUpperCase();
        const completed = isDone(moduleKey, seg.key);
        return (
          <Link
            key={seg.key}
            to={`/modulos/${moduleKey}/leccion/${seg.key}`}
            aria-current={active ? "page" : undefined}
            style={{
              textDecoration: "none",
              padding: "8px 12px",
              borderRadius: 10,
              border: active ? "1px solid #c7d2fe" : "1px solid transparent",
              background: active ? "#eef2ff" : "#f8fafc",
              color: "#0f172a",
              fontWeight: active ? 700 : 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
            title={seg.title}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: completed
                  ? "#10b981"
                  : active
                  ? "#6366f1"
                  : "#94a3b8",
                boxShadow: completed ? "0 0 0 2px rgba(16,185,129,.2)" : undefined,
              }}
            />
            {seg.short}
            {completed && (
              <span style={{ fontSize: 12, color: "#10b981" }}>✓</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

function SegmentsCard({
  moduleKey,
  currentLessonKey,
}: {
  moduleKey: string;
  currentLessonKey: string;
}) {
  const { isDone } = useProgress();
  const segments = getSegments(moduleKey);
  if (!segments.length) return null;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Segmentos</div>
      <div style={{ display: "grid", gap: 8 }}>
        {segments.map((seg, idx) => {
          const active = seg.key.toUpperCase() === currentLessonKey.toUpperCase();
          const completed = isDone(moduleKey, seg.key);
          const bullet = completed ? "✓" : active ? "●" : "•";
          const bulletColor = completed ? "#10b981" : active ? "#111827" : "#94a3b8";
          return (
            <Link
              key={seg.key}
              to={`/modulos/${moduleKey}/leccion/${seg.key}`}
              style={{
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 10,
                border: active ? "1px solid #e5e7eb" : "1px solid transparent",
                background: active ? "#f8fafc" : "transparent",
                color: "#0f172a",
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 12,
                  borderRadius: 999,
                  color: bulletColor,
                  border: completed ? "1px solid #d1fae5" : "1px solid #e5e7eb",
                  background: completed ? "#ecfdf5" : "#fff",
                }}
              >
                {bullet}
              </span>
              <span style={{ fontWeight: active ? 700 : 500 }}>{seg.title}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b" }}>
                Paso {idx + 1}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Sidebar ---------- */
function Sidebar({
  moduleKey,
  lessonKey,
  moduleTitle,
  lessonTitle,
}: {
  moduleKey: string;
  lessonKey: string;
  moduleTitle: string;
  lessonTitle: string;
}) {
  const { isDone, toggle } = useProgress();
  const done = isDone(moduleKey, lessonKey);

  return (
    <aside
      style={{
        minWidth: 280,
        maxWidth: 280,
        position: "sticky",
        top: 16,
        alignSelf: "start",
        height: "fit-content",
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 700 }}>{lessonTitle}</div>
        <div style={{ marginTop: 8 }}>
          <Chip>{done ? "Completada" : "En progreso"}</Chip>
        </div>
        <button
          onClick={() => toggle(moduleKey, lessonKey)}
          style={{
            marginTop: 12,
            width: "100%",
            border: "1px solid #e5e7eb",
            background: done ? "#10b981" : "#fff",
            color: done ? "#fff" : "#0f172a",
            padding: "10px 12px",
            borderRadius: 10,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          {done ? "✓ Marcar como no completada" : "Marcar como completada"}
        </button>
      </div>

      <SegmentsCard moduleKey={moduleKey} currentLessonKey={lessonKey} />

      <div
        style={{
          marginTop: 12,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <Link to={`/modulos/${moduleKey}`} style={{ textDecoration: "none" }}>
          ← Volver a {moduleTitle}
        </Link>
      </div>
    </aside>
  );
}

/* ---------- Vista principal ---------- */
function LessonViewInner() {
  const { moduleKey = "", lessonKey = "" } = useParams<{
    moduleKey: string;
    lessonKey: string;
  }>();
  const mk = (moduleKey || "").toUpperCase();
  const lk = (lessonKey || "").toUpperCase();

  const content = useMemo(() => getLessonContent(mk, lk), [mk, lk]);

  // ▼▼▼ Estado de práctica (para abrir/cerrar la cámara con la letra seleccionada)
  const [practice, setPractice] = useState<{ open: boolean; label: string | null }>({
    open: false,
    label: null,
  });
  const handlePractice = (label: string) => setPractice({ open: true, label });
  const handleClosePractice = () => setPractice({ open: false, label: null });
  // ▲▲▲

  if (!content) {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ marginTop: 0 }}>Contenido no disponible</h2>
        <p style={{ color: "#475569" }}>
          Aún no hay material cargado para esta lección.
        </p>
        <Link to={`/modulos/${mk}`} style={{ textDecoration: "none" }}>
          ← Volver
        </Link>
      </div>
    );
  }

  return (
    <div className={s.wrapper}>
      <nav className={s.nav} aria-label="Barra de navegación principal">
        <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
          <div className={s.brand}>
            <div className={s.logo} aria-hidden>
              👋
            </div>
            <div className={s.brandText}>LENSEGUA Kids</div>
          </div>
        </Link>
        <div className={s.actions}>
          <Link to="/" className={s.link}>
            Inicio
          </Link>
          <Link to="/modulos" className={s.btnSmall}>
            Módulos
          </Link>
        </div>
      </nav>

      <div
        className={s.container}
        style={{ alignItems: "start", paddingTop: 16, paddingBottom: 24 }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 280px",
            gap: 20,
            width: "100%",
            maxWidth: 1120,
            margin: "0 auto",
          }}
        >
          <main>
            <div style={{ marginBottom: 8 }}>
              <Link to="/modulos" style={{ textDecoration: "none" }}>
                Módulos
              </Link>
              <span style={{ margin: "0 6px" }}>›</span>
              <Link to={`/modulos/${mk}`} style={{ textDecoration: "none" }}>
                {content.moduleTitle}
              </Link>
              <span style={{ margin: "0 6px" }}>›</span>
              <span style={{ color: "#0f172a", fontWeight: 700 }}>
                {content.lessonTitle}
              </span>
            </div>

            <SegmentNav moduleKey={mk} currentLessonKey={lk} />

            <h2 style={{ margin: "6px 0 8px 0", color: "#0f172a" }}>
              {content.lessonTitle}
            </h2>

            {/* Solo texto/callouts del contenido estático */}
            <div>
              {content.blocks.map((b, idx) => {
                if (b.type === "text")
                  return <TextBlock key={idx} title={b.title} body={b.body} />;
                if (b.type === "callout")
                  return <Callout key={idx} body={b.body} kind={b.kind} />;
                return null;
              })}
            </div>

            {/* Material dinámico desde Firebase Storage */}
            <LessonMedia
              moduleKey={mk}
              lessonKey={lk}
              title="Material"
              onPractice={handlePractice} // 👈 abre el modal con la letra
            />

            {/* Modal de práctica */}
            <PracticeModal
              label={practice.label ?? "A"}
              open={practice.open}
              onClose={handleClosePractice}
            />
          </main>

          <Sidebar
            moduleKey={mk}
            lessonKey={lk}
            moduleTitle={content.moduleTitle}
            lessonTitle={content.lessonTitle}
          />
        </div>
      </div>
    </div>
  );
}

export default function Leccion() {
  return (
    <ProgressProvider>
      <LessonViewInner />
    </ProgressProvider>
  );
}
