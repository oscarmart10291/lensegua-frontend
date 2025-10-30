// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
} from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import RequireAuth from "./auth/RequireAuth";

import Inicio from "./pages/Inicio";
import Modulos from "./pages/Modulos";
import Leccion from "./pages/Leccion";
import Test from "./pages/Test";
import Perfil from "./pages/Perfil";

import { ProgressProvider } from "./contexts/ProgressContext"; // ⬅️ NUEVO
import "./index.css";

const router = createBrowserRouter([
  // Pública
  { path: "/", element: <Inicio /> },

  // Protegidas (requieren sesión)
  {
    element: <RequireAuth />,
    children: [
      { path: "/modulos", element: <Modulos /> },
      { path: "/modulos/:moduleKey", element: <Modulos /> },
      { path: "/modulos/:moduleKey/leccion/:lessonKey", element: <Leccion /> },
      { path: "/test/:moduleKey", element: <Test /> },
      { path: "/perfil", element: <Perfil /> },
    ],
  },

  // Fallback
  { path: "*", element: <Navigate to="/" replace /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      {/* ⬇️ Contexto de progreso disponible en toda el área protegida */}
      <ProgressProvider>
        <RouterProvider router={router} />
      </ProgressProvider>
    </AuthProvider>
  </React.StrictMode>
);
