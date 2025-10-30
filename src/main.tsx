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

import { ProgressProvider } from "./contexts/ProgressContext";
import { completeRedirectIfAny } from "./lib/firebase"; // ⬅️ Importa la función
import "./index.css";

// Ejecuta al inicio para completar redirecciones de Google Sign-In
completeRedirectIfAny();

const router = createBrowserRouter([
  // Rutas públicas
  { path: "/", element: <Inicio /> },

  // Rutas protegidas (requieren sesión)
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
      <ProgressProvider>
        <RouterProvider router={router} />
      </ProgressProvider>
    </AuthProvider>
  </React.StrictMode>
);
