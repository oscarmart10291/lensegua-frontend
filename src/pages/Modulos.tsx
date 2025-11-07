// src/pages/Modulos.tsx
import React from "react";
import { Link, useParams } from "react-router-dom";
import s from "./Inicio.module.css";
import m from "./Modulos.module.css";
import { ProgressProvider, useProgress } from "../contexts/ProgressContext";
import Navbar from "../components/Navbar";

/* ===================== Tipos ===================== */
export type Module = { key: string; title: string; subtitle: string; icon: string };
type Lesson = { key: string; title: string };

/* ================= Contenido base (versión inicial) ================= */
export const MODULES: Module[] = [
  { key: "ABECEDARIO",     title: "Abecedario",          subtitle: "Manual A–Z",               icon: "🔤" },
  { key: "NUMEROS",        title: "Números",             subtitle: "0–20 y decenas",           icon: "🔢" },
  { key: "FRASES_SALUDOS", title: "Frases/Saludos",      subtitle: "Saludos y frases comunes", icon: "💬" },
  { key: "DIAS_SEMANA",    title: "Días de la semana",   subtitle: "Lunes–Domingo",            icon: "📅" },
  { key: "MESES",          title: "Meses",               subtitle: "Enero–Diciembre",          icon: "🗓️" },
];

const LESSONS_BY_MODULE: Record<string, Lesson[]> = {
  ABECEDARIO: [
    { key: "A_I", title: "Segmento 1 (A–I)" },
    { key: "J_R", title: "Segmento 2 (J–R)" },
    { key: "S_Z", title: "Segmento 3 (S–Z)" },
  ],
  NUMEROS: [
    { key: "1_5", title: "Números 1–5" },
    { key: "6_10", title: "Números 6–10" },
  ],
  FRASES_SALUDOS: [
    { key: "TODOS", title: "Saludos y Frases" },
  ],
  DIAS_SEMANA: [
    { key: "LUNES", title: "Lunes" },
    { key: "MARTES", title: "Martes" },
    { key: "MIERCOLES", title: "Miércoles" },
  ],
  MESES: [
    { key: "ENERO", title: "Enero" },
    { key: "FEBRERO", title: "Febrero" },
    { key: "MARZO", title: "Marzo" },
  ],
};

/* ====== Bloqueo secuencial opcional a nivel de módulos (lista) ====== */
const ENABLE_LOCKS = true;

/* Desbloqueo en cadena: el 1° abierto; el siguiente se abre cuando el anterior está completo. */
function useUnlocks() {
  const { isDone } = useProgress();
  const unlocked = new Set<string>();
  let canUnlockNext = true;

  for (const mod of MODULES) {
    if (canUnlockNext) {
      unlocked.add(mod.key);
      const lessons = LESSONS_BY_MODULE[mod.key] ?? [];
      const allDone = lessons.length === 0 || lessons.every((l) => isDone(mod.key, l.key));
      canUnlockNext = allDone;
    } else {
      break;
    }
  }
  return unlocked;
}

/* =================== Helpers UI =================== */
function Chip({ children }: { children: React.ReactNode }) {
  return <span className={m.chip}>{children}</span>;
}

/** Orden de lecciones por módulo (como aparecen en LESSONS_BY_MODULE) */
function getLessonOrder(moduleKey: string): string[] {
  return (LESSONS_BY_MODULE[moduleKey] ?? []).map((l) => l.key.toUpperCase());
}

/** ✅ Desbloqueo UNO POR UNO en la vista de detalle:
 *  la lección i se desbloquea solo si TODAS las anteriores [0..i-1] están completadas */
function isLessonUnlocked(moduleKey: string, lessonKey: string, isDone: (mk: string, lk: string) => boolean) {
  const order = getLessonOrder(moduleKey);
  const target = lessonKey.toUpperCase();
  const idx = order.indexOf(target);
  if (idx <= 0) return true; // la primera está libre
  for (let i = 0; i < idx; i++) {
    if (!isDone(moduleKey, order[i])) return false;
  }
  return true;
}

function useModuleStats(moduleKey: string) {
  const { isDone } = useProgress();
  const lessons = LESSONS_BY_MODULE[moduleKey] ?? [];
  const total = lessons.length;
  const done = lessons.reduce((acc, l) => acc + (isDone(moduleKey, l.key) ? 1 : 0), 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, pct };
}

function ModuleCard({ m: mod, locked }: { m: Module; locked: boolean }) {
  const { pct, total } = useModuleStats(mod.key);

  const handleLockedClick = (e: React.MouseEvent) => {
    if (locked) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <li role="listitem" className={m.noBullet}>
      <Link
        to={locked ? "#" : `/modulos/${mod.key}`}
        onClick={handleLockedClick}
        style={{ textDecoration: "none", color: "inherit" }}
        aria-label={`Abrir módulo ${mod.title}`}
        aria-disabled={locked}
      >
        <div className={`${m.moduleCard} ${locked ? m.lockedCard : ""}`}>
          <div className={m.moduleHead}>
            <div className={m.moduleIcon} aria-hidden>{mod.icon}</div>
            <div>
              <div className={m.moduleTitle}>{mod.title}</div>
              <div className={m.moduleSubtitle}>{mod.subtitle}</div>
            </div>
          </div>
          <div className={m.moduleMeta}>
            <Chip>Progreso: {pct}%</Chip>
            <Chip>Lecciones • {total}</Chip>
            {locked && <span className={m.lockedBadge}>🔒 Bloqueado</span>}
          </div>
        </div>
      </Link>
    </li>
  );
}

/** 🔒 Tarjeta de lección en DETALLE: sin botón de marcar aquí. */
function LessonCard({
  moduleKey,
  l,
  locked,
}: {
  moduleKey: string;
  l: Lesson;
  locked: boolean;
}) {
  const linkProps = locked
    ? { to: "#", onClick: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); } }
    : { to: `/modulos/${moduleKey}/leccion/${l.key}` };

  return (
    <li role="listitem" className={m.noBullet}>
      <Link
        {...(linkProps as any)}
        style={{ textDecoration: "none", color: "inherit" }}
        aria-label={`Abrir lección ${l.title}`}
        aria-disabled={locked}
        title={locked ? "Completa la anterior para desbloquear" : "Abrir lección"}
      >
        <div className={`${m.lessonCard} ${locked ? m.lockedCard : ""}`}>
          <div className={m.lessonRow}>
            <div>
              <strong className={m.lessonTitle}>{l.title}</strong>
              <p className={m.lessonHint}>{locked ? "Bloqueada" : "Abrir lección"}</p>
            </div>
            {locked ? (
              <span className={m.lockedBadge}>🔒</span>
            ) : (
              <span className={m.openBadge}>Abrir</span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

/* =============== Shell con navbar global =============== */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.wrapper}>
      <Navbar />
      <div className={s.container} style={{ alignItems: "start", overflowY: "auto", paddingTop: 16, paddingBottom: 24 }}>
        <div className={m.container}>{children}</div>
      </div>
    </div>
  );
}

/* ------- Cabecera del detalle -------- */
function HeaderDetalle({ moduleInfo }: { moduleInfo: Module }) {
  const { isDone, clearModule } = useProgress();
  const lessons = (LESSONS_BY_MODULE as any)[moduleInfo.key] ?? [];
  const total = lessons.length;
  const done = lessons.reduce((acc: number, l: Lesson) => acc + (isDone(moduleInfo.key, l.key) ? 1 : 0), 0);
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <>
      <div className={m.detailHeaderTop}>
        <h2 className={m.pageTitle}>Módulo: {moduleInfo.title}</h2>
        <p className={m.pageSubtitle}>{moduleInfo.subtitle}</p>
      </div>

      <div className={m.detailHeader}>
        <Chip>Progreso: {pct}% ({done}/{total})</Chip>
        <button
          onClick={() => clearModule(moduleInfo.key)}
          className={m.resetBtn}
          title="Borrar progreso de este módulo"
        >
          Reiniciar progreso
        </button>
      </div>
    </>
  );
}

/* ===================== Página ===================== */
export default function Modulos() {
  const { moduleKey } = useParams<{ moduleKey?: string }>();
  const normalizedKey = moduleKey?.toUpperCase();

  if (!normalizedKey) {
    // Vista A — lista de módulos
    return (
      <ProgressProvider>
        <Shell>
          <section className={m.hero}>
            <div className={m.heroText}>
              <h2 className={m.heroTitle}>Módulos</h2>
              <p className={m.heroSubtitle}>
                Elige un módulo para comenzar. Para esta versión inicial trabajamos con 5 módulos base.
              </p>
            </div>
          </section>

          <UnlockedGrid />
        </Shell>
      </ProgressProvider>
    );
  }

  // Vista B — detalle de módulo
  const moduleInfo = MODULES.find((mod) => mod.key === normalizedKey);
  const lessons = LESSONS_BY_MODULE[normalizedKey] ?? [];

  return (
    <ProgressProvider>
      <Shell>
        {!moduleInfo ? (
          <>
            <h2 className={m.pageTitle}>Módulo no encontrado</h2>
            <p className={m.pageSubtitle}>El módulo solicitado no existe o fue movido.</p>
            <div style={{ marginTop: 20 }}>
              <Link to="/modulos" style={{ textDecoration: "none" }}>← Volver a módulos</Link>
            </div>
          </>
        ) : (
          <Detail moduleInfo={moduleInfo} lessons={lessons} />
        )}
      </Shell>
    </ProgressProvider>
  );
}

function Detail({ moduleInfo, lessons }: { moduleInfo: Module; lessons: Lesson[] }) {
  const { isDone } = useProgress();

  return (
    <>
      <HeaderDetalle moduleInfo={moduleInfo} />

      <ul role="list" className={m.lessonList}>
        {lessons.map((l) => (
          <LessonCard
            key={l.key}
            l={l}
            moduleKey={moduleInfo.key}
            locked={!isLessonUnlocked(moduleInfo.key, l.key, isDone)}
          />
        ))}

        {lessons.length === 0 && (
          <li role="listitem" className={m.noBullet}>
            <div className={m.lessonCard}>
              <p className={m.lessonHint} style={{ margin: 0 }}>
                Este módulo aún no tiene lecciones de ejemplo.
              </p>
            </div>
          </li>
        )}
      </ul>
    </>
  );
}

/* ----------- Grid con bloqueo opcional (lista de módulos) ----------- */
function UnlockedGrid() {
  const unlocked = ENABLE_LOCKS ? useUnlocks() : null;

  return (
    <ul role="list" className={m.moduleGrid}>
      {MODULES.map((mod) => (
        <ModuleCard
          key={mod.key}
          m={mod}
          locked={!!(ENABLE_LOCKS && unlocked && !unlocked.has(mod.key))}
        />
      ))}
    </ul>
  );
}
