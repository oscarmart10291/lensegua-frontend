-- ===========================
-- LENSEGUA - Schema SQL
-- Base de datos: PostgreSQL
-- ===========================

-- Crear tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario         SERIAL PRIMARY KEY,
  nombre             VARCHAR(100) NOT NULL,
  correo             VARCHAR(100),
  google_id          VARCHAR(100),
  firebase_uid       VARCHAR(128) UNIQUE,
  fecha_registro     DATE DEFAULT CURRENT_DATE,
  monedas            INTEGER DEFAULT 0
);

-- Crear tabla de módulos
CREATE TABLE IF NOT EXISTS modulos (
  id_modulo          SERIAL PRIMARY KEY,
  nombre             VARCHAR(100) NOT NULL,
  descripcion        VARCHAR(100),
  nivel              INTEGER,
  orden              INTEGER,
  module_key         VARCHAR(50) UNIQUE
);

-- Crear tabla de señas
CREATE TABLE IF NOT EXISTS senas (
  id_sena            SERIAL PRIMARY KEY,
  id_modulo          INTEGER NOT NULL REFERENCES modulos(id_modulo) ON DELETE CASCADE,
  codigo             INTEGER,
  nombre             VARCHAR(100),
  precision_esperada NUMERIC(5,2)
);

CREATE INDEX IF NOT EXISTS idx_senas_modulo ON senas(id_modulo);

-- Crear tabla de recursos multimedia
CREATE TABLE IF NOT EXISTS recursos_multimedia (
  id_recurso         SERIAL PRIMARY KEY,
  id_sena            INTEGER NOT NULL REFERENCES senas(id_sena) ON DELETE CASCADE,
  tipo               VARCHAR(100),
  url                VARCHAR(255),
  formato            VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_recursos_sena ON recursos_multimedia(id_sena);

-- Crear tabla de intentos de práctica
CREATE TABLE IF NOT EXISTS intentos_practica (
  id_intento         SERIAL PRIMARY KEY,
  id_usuario         INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  id_sena            INTEGER NOT NULL REFERENCES senas(id_sena) ON DELETE CASCADE,
  id_modulo          INTEGER NOT NULL REFERENCES modulos(id_modulo) ON DELETE CASCADE,
  precision          NUMERIC(5,2),
  fecha_hora         TIMESTAMP DEFAULT NOW(),
  correcta           BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_intentos_usuario ON intentos_practica(id_usuario);
CREATE INDEX IF NOT EXISTS idx_intentos_sena ON intentos_practica(id_sena);
CREATE INDEX IF NOT EXISTS idx_intentos_modulo ON intentos_practica(id_modulo);

-- Crear tabla de evaluaciones
CREATE TABLE IF NOT EXISTS evaluaciones (
  id_evaluacion      SERIAL PRIMARY KEY,
  id_usuario         INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  id_modulo          INTEGER NOT NULL REFERENCES modulos(id_modulo) ON DELETE CASCADE,
  fecha_inicio       DATE,
  fecha_fin          DATE,
  puntaje            NUMERIC(6,2)
);

CREATE INDEX IF NOT EXISTS idx_eval_usuario ON evaluaciones(id_usuario);
CREATE INDEX IF NOT EXISTS idx_eval_modulo ON evaluaciones(id_modulo);

-- Crear tabla de resultados de evaluación
CREATE TABLE IF NOT EXISTS resultados_evaluacion (
  id_resultado       SERIAL PRIMARY KEY,
  id_evaluacion      INTEGER NOT NULL REFERENCES evaluaciones(id_evaluacion) ON DELETE CASCADE,
  id_sena            INTEGER NOT NULL REFERENCES senas(id_sena) ON DELETE RESTRICT,
  precision          NUMERIC(5,2),
  correcta           BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_res_eval_evaluacion ON resultados_evaluacion(id_evaluacion);
CREATE INDEX IF NOT EXISTS idx_res_eval_sena ON resultados_evaluacion(id_sena);

-- Crear tabla de progreso por módulo
CREATE TABLE IF NOT EXISTS progreso_modulo (
  id_usuario          INTEGER NOT NULL,
  id_modulo           INTEGER NOT NULL,
  estado              VARCHAR(20),
  porcentaje_avance   NUMERIC(5,2),
  promedio_precision  NUMERIC(5,2),
  fecha_actualizacion DATE DEFAULT CURRENT_DATE,
  intentos            INTEGER DEFAULT 0,
  mejor_puntaje       NUMERIC(5,2),
  medalla             VARCHAR(10),
  monedas_ganadas     INTEGER DEFAULT 0,
  CONSTRAINT pk_progreso_modulo PRIMARY KEY (id_usuario, id_modulo),
  CONSTRAINT fk_prog_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_prog_modulo FOREIGN KEY (id_modulo) REFERENCES modulos(id_modulo) ON DELETE CASCADE
);

-- Agregar constraints de validación
ALTER TABLE progreso_modulo
  DROP CONSTRAINT IF EXISTS chk_prog_avance_pct;

ALTER TABLE progreso_modulo
  ADD CONSTRAINT chk_prog_avance_pct
  CHECK (porcentaje_avance IS NULL OR (porcentaje_avance >= 0 AND porcentaje_avance <= 100));

ALTER TABLE intentos_practica
  DROP CONSTRAINT IF EXISTS chk_intento_precision;

ALTER TABLE intentos_practica
  ADD CONSTRAINT chk_intento_precision
  CHECK (precision IS NULL OR (precision >= 0 AND precision <= 100));

ALTER TABLE resultados_evaluacion
  DROP CONSTRAINT IF EXISTS chk_res_eval_precision;

ALTER TABLE resultados_evaluacion
  ADD CONSTRAINT chk_res_eval_precision
  CHECK (precision IS NULL OR (precision >= 0 AND precision <= 100));

-- ===========================
-- Insertar datos iniciales
-- ===========================

-- Insertar módulos (basado en la estructura del frontend)
INSERT INTO modulos (nombre, descripcion, nivel, orden, module_key) VALUES
  ('Abecedario', 'Aprende el abecedario en lengua de señas', 1, 1, 'abecedario'),
  ('Números', 'Aprende los números en lengua de señas', 1, 2, 'numeros'),
  ('Colores', 'Aprende los colores en lengua de señas', 1, 3, 'colores'),
  ('Familia', 'Aprende palabras relacionadas con la familia', 2, 4, 'familia'),
  ('Saludos', 'Aprende saludos y despedidas', 1, 5, 'saludos')
ON CONFLICT (module_key) DO NOTHING;

-- Insertar señas para el módulo de Abecedario (A-Z)
DO $$
DECLARE
  v_modulo_id INTEGER;
  v_letra CHAR;
  v_codigo INTEGER;
BEGIN
  -- Obtener el ID del módulo de Abecedario
  SELECT id_modulo INTO v_modulo_id FROM modulos WHERE module_key = 'abecedario';

  -- Insertar letras A-Z
  FOR v_codigo IN 65..90 LOOP
    v_letra := CHR(v_codigo);
    INSERT INTO senas (id_modulo, codigo, nombre, precision_esperada)
    VALUES (v_modulo_id, v_codigo, v_letra, 80.00)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Insertar señas para el módulo de Números (0-10)
DO $$
DECLARE
  v_modulo_id INTEGER;
  v_numero INTEGER;
BEGIN
  -- Obtener el ID del módulo de Números
  SELECT id_modulo INTO v_modulo_id FROM modulos WHERE module_key = 'numeros';

  IF v_modulo_id IS NOT NULL THEN
    -- Insertar números 0-10
    FOR v_numero IN 0..10 LOOP
      INSERT INTO senas (id_modulo, codigo, nombre, precision_esperada)
      VALUES (v_modulo_id, v_numero, v_numero::VARCHAR, 80.00)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END $$;

-- Insertar algunas señas de ejemplo para el módulo de Colores
DO $$
DECLARE
  v_modulo_id INTEGER;
BEGIN
  SELECT id_modulo INTO v_modulo_id FROM modulos WHERE module_key = 'colores';

  IF v_modulo_id IS NOT NULL THEN
    INSERT INTO senas (id_modulo, codigo, nombre, precision_esperada) VALUES
      (v_modulo_id, 1, 'Rojo', 80.00),
      (v_modulo_id, 2, 'Azul', 80.00),
      (v_modulo_id, 3, 'Verde', 80.00),
      (v_modulo_id, 4, 'Amarillo', 80.00),
      (v_modulo_id, 5, 'Negro', 80.00),
      (v_modulo_id, 6, 'Blanco', 80.00)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Mensaje de confirmación
DO $$
BEGIN
  RAISE NOTICE 'Schema inicializado correctamente';
  RAISE NOTICE 'Módulos creados: %', (SELECT COUNT(*) FROM modulos);
  RAISE NOTICE 'Señas creadas: %', (SELECT COUNT(*) FROM senas);
END $$;
