// src/pages/tests.tsx
import React, { useMemo } from "react";
import Navbar from "../components/Navbar";
import s from "./tests.module.css";
import { Coins, Trophy, Medal, Star, ChevronRight } from "lucide-react";

// 👇 Importa la lista de módulos existente
// En Modulos.tsx agrega: export const MODULES = [...];
// Ajusta la ruta si la mueves a /constants
import { MODULES } from "../constants/modules";


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

  // Stats en cero (también podrías calcular desde "modules")
  const stats = useMemo(
    () => ({
      totalCoins: 0,
      completed: 0,
      medals: { gold: 0, silver: 0, bronze: 0 },
    }),
    []
  );

  const onAction = (m: ModuleProgress) => {
    // Aquí luego puedes navegar: navigate(`/test/${m.id}`)
    alert(`Abrir test de: ${m.name}`);
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
          {modules.map((m) => (
            <article key={m.id} className={s.card}>
              <div className={s.cardHeader}>
                <div className={s.iconWrap}><Star aria-hidden /></div>

                <div className={s.cardHeadings}>
                  <h3 className={s.cardTitle}>{m.name}</h3>
                  <p className={s.cardSubtitle}>{m.subtitle}</p>
                </div>

                <div className={s.rewardArea}>
                  <span className={s.badgeMuted}>Sin medalla</span>
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
                  title="Abrir test"
                >
                  Continuar
                  <ChevronRight size={18} />
                </button>
              </div>
            </article>
          ))}
        </section>
      </main>
    </>
  );
}
