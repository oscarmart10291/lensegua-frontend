import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

/**
 * Protección de rutas:
 * - Mientras carga el estado de auth, muestra un loader para NO redirigir antes de tiempo.
 * - Si NO hay usuario, redirige a "/" (Inicio) y guarda de dónde venía.
 * - Si hay usuario, renderiza los hijos (Outlet).
 */
export default function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  // ⏳ No redirigir mientras el estado de sesión se está resolviendo
  if (loading) {
    return (
      <div style={{
        minHeight: "55vh",
        display: "grid",
        placeItems: "center",
        color: "#334155",
        fontWeight: 800
      }}>
        Cargando…
      </div>
    );
  }

  // ❌ Sin usuario => vuelve a Inicio (guardando from)
  if (!user) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  // ✅ Con usuario => renderiza rutas protegidas
  return <Outlet />;
}
