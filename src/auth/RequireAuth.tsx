import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

/**
 * Protección de rutas:
 * - Mientras carga el estado de auth, no renderiza nada (puedes poner un spinner).
 * - Si NO hay usuario, redirige a "/" (Inicio) y guarda de dónde venía.
 * - Si hay usuario, renderiza los hijos (Outlet).
 */
export default function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return null; // o un spinner minimal
    // return <div style={{padding:16}}>Cargando…</div>;
  }

  if (!user) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
