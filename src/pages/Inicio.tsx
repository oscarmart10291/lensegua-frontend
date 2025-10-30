import React from "react";
import { Link, useNavigate } from "react-router-dom";
import s from "./Inicio.module.css";
import { useAuth } from "../auth/AuthContext";
import Navbar from "../components/Navbar";

export default function Inicio() {
  const navigate = useNavigate();
  const { user, loading, login } = useAuth();

  const handleEmpezar = async () => {
    if (!user) await login();
    navigate("/modulos");
  };

  return (
    <div className={s.wrapper}>
      <Navbar />

      <main className={s.container}>
        <section className={s.hero}>
          {/* Columna izquierda */}
          <div className={s.left}>
            <span className={s.kicker}>Aprende sin prisa, a tu ritmo</span>

            <h1 className={s.title}>
              Aprende <span className={s.accent}>lengua de señas guatemalteca</span> con claridad y confianza
            </h1>

            <p className={s.subtitle}>
              Lecciones guiadas, ejemplos visuales y práctica sencilla. Diseñado para ser
              cómodo para todas las edades.
            </p>

            <div className={s.ctaRow}>
              <button onClick={handleEmpezar} className={`${s.btn} ${s.btnPrimary}`} disabled={loading}>
                {user ? "Continuar" : "Empezar ahora"}
              </button>
              {user ? (
                <Link to="/modulos" className={`${s.btn} ${s.btnGhost}`}>Ver módulos</Link>
              ) : (
                <Link to="/" className={`${s.btn} ${s.btnGhost}`}>Más tarde</Link>
              )}
            </div>

            <ul className={s.highlights} aria-label="Características">
              <li>Interfaz grande y legible</li>
              <li>Contenido por segmentos</li>
              <li>Práctica con cámara (próximamente)</li>
            </ul>
          </div>

          {/* Columna derecha */}
          <div className={s.right}>
            <div className={s.preview} role="region" aria-label="Demostración de cámara">
              <div className={s.previewHeader}>Demostración de cámara</div>
              <div className={s.previewBody}>
                <svg className={s.svg} viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#60a5fa" />
                      <stop offset="1" stopColor="#34d399" />
                    </linearGradient>
                  </defs>
                  <g stroke="url(#grad)" strokeWidth="4" strokeLinecap="round" opacity="0.9">
                    <path d="M280 320 L300 250 L320 190 L340 150" />
                    <path d="M300 250 L270 210 L245 185" />
                    <path d="M300 250 L330 210 L360 190" />
                    <path d="M320 190 L302 152 L285 125" />
                    <path d="M320 190 L342 135 L360 115" />
                  </g>
                  <g fill="url(#grad)">
                    {[{x:280,y:320},{x:300,y:250},{x:320,y:190},{x:340,y:150},
                      {x:270,y:210},{x:245,y:185},{x:330,y:210},{x:360,y:190},
                      {x:302,y:152},{x:285,y:125},{x:342,y:135},{x:360,y:115}]
                      .map((p,i)=>(<circle key={i} cx={p.x} cy={p.y} r="7" />))}
                  </g>
                </svg>
                <p className={s.hint}>
                  <span className={s.dot} /> Mueve tu mano frente a la cámara para practicar
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
