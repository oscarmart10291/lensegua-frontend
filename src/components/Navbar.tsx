import { Link, useNavigate } from "react-router-dom";
import s from "../pages/Inicio.module.css";
import { useAuth } from "../auth/AuthContext";

export default function Navbar() {
  const navigate = useNavigate();
  const { user, loading, login, logout } = useAuth();

  const handleLogin = async () => {
    await login();
    navigate("/modulos");
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <nav className={s.nav} aria-label="Barra de navegación principal">
      <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
        <div className={s.brand}>
          <div className={s.logo} aria-hidden>👋</div>
          <div className={s.brandText}>Manos que comunican</div>
        </div>
      </Link>

      <div className={s.actions}>
        {/* Siempre visible */}
        <Link to="/" className={s.link}>Inicio</Link>

        {/* Solo si HAY sesión */}
        {user && (
          <>
            <Link to="/modulos" className={s.link}>Módulos</Link>
            <Link to="/test/ABECEDARIO" className={s.link}>Tests</Link>
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
        )}

        {/* Solo si NO hay sesión */}
        {!user && (
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
    </nav>
  );
}
