# Plantillas de Landmarks LENSEGUA

Esta carpeta contiene las plantillas de referencia para el reconocimiento de señas.

## Estructura

Cada letra tiene su propia carpeta con múltiples archivos JSON (1.json, 2.json, 3.json, etc.).

## Formato de archivos

### Señas estáticas (A, B, C, E, G, H, I, K, L, M, N, O, Q, T, U, V, W, X, Y, Z)

Los archivos JSON deben tener el siguiente formato:

```json
[[[
  {"x": 0.5, "y": 0.5, "z": 0.0},
  {"x": 0.45, "y": 0.48, "z": -0.02},
  ...
  // 21 puntos en total
]]]
```

### Señas dinámicas (D, F, J, P, RR, S)

Los archivos JSON deben tener múltiples frames:

```json
[
  [
    {"x": 0.5, "y": 0.5, "z": 0.0},
    {"x": 0.45, "y": 0.48, "z": -0.02},
    ...
    // 21 puntos
  ],
  [
    // Frame 2 con 21 puntos
  ],
  ...
  // N frames
]
```

O con el campo `frames`:

```json
{
  "frames": [
    [
      {"x": 0.5, "y": 0.5, "z": 0.0},
      ...
    ],
    ...
  ]
}
```

## Instrucciones

1. Coloque sus archivos JSON de landmarks en la carpeta correspondiente a cada letra
2. Nombre los archivos como 1.json, 2.json, 3.json, etc.
3. Se recomienda tener al menos 3 plantillas por letra para mejor precisión
4. Asegúrese de que cada punto tenga las propiedades x, y, z

Para más detalles, consulte `HEURISTIC_RECOGNITION.md` en la raíz del proyecto.
