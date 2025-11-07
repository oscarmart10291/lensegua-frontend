# Sistema de Reconocimiento Heurístico LENSEGUA

Sistema avanzado de reconocimiento de señas basado en comparación heurística con plantillas de referencia, integrado en el proyecto "Manos que Comunican".

## 📁 Estructura de Archivos de Landmarks

### Ubicación de las plantillas JSON

Los archivos JSON con los landmarks de referencia deben colocarse en la carpeta `public/landmarks/` con la siguiente estructura:

```
public/landmarks/
├── A/
│   ├── 1.json
│   ├── 2.json
│   └── 3.json
├── B/
│   ├── 1.json
│   ├── 2.json
│   └── 3.json
├── RR/
│   ├── 1.json
│   ├── 2.json
│   └── 3.json
└── ... (resto de letras)
```

### Formato de los archivos JSON

#### Señas estáticas (ej: A, B, C, E, G, H, I, K, L, M, N, O, Q, T, U, V, W, X, Y, Z)

```json
[
  [
    [
      { "x": 0.123, "y": 0.456, "z": 0.789 },
      { "x": 0.234, "y": 0.567, "z": 0.890 },
      ...
      // 21 puntos en total
    ]
  ]
]
```

**Estructura**: 3 niveles de arrays, con 1 frame conteniendo 21 puntos.

#### Señas dinámicas (ej: D, F, J, P, RR, S)

**Opción 1** (con campo `frames`):
```json
{
  "frames": [
    [
      { "x": 0.123, "y": 0.456, "z": 0.789 },
      { "x": 0.234, "y": 0.567, "z": 0.890 },
      ...
      // 21 puntos
    ],
    [
      // Frame 2 (21 puntos)
    ],
    ...
    // N frames en total (ej: 75 frames para RR)
  ]
}
```

**Opción 2** (array directo):
```json
[
  [
    { "x": 0.123, "y": 0.456, "z": 0.789 },
    ...
    // 21 puntos
  ],
  [
    // Frame 2
  ],
  ...
]
```

### Coordenadas de landmarks

Cada punto debe tener las coordenadas normalizadas de MediaPipe Hands:
- **x**: 0.0 a 1.0 (horizontal)
- **y**: 0.0 a 1.0 (vertical)
- **z**: valor normalizado (profundidad)

Los 21 puntos siguen el orden estándar de MediaPipe:
```
0: WRIST
1-4: THUMB (CMC, MCP, IP, TIP)
5-8: INDEX (MCP, PIP, DIP, TIP)
9-12: MIDDLE (MCP, PIP, DIP, TIP)
13-16: RING (MCP, PIP, DIP, TIP)
17-20: PINKY (MCP, PIP, DIP, TIP)
```

## 🚀 Uso del Sistema

### En el componente PracticeModal

El componente `PracticeModal` ahora soporta dos modos:
- `"tensorflow"`: Usa el modelo TensorFlow.js existente (modo original)
- `"heuristic"`: Usa el sistema de reconocimiento heurístico (modo nuevo, por defecto)

```tsx
import PracticeModal from './components/PracticeModal';

function MyComponent() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <PracticeModal
      label="A"
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      mode="heuristic"  // Usa el sistema heurístico
    />
  );
}
```

### Flujo de usuario

1. **Abrir modal**: El usuario hace clic en "Practicar" para una letra
2. **Carga de plantillas**: El sistema carga automáticamente las plantillas de referencia
3. **Countdown**: Aparece un contador de 3...2...1
4. **Captura**: Durante el conteo, el sistema captura frames de la seña del usuario
5. **Análisis**: Al llegar a 0, se detiene la captura y se ejecuta el matching
6. **Resultado**: Se muestra el porcentaje de coincidencia y la decisión (Aprobado / Intenta nuevamente)
7. **Opciones**: El usuario puede Reintentar o Cerrar el modal

## ⚙️ Configuración y Ajuste

### Parámetros configurables

Los parámetros del sistema están en `/src/lib/heuristics/types.ts`:

```typescript
export const DEFAULT_CONFIG: MatchingConfig = {
  // Preprocesamiento
  enableRotation: false,        // Activar rotación canónica
  smoothingWindow: 3,           // Ventana de suavizado temporal

  // Señas estáticas
  staticWindowSize: 8,          // Número de frames a considerar
  staticAcceptThreshold: 5.0,   // Umbral de aceptación (4-6 recomendado)
  staticRejectThreshold: 20.0,  // Umbral de rechazo (18-25 recomendado)

  // Señas dinámicas
  dynamicResampleLength: 40,    // Longitud de resample
  dynamicAcceptThreshold: 10.0, // Umbral de aceptación DTW (8-12)
  dynamicRejectThreshold: 40.0, // Umbral de rechazo DTW (35-45)

  // Control de falsos positivos
  top2MarginThreshold: 0.15,    // Margen mínimo entre top-1 y top-2
  enableImpostorCheck: true,    // Activar comprobación de impostores
  strictnessFactor: 1.0,        // Factor de severidad (>1 = más estricto)

  // Captura
  minFramesRequired: 20,        // Mínimo de frames válidos
  countdownSeconds: 3,          // Duración del countdown
};
```

### Ajustar umbrales

Si el sistema es **demasiado estricto** (rechaza señas correctas):
- Aumentar `staticAcceptThreshold` (ej: 6.0)
- Aumentar `dynamicAcceptThreshold` (ej: 12.0)
- Reducir `strictnessFactor` (ej: 0.8)

Si el sistema **acepta señas incorrectas**:
- Reducir `staticAcceptThreshold` (ej: 4.0)
- Reducir `dynamicAcceptThreshold` (ej: 8.0)
- Aumentar `strictnessFactor` (ej: 1.2)
- Asegurar que `enableImpostorCheck` esté en `true`

## 🔍 Arquitectura del Sistema

### Módulos implementados

```
src/lib/heuristics/
├── types.ts              # Tipos y configuración
├── landmarkUtils.ts      # Normalización y preprocesamiento
├── comparison.ts         # Distancias L2 y DTW
├── matching.ts           # Motor de matching con control de falsos positivos
├── templateLoader.ts     # Carga y parseo de plantillas JSON
└── index.ts              # Exportación pública
```

### Preprocesamiento

Cada frame capturado se normaliza:
1. **Centrar en wrist** (índice 0)
2. **Escalar** por bounding box
3. **Rotación opcional** para alinear
4. **Suavizado temporal** (media móvil)

### Estrategia de comparación

**Estáticas**:
- Ventana de últimos 8 frames capturados
- Distancia L2 promedio contra plantilla
- Threshold: 5.0 (aceptar) / 20.0 (rechazar)

**Dinámicas**:
- Resample a 40 frames
- Dynamic Time Warping (DTW)
- Threshold: 10.0 (aceptar) / 40.0 (rechazar)

### Control de falsos positivos

1. **Umbral de rechazo**: Si distancia > threshold, rechazar automáticamente
2. **Top-2 margin**: Si diferencia entre mejores candidatos es pequeña, degradar score
3. **Impostor check**: Comparar contra plantillas de otras letras; si alguna está más cerca, rechazar

### Conversión distancia → porcentaje

El porcentaje mostrado es **ficticio pero coherente**:
- Distancia ≤ acceptThreshold → 85-98%
- Distancia ≥ rejectThreshold → 0-25%
- Intermedio → interpolación lineal 26-84%

Esto garantiza que:
- Señas correctas muestren valores altos
- Señas incorrectas muestren valores bajos
- La variación aleatoria ±2-4% añade realismo

## 📊 Clasificación de letras

```typescript
// Estáticas (mayoría)
A, B, C, E, G, H, I, K, L, M, N, O, Q, T, U, V, W, X, Y, Z

// Dinámicas (con movimiento)
D, F, J, P, RR, S
```

El sistema detecta automáticamente el tipo según la letra.

## 🐛 Solución de problemas

### "No se detectó la seña"

- Verificar que hay buena iluminación
- Asegurar que la mano completa está en el encuadre
- Verificar que se capturaron al menos 20 frames

### Porcentaje siempre bajo

- Revisar que los JSON de landmarks existen en `public/landmarks/`
- Verificar formato de los JSON (ver sección anterior)
- Ajustar umbrales de aceptación

### Señas incorrectas aceptadas

- Activar `enableImpostorCheck`
- Aumentar `strictnessFactor`
- Reducir umbrales de aceptación
- Agregar más plantillas por letra (3-5 recomendado)

## 🎯 Mejoras futuras

- **Precarga global**: Cargar todas las plantillas al iniciar la app (en App.tsx o contexto)
- **Cache**: Guardar plantillas en memoria para no recargarlas
- **Ajuste dinámico**: Sistema de auto-ajuste de umbrales basado en feedback
- **Visualización**: Mostrar landmarks de referencia superpuestos durante countdown
- **Analytics**: Registrar distancias y decisiones para análisis posterior

## 📝 Notas importantes

- Los archivos JSON deben estar en `public/` para ser accesibles vía `fetch()`
- El sistema requiere al menos 1 plantilla por letra para funcionar
- Se recomienda tener 3 plantillas por letra para mejor robustez
- El modo heurístico NO requiere el modelo TensorFlow.js
- Ambos modos (tensorflow y heuristic) pueden coexistir
