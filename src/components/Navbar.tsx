import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import s from "../pages/Inicio.module.css";
import { useAuth } from "../auth/AuthContext";

export default function Navbar() {
  const navigate = useNavigate();
  const { user, loading, login, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogin = async () => {
    await login();
    setIsOpen(false);
    navigate("/modulos");
  };

  const handleLogout = async () => {
    await logout();
    setIsOpen(false);
    navigate("/");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const closeAnd = (fn?: () => void) => () => {
    setIsOpen(false);
    fn?.();
  };

  return (
    <>
      <nav
        className={`${s.nav} ${isOpen ? s.isOpen : ""}`}
        aria-label="Barra de navegación principal"
      >
        {/* Contenedor interno centrado */}
        <div className={s.navInner}>
          {/* Marca */}
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            style={{ textDecoration: "none", color: "inherit" }}
            aria-label="Ir al inicio"
          >
            <div className={s.brand}>
              <div className={s.logo} aria-hidden>👋</div>
              <div className={s.brandText}>Manos que comunican</div>
            </div>
          </Link>

          {/* Acciones Desktop */}
          <div className={s.actions}>
            <Link to="/" className={s.link}>Inicio</Link>

            {user ? (
              <>
                <Link to="/modulos" className={s.link}>Módulos</Link>
                <Link to="/tests" className={s.link}>Tests</Link>
                <Link to="/perfil" className={s.link}>Perfil</Link>
                <button
                  onClick={handleLogout}
                  className={s.btnSmall}
                  style={{ marginLeft: 8 }}
                  disabled={loading}
                >
                  Salir
                </button>
              </>
            ) : (
              <button
                onClick={handleLogin}
                className={s.btnSmall}
                style={{ marginLeft: 8 }}
                disabled={loading}
                title="Entrar con Google"
              >
                {loading ? "Cargando..." : "Entrar"}
              </button>
            )}
          </div>

          {/* Botón Hamburguesa (solo mobile) */}
          <button
            className={s.menuBtn}
            aria-label={isOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={isOpen}
            aria-controls="mobile-menu"
            onClick={() => setIsOpen(v => !v)}
          >
            {isOpen ? <X size={22} strokeWidth={2.6}/> : <Menu size={22} strokeWidth={2.6}/>}
          </button>
        </div>

        {/* Panel móvil */}
        <div id="mobile-menu" className={s.sheet} role="dialog" aria-modal="true">
          <div className={s.sheetRow}>
            <Link to="/" className={s.link} onClick={closeAnd()}>
              Inicio
            </Link>

            {user ? (
              <>
                <Link to="/modulos" className={s.link} onClick={closeAnd()}>
                  Módulos
                </Link>
                <Link to="/tests" className={s.link} onClick={closeAnd()}>
                  Tests
                </Link>
                <Link to="/perfil" className={s.link} onClick={closeAnd()}>
                  Perfil
                </Link>
                <button
                  onClick={closeAnd(handleLogout)}
                  className={s.btnSmall}
                  disabled={loading}
                >
                  Salir
                </button>
              </>
            ) : (
              <button
                onClick={closeAnd(handleLogin)}
                className={s.btnSmall}
                disabled={loading}
                title="Entrar con Google"
              >
                {loading ? "Cargando..." : "Entrar"}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Fondo oscurecido (scrim) */}
      <div
        className={s.scrim}
        hidden={!isOpen}
        onClick={() => setIsOpen(false)}
        aria-hidden
      />
    </>
  );
}
