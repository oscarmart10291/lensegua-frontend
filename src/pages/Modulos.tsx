import React from "react";
import { Link, useParams } from "react-router-dom";
import s from "./Inicio.module.css";
import m from "./Modulos.module.css";
import { ProgressProvider, useProgress } from "../contexts/ProgressContext";
import Navbar from "../components/Navbar";

/* ===================== Tipos ===================== */
type Module = { key: string; title: string; subtitle: string; icon: string };
type Lesson = { key: string; title: string };

/* ================= Contenido base ================= */
const MODULES: Module[] = [
  { key: "ABECEDARIO",     title: "Abecedario",          subtitle: "Manual A–Z",               icon: "🔤" },
  { key: "NUMEROS",        title: "Números",             subtitle: "0–20 y decenas",           icon: "🔢" },
  { key: "FRASES_SALUDOS", title: "Frases/Saludos",      subtitle: "Saludos y frases comunes", icon: "💬" },
  { key: "COLORES",        title: "Colores",             subtitle: "Básicos y combinaciones",  icon: "🎨" },
  { key: "FAMILIA",        title: "Familia",             subtitle: "Parentescos principales",  icon: "👨‍👩‍👧" },
  { key: "EMOCIONES",      title: "Emociones",           subtitle: "Estados y sentimientos",   icon: "🙂" },
  { key: "PREGUNTAS",      title: "Preguntas",           subtitle: "Qué, dónde, cuándo…",      icon: "❓" },
  { key: "DIAS_SEMANA",    title: "Días de la semana",   subtitle: "Lunes–Domingo",            icon: "📅" },
  { key: "MESES",          title: "Meses",               subtitle: "Enero–Diciembre",          icon: "🗓️" },
  { key: "COMIDA",         title: "Comida",              subtitle: "Alimentos y bebidas",      icon: "🍽️" },
];

const LESSONS_BY_MODULE: Record<string, Lesson[]> = {
  ABECEDARIO: [
    { key: "A_I", title: "Segmento 1 (A–I)" },
    { key: "J_R", title: "Segmento 2 (J–R)" },
    { key: "S_Z", title: "Segmento 3 (S–Z)" },
  ],
  NUMEROS:        [{ key: "0_5", title: "Números 0–5" }, { key: "6_10", title: "Números 6–10" }, { key: "11_20", title: "Números 11–20" }],
  FRASES_SALUDOS: [{ key: "HOLA", title: "Hola" }, { key: "ADIOS", title: "Adiós" }, { key: "GRACIAS", title: "Gracias" }],
  COLORES:        [{ key: "ROJO", title: "Rojo" }, { key: "AZUL", title: "Azul" }, { key: "VERDE", title: "Verde" }],
  FAMILIA:        [{ key: "MADRE", title: "Madre" }, { key: "PADRE", title: "Padre" }, { key: "HERMANOS", title: "Hermano/Hermana" }],
  EMOCIONES:      [{ key: "FELIZ", title: "Feliz" }, { key: "TRISTE", title: "Triste" }, { key: "ENOJADO", title: "Enojado/a" }],
  PREGUNTAS:      [{ key: "QUE", title: "¿Qué?" }, { key: "DONDE", title: "¿Dónde?" }, { key: "CUANDO", title: "¿Cuándo?" }],
  DIAS_SEMANA:    [{ key: "LUNES", title: "Lunes" }, { key: "MARTES", title: "Martes" }, { key: "MIERCOLES", title: "Miércoles" }],
  MESES:          [{ key: "ENERO", title: "Enero" }, { key: "FEBRERO", title: "Febrero" }, { key: "MARZO", title: "Marzo" }],
  COMIDA:         [{ key: "FRUTAS", title: "Frutas" }, { key: "BEBIDAS", title: "Bebidas" }, { key: "PLATOS", title: "Platos comunes" }],
};

/* ====== Alterna bloqueo secuencial (ahora apagado) ====== */
const ENABLE_LOCKS = true;

/* Calcula qué módulos están desbloqueados en cadena:
   - El 1° siempre desbloqueado.
   - Se desbloquea el siguiente si el anterior está COMPLETO.
   - Si un módulo no tiene lecciones aún, cuenta como desbloqueado (puedes cambiar a false si prefieres bloquearlos). */
function useUnlocks() {
  const { isDone } = useProgress();
  const unlocked = new Set<string>();
  let canUnlockNext = true;

  for (const mod of MODULES) {
    if (canUnlockNext) {
      unlocked.add(mod.key);
      const lessons = LESSONS_BY_MODULE[mod.key] ?? [];
      const allDone = lessons.length === 0 || lessons.every((l) => isDone(mod.key, l.key));
      canUnlockNext = allDone; // solo avanzamos si el actual está completo
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

function LessonCard({ moduleKey, l }: { moduleKey: string; l: Lesson }) {
  const { isDone, toggle } = useProgress();
  const done = isDone(moduleKey, l.key);

  return (
    <li role="listitem" className={m.noBullet}>
      <Link
        to={`/modulos/${moduleKey}/leccion/${l.key}`}
        style={{ textDecoration: "none", color: "inherit" }}
        aria-label={`Abrir lección ${l.title}`}
      >
        <div className={m.lessonCard}>
          <div className={m.lessonRow}>
            <div>
              <strong className={m.lessonTitle}>{l.title}</strong>
              <p className={m.lessonHint}>Abrir lección</p>
            </div>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(moduleKey, l.key); }}
              title={done ? "Marcar como no completada" : "Marcar como completada"}
              className={`${m.lessonBtn} ${done ? m.lessonBtnDone : ""}`}
            >
              {done ? "✓ Completada" : "Marcar vista"}
            </button>
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
      <div
        className={s.container}
        style={{ alignItems: "start", overflowY: "auto", paddingTop: 16, paddingBottom: 24 }}
      >
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
              <p className={m.heroSubtitle}>Elige un módulo para comenzar. Tarjetas grandes, colores claros y fácil de leer.</p>
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
          <>
            <HeaderDetalle moduleInfo={moduleInfo} />
            <ul role="list" className={m.lessonList}>
              {lessons.map((l) => (<LessonCard key={l.key} l={l} moduleKey={moduleInfo.key} />))}
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
        )}
      </Shell>
    </ProgressProvider>
  );
}

/* ----------- Grid con bloqueo opcional ----------- */
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
