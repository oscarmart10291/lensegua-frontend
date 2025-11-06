# Configuración del Sistema Heurístico de Reconocimiento LENSEGUA

## 📋 Resumen del Sistema

El sistema heurístico reconoce señas de LENSEGUA comparando landmarks capturados con plantillas de referencia. Utiliza múltiples controles de calidad para evitar falsos positivos.

## 🎛️ Parámetros Ajustables

### 1. **Thresholds de Distancia** (`src/lib/heuristics/types.ts`)

```typescript
staticAcceptThreshold: 5.0      // Distancia para ACEPTAR señas estáticas
staticRejectThreshold: 20.0     // Distancia para RECHAZAR señas estáticas
dynamicAcceptThreshold: 10.0    // Distancia para ACEPTAR señas dinámicas (DTW)
dynamicRejectThreshold: 40.0    // Distancia para RECHAZAR señas dinámicas
```

**Cómo ajustar:**
- **Valores más bajos** = más estricto (rechaza más)
- **Valores más altos** = más permisivo (acepta más)

**Ejemplo:**
- Si la letra A acepta señas incorrectas → **bajar** `staticAcceptThreshold` de 5.0 a 4.0
- Si la letra A rechaza señas correctas → **subir** `staticAcceptThreshold` de 5.0 a 6.0

---

### 2. **Distintividad** (`src/lib/heuristics/matching.ts` línea ~139)

```typescript
const distinctivenessThreshold = 0.15;
```

**Qué hace:** Rechaza señas que matchean similar con TODAS las letras (no distintivas)

**Fórmula:** `distintividad = promedio_distancia_impostores - distancia_objetivo`

**Cómo ajustar:**
- **0.20** = Muy estricto (rechaza fácilmente señas ambiguas)
- **0.15** = Balanceado (recomendado) ✅
- **0.10** = Permisivo (acepta señas menos distintivas)
- **0.05** = Muy permisivo (casi no rechaza por distintividad)

**Ejemplo:**
- C acepta A incorrectamente → **subir** de 0.15 a 0.20
- C rechaza C correcta → **bajar** de 0.15 a 0.10

---

### 3. **Impostor Margin** (`src/lib/heuristics/matching.ts` línea ~116)

```typescript
const impostorMargin = 0.4;
```

**Qué hace:** Rechaza si una letra diferente está SIGNIFICATIVAMENTE más cerca que la objetivo

**Fórmula:** Si `distancia_impostor < (distancia_objetivo - 0.4)` → RECHAZAR

**Cómo ajustar:**
- **0.5** = Muy estricto (rechaza si impostores cercanos)
- **0.4** = Balanceado (recomendado) ✅
- **0.3** = Permisivo (acepta aunque impostores estén cerca)
- **0.2** = Muy permisivo (casi no rechaza por impostores)

**Ejemplo:**
- B acepta señas de A → **subir** de 0.4 a 0.5
- B rechaza B correcta porque C está cercana → **bajar** de 0.4 a 0.3

---

### 4. **Top-2 Margin** (`src/lib/heuristics/types.ts`)

```typescript
top2MarginThreshold: 0.01  // 1%
```

**Qué hace:** Detecta ambigüedad cuando las dos mejores plantillas tienen distancias muy similares

**Fórmula:** `margin = (segunda_mejor - mejor) / mejor`

**Cómo ajustar:**
- **0.05** (5%) = Muy estricto (marca ambiguo fácilmente)
- **0.01** (1%) = Balanceado (recomendado) ✅
- **0.005** (0.5%) = Muy permisivo (casi nunca marca ambiguo)

---

## 📊 Rangos de Score Esperados

| Decisión | Score | Cuándo ocurre |
|----------|-------|---------------|
| **accepted** | 85-98% | Seña correcta y distintiva |
| **ambiguous** | 26-50% | Plantillas de la misma letra muy similares |
| **rejected** | 0-25% | Seña incorrecta, no distintiva, o impostor cercano |

---

## 🔧 Casos de Uso Comunes

### Caso 1: Letra X acepta señas incorrectas

**Síntomas:** Haces Y pero te acepta como X con 90%+

**Soluciones en orden:**
1. **Bajar distintividad** de 0.15 a 0.20
2. **Subir impostor margin** de 0.4 a 0.5
3. **Bajar accept threshold** de 5.0 a 4.0

---

### Caso 2: Letra X rechaza señas correctas

**Síntomas:** Haces X correctamente pero te rechaza con score bajo

**Soluciones en orden:**
1. **Bajar distintividad** de 0.15 a 0.10
2. **Bajar impostor margin** de 0.4 a 0.3
3. **Subir accept threshold** de 5.0 a 6.0

---

### Caso 3: Letra X da "ambiguous" siempre

**Síntomas:** Siempre sale "Intenta nuevamente" con scores 26-50%

**Soluciones:**
1. **Bajar top2MarginThreshold** de 0.01 a 0.005
2. Ver si las plantillas de X son muy similares entre sí

---

## 🎯 Valores Actuales de Producción

```typescript
// Distancias
staticAcceptThreshold: 5.0
staticRejectThreshold: 20.0
dynamicAcceptThreshold: 10.0
dynamicRejectThreshold: 40.0

// Controles de calidad
distinctivenessThreshold: 0.15  // en matching.ts
impostorMargin: 0.4             // en matching.ts
top2MarginThreshold: 0.01       // en types.ts

// Captura
minFramesRequired: 20
countdownSeconds: 3       // Preparación antes de capturar
captureSeconds: 3         // Tiempo capturando (hardcoded en startCapture)
smoothingWindow: 3
staticWindowSize: 8
```

---

## ⏱️ Flujo de Captura (Actualizado)

El sistema ahora tiene **2 fases** para dar tiempo suficiente:

### Fase 1: Countdown (3 segundos)
- Muestra: **"3...2...1 Prepárate..."**
- Color: Negro
- **NO captura frames** - solo preparación
- Usuario se posiciona para hacer la seña

### Fase 2: Capturing (3 segundos)
- Muestra: **"3...2...1 ¡Ahora! Realiza la seña"**
- Color: Verde
- **SÍ captura frames** - grabando
- Usuario realiza la seña (estática o dinámica)

### Total: 6 segundos
- Beneficia señas dinámicas (D, F, J, P, RR, S) que requieren movimiento
- También mejora señas estáticas al dar tiempo de preparación

---

## 📝 Cómo Probar Cambios

1. **Editar el valor** en el archivo correspondiente
2. **Guardar** el archivo
3. **Recargar** el navegador (o esperar hot reload de Vite)
4. **Probar** la letra afectada
5. **Ajustar** iterativamente hasta encontrar el balance

---

## 🆘 Troubleshooting

### Todas las letras aceptan todo
→ Sistema demasiado permisivo. Bajar `staticAcceptThreshold` y subir `distinctivenessThreshold`

### Todas las letras rechazan todo
→ Sistema demasiado estricto. Subir `staticAcceptThreshold` y bajar `distinctivenessThreshold`

### Solo algunas letras tienen problemas
→ Verificar plantillas de esas letras en `public/landmarks/[LETRA]/`
→ Asegurarse de que no estén corruptas (no `[[null]]`)
→ Ajustar parámetros específicamente para esa letra (requiere lógica condicional)

---

## ✅ Estado Actual

- **Letra A:** ✅ Precisa
- **Letra B:** ✅ Rechaza incorrectas
- **Letra C:** ✅ Acepta correctas, rechaza incorrectas
- **Otras letras:** 🔄 Pendiente de testing

**Threshold de distintividad actual:** 0.15 (balanceado)

---

## 📚 Referencias

- Código principal: `src/lib/heuristics/matching.ts`
- Configuración: `src/lib/heuristics/types.ts`
- Documentación completa: `HEURISTIC_RECOGNITION.md`
