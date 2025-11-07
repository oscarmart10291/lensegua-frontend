-- Migración para agregar current_letter_index a progreso_modulo
-- Este campo guarda el índice de la letra actual en el módulo de abecedario

ALTER TABLE progreso_modulo
ADD COLUMN current_letter_index INTEGER DEFAULT NULL;

COMMENT ON COLUMN progreso_modulo.current_letter_index IS 'Para abecedario: índice de la letra actual (0-25)';
