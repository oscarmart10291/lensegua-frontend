import "dotenv/config";
import express from "express";
import cors from "cors";
import { pool } from "./db";
import { requireAuth, AuthReq } from "./auth";

const app = express();

// Ajusta el origen si usas otro puerto para el front
app.use(cors({ origin: ["http://localhost:5173"], credentials: true }));
app.use(express.json());

// Helper para captar errores async sin romper Express
const wrap =
  (fn: any) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// Verifica conexión a BD
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/dbcheck", wrap(async (_req, res) => {
  const r = await pool.query(
    "select current_database() db, current_user usr, now() ts"
  );
  res.json(r.rows[0]);
}));

// Crea/actualiza usuario y devuelve su UUID interno
async function ensureUser(firebase_uid: string, email?: string, name?: string) {
  const r = await pool.query(
    `INSERT INTO users (firebase_uid, email, display_name)
     VALUES ($1,$2,$3)
     ON CONFLICT (firebase_uid) DO UPDATE
       SET email = EXCLUDED.email, display_name = EXCLUDED.display_name
     RETURNING id`,
    [firebase_uid, email || null, name || null]
  );
  return r.rows[0].id as string;
}

// === RUTAS PROTEGIDAS ===
app.get("/api/progress", requireAuth, wrap(async (req: AuthReq, res) => {
  const userId = await ensureUser(req.user!.uid, req.user!.email, req.user!.name);
  const r = await pool.query(
    `SELECT module_key, lesson_key, completed, updated_at
     FROM user_progress
     WHERE user_id = $1
     ORDER BY module_key, lesson_key`,
    [userId]
  );
  res.json(r.rows);
}));

app.put("/api/progress", requireAuth, wrap(async (req: AuthReq, res) => {
  const { moduleKey, lessonKey, completed } = req.body as {
    moduleKey?: string; lessonKey?: string; completed?: boolean;
  };

  if (!moduleKey || !lessonKey) {
    return res.status(400).json({ error: "missing_keys", got: req.body });
  }

  const userId = await ensureUser(req.user!.uid, req.user!.email, req.user!.name);

  await pool.query(
    `INSERT INTO user_progress (user_id, module_key, lesson_key, completed, updated_at)
     VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (user_id, module_key, lesson_key)
     DO UPDATE SET completed = EXCLUDED.completed, updated_at = now()`,
    [userId, moduleKey, lessonKey, !!completed]
  );

  res.json({ ok: true });
}));

app.delete("/api/progress/:moduleKey", requireAuth, wrap(async (req: AuthReq, res) => {
  const userId = await ensureUser(req.user!.uid, req.user!.email, req.user!.name);
  await pool.query(
    `DELETE FROM user_progress WHERE user_id=$1 AND module_key=$2`,
    [userId, req.params.moduleKey]
  );
  res.json({ ok: true });
}));

// Manejador global de errores: devuelve detalle en dev
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("API ERROR:", err);
  res.status(500).json({
    error: "server_error",
    message: err?.message,
    code: err?.code,
    detail: err?.detail,
  });
});

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log(`API listening at http://localhost:${PORT}`));
