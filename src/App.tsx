import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import RequireAuth from "./auth/RequireAuth";

// Páginas
import Inicio from "./pages/Inicio";
import Modulos from "./pages/Modulos";
import Leccion from "./pages/Leccion";
import Test from "./pages/Test";
import Perfil from "./pages/Perfil";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Pública */}
        <Route path="/" element={<Inicio />} />

        {/* Protegidas (requieren sesión) */}
        <Route element={<RequireAuth />}>
          {/* Lista de módulos */}
          <Route path="/modulos" element={<Modulos />} />
          {/* Detalle de un módulo */}
          <Route path="/modulos/:moduleKey" element={<Modulos />} />
          {/* Contenido educativo de una lección */}
          <Route path="/modulos/:moduleKey/leccion/:lessonKey" element={<Leccion />} />

          <Route path="/test/:moduleKey" element={<Test />} />
          <Route path="/perfil" element={<Perfil />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
