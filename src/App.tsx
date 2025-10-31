import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import RequireAuth from "./auth/RequireAuth";

// Páginas
import Inicio from "./pages/Inicio";
import Modulos from "./pages/Modulos";
import Leccion from "./pages/Leccion";
// import Test from "./pages/Test";  // ❌ ya no existe
import Perfil from "./pages/Perfil";
import Tests from "./pages/tests";       // ✅ vista general (progreso/medallas)

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Pública */}
        <Route path="/" element={<Inicio />} />

        {/* Protegidas (requieren sesión) */}
        <Route element={<RequireAuth />}>
          <Route path="/modulos" element={<Modulos />} />
          <Route path="/modulos/:moduleKey" element={<Modulos />} />
          <Route path="/modulos/:moduleKey/leccion/:lessonKey" element={<Leccion />} />

          {/* ✅ Vista general de resultados/progreso */}
          <Route path="/tests" element={<Tests />} />

          {/* 🔁 Redirecciones de rutas antiguas */}
          <Route path="/test" element={<Navigate to="/tests" replace />} />
          <Route path="/test/:moduleKey" element={<Navigate to="/tests" replace />} />

          <Route path="/perfil" element={<Perfil />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}