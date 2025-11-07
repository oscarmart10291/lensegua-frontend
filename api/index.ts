import "dotenv/config";
import express from "express";
import cors from "cors";
import { requireAuth, AuthReq } from "./auth";
import { prisma, ensureUsuario, getModuloByKey } from "./prisma-client";
import { Decimal } from "@prisma/client/runtime/library";

const app = express();

// CORS - ajusta el origen si usas otro puerto para el front
app.use(cors({ origin: ["http://localhost:5173", "http://localhost:5174"], credentials: true }));
app.use(express.json());

// Helper para captar errores async sin romper Express
const wrap =
  (fn: any) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// ===========================
// RUTAS PÚBLICAS
// ===========================

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/dbcheck", wrap(async (_req, res) => {
  const result = await prisma.$queryRaw<any[]>`
    SELECT current_database() as db, current_user as usr, now() as ts
  `;
  res.json(result[0]);
}));

// ===========================
// RUTAS PROTEGIDAS
// ===========================

// Obtener estadísticas completas del usuario
app.get("/api/stats", requireAuth, wrap(async (req: AuthReq, res) => {
  const usuario = await ensureUsuario(req.user!.uid, req.user!.email, req.user!.name);

  // Obtener progreso de todos los módulos
  const progreso = await prisma.progresoModulo.findMany({
    where: { id_usuario: usuario.id_usuario },
    include: {
      modulo: true,
    },
  });

  // Calcular estadísticas
  const totalCoins = usuario.monedas;
  const modulosCompletos = progreso.filter(p => p.estado === 'completo').length;
  const medallas = {
    gold: progreso.filter(p => p.medalla === 'gold').length,
    silver: progreso.filter(p => p.medalla === 'silver').length,
    bronze: progreso.filter(p => p.medalla === 'bronze').length,
  };

  // Formatear progreso por módulo
  const modulesProgress = progreso.map(p => ({
    id: p.modulo.module_key,
    name: p.modulo.nombre,
    progress: Number(p.porcentaje_avance || 0),
    attempts: p.intentos,
    bestScore: Number(p.mejor_puntaje || 0),
    medal: p.medalla || 'none',
    coinsEarned: p.monedas_ganadas,
    currentLetterIndex: p.current_letter_index,
  }));

  res.json({
    totalCoins,
    completed: modulosCompletos,
    medals: medallas,
    modules: modulesProgress,
  });
}));

// Obtener progreso de un módulo específico
app.get("/api/progreso/:moduleKey", requireAuth, wrap(async (req: AuthReq, res) => {
  const usuario = await ensureUsuario(req.user!.uid, req.user!.email, req.user!.name);
  const modulo = await getModuloByKey(req.params.moduleKey);

  if (!modulo) {
    return res.status(404).json({ error: "module_not_found" });
  }

  const progreso = await prisma.progresoModulo.findUnique({
    where: {
      id_usuario_id_modulo: {
        id_usuario: usuario.id_usuario,
        id_modulo: modulo.id_modulo,
      },
    },
    include: {
      modulo: true,
    },
  });

  if (!progreso) {
    return res.json({
      id: modulo.module_key,
      name: modulo.nombre,
      progress: 0,
      attempts: 0,
      bestScore: 0,
      medal: 'none',
      coinsEarned: 0,
    });
  }

  res.json({
    id: modulo.module_key,
    name: modulo.nombre,
    progress: Number(progreso.porcentaje_avance || 0),
    attempts: progreso.intentos,
    bestScore: Number(progreso.mejor_puntaje || 0),
    medal: progreso.medalla || 'none',
    coinsEarned: progreso.monedas_ganadas,
    currentLetterIndex: progreso.current_letter_index,
  });
}));

// Registrar un intento de práctica
app.post("/api/intentos", requireAuth, wrap(async (req: AuthReq, res) => {
  const { moduleKey, senaId, precision, correcta, currentLetterIndex } = req.body as {
    moduleKey: string;
    senaId?: number;
    precision: number;
    correcta: boolean;
    currentLetterIndex?: number;
  };

  if (!moduleKey || precision === undefined || correcta === undefined) {
    return res.status(400).json({
      error: "missing_fields",
      required: ["moduleKey", "precision", "correcta"]
    });
  }

  const usuario = await ensureUsuario(req.user!.uid, req.user!.email, req.user!.name);
  const modulo = await getModuloByKey(moduleKey);

  if (!modulo) {
    return res.status(404).json({ error: "module_not_found" });
  }

  // Si se proporciona senaId, registrar el intento específico
  if (senaId) {
    await prisma.intentoPractica.create({
      data: {
        id_usuario: usuario.id_usuario,
        id_sena: senaId,
        id_modulo: modulo.id_modulo,
        precision: new Decimal(precision),
        correcta: correcta,
      },
    });
  }

  // Obtener o crear progreso del módulo
  let progreso = await prisma.progresoModulo.findUnique({
    where: {
      id_usuario_id_modulo: {
        id_usuario: usuario.id_usuario,
        id_modulo: modulo.id_modulo,
      },
    },
  });

  if (!progreso) {
    progreso = await prisma.progresoModulo.create({
      data: {
        id_usuario: usuario.id_usuario,
        id_modulo: modulo.id_modulo,
        estado: 'en_progreso',
        porcentaje_avance: new Decimal(0),
        intentos: 0,
        medalla: 'none',
        monedas_ganadas: 0,
      },
    });
  }

  // Incrementar intentos
  const nuevosIntentos = progreso.intentos + 1;

  // Si es correcto, sumar moneda
  let nuevasMonedas = usuario.monedas;
  let nuevasMonedasGanadas = progreso.monedas_ganadas;

  if (correcta) {
    nuevasMonedas += 1;
    nuevasMonedasGanadas += 1;

    // Actualizar monedas del usuario
    await prisma.usuario.update({
      where: { id_usuario: usuario.id_usuario },
      data: { monedas: nuevasMonedas },
    });
  }

  // Actualizar mejor puntaje
  const mejorPuntaje = progreso.mejor_puntaje
    ? Math.max(Number(progreso.mejor_puntaje), precision)
    : precision;

  // Calcular progreso (basado en intentos correctos)
  const totalIntentos = await prisma.intentoPractica.count({
    where: {
      id_usuario: usuario.id_usuario,
      id_modulo: modulo.id_modulo,
    },
  });

  const intentosCorrectos = await prisma.intentoPractica.count({
    where: {
      id_usuario: usuario.id_usuario,
      id_modulo: modulo.id_modulo,
      correcta: true,
    },
  });

  // Obtener total de señas del módulo
  const totalSenas = await prisma.sena.count({
    where: { id_modulo: modulo.id_modulo },
  });

  // Calcular porcentaje de avance (señas únicas correctas / total señas)
  const senasCorrectasUnicas = await prisma.intentoPractica.groupBy({
    by: ['id_sena'],
    where: {
      id_usuario: usuario.id_usuario,
      id_modulo: modulo.id_modulo,
      correcta: true,
    },
  });

  const porcentajeAvance = totalSenas > 0
    ? (senasCorrectasUnicas.length / totalSenas) * 100
    : 0;

  // Calcular promedio de precisión
  const intentosConPrecision = await prisma.intentoPractica.findMany({
    where: {
      id_usuario: usuario.id_usuario,
      id_modulo: modulo.id_modulo,
      precision: { not: null },
    },
    select: { precision: true },
  });

  const promedioPrecision = intentosConPrecision.length > 0
    ? intentosConPrecision.reduce((sum, i) => sum + Number(i.precision || 0), 0) / intentosConPrecision.length
    : 0;

  // Determinar medalla
  let medalla = 'none';
  if (porcentajeAvance >= 100) {
    if (promedioPrecision >= 90) medalla = 'gold';
    else if (promedioPrecision >= 75) medalla = 'silver';
    else if (promedioPrecision >= 60) medalla = 'bronze';
  }

  // Determinar estado
  const estado = porcentajeAvance >= 100 ? 'completo' : 'en_progreso';

  // Actualizar progreso
  await prisma.progresoModulo.update({
    where: {
      id_usuario_id_modulo: {
        id_usuario: usuario.id_usuario,
        id_modulo: modulo.id_modulo,
      },
    },
    data: {
      intentos: nuevosIntentos,
      mejor_puntaje: new Decimal(mejorPuntaje),
      monedas_ganadas: nuevasMonedasGanadas,
      porcentaje_avance: new Decimal(porcentajeAvance),
      promedio_precision: new Decimal(promedioPrecision),
      medalla: medalla,
      estado: estado,
      fecha_actualizacion: new Date(),
      ...(currentLetterIndex !== undefined && { current_letter_index: currentLetterIndex }),
    },
  });

  res.json({
    ok: true,
    progreso: {
      porcentaje: porcentajeAvance,
      intentos: nuevosIntentos,
      mejorPuntaje: mejorPuntaje,
      medalla: medalla,
      monedasGanadas: nuevasMonedasGanadas,
    },
    monedas: nuevasMonedas,
    coinEarned: correcta,
  });
}));

// Obtener señas de un módulo
app.get("/api/senas/:moduleKey", requireAuth, wrap(async (req: AuthReq, res) => {
  const modulo = await getModuloByKey(req.params.moduleKey);

  if (!modulo) {
    return res.status(404).json({ error: "module_not_found" });
  }

  const senas = await prisma.sena.findMany({
    where: { id_modulo: modulo.id_modulo },
    include: {
      recursos: true,
    },
    orderBy: { codigo: 'asc' },
  });

  res.json(senas);
}));

// Obtener módulos disponibles
app.get("/api/modulos", wrap(async (_req, res) => {
  const modulos = await prisma.modulo.findMany({
    orderBy: { orden: 'asc' },
  });

  res.json(modulos);
}));

// ===========================
// MANEJO DE ERRORES
// ===========================

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("API ERROR:", err);
  res.status(500).json({
    error: "server_error",
    message: err?.message,
    code: err?.code,
    detail: err?.detail,
  });
});

// ===========================
// INICIAR SERVIDOR
// ===========================

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`✅ API LENSEGUA escuchando en http://localhost:${PORT}`);
  console.log(`📊 Endpoints disponibles:`);
  console.log(`   GET  /api/health - Health check`);
  console.log(`   GET  /api/dbcheck - Database check`);
  console.log(`   GET  /api/stats - Estadísticas del usuario`);
  console.log(`   GET  /api/progreso/:moduleKey - Progreso de un módulo`);
  console.log(`   POST /api/intentos - Registrar intento de práctica`);
  console.log(`   GET  /api/senas/:moduleKey - Obtener señas de un módulo`);
  console.log(`   GET  /api/modulos - Obtener todos los módulos`);
});
