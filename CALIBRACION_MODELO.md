# 🎯 Guía de Calibración del Modelo de Lengua de Señas

## ⚠️ Problemas Corregidos

Se identificaron y corrigieron **3 errores críticos** que causaban la pérdida de precisión:

### 1. ❌ Doble aplicación de Softmax
**Problema:** El código aplicaba `tf.softmax()` sobre la salida del modelo, pero el modelo **ya tiene softmax** en su última capa.

**Efecto:** Distorsión completa de las probabilidades, haciendo que el modelo sea impreciso.

**Solución:** ✅ Eliminada la doble aplicación de softmax en las líneas 248, 261 y 277 de `PracticeModal.tsx`

### 2. ❌ Mapeado Incompleto de Clases
**Problema:**
- El modelo tiene **28 clases de salida**
- El `class_index.json` original solo tenía **21 letras**
- Faltaban: D, F, J, Ñ, P, S, CH

**Solución:** ✅ Se actualizó `class_index.json` con las 28 clases completas

### 3. ⚠️ Verificación del Preprocesamiento
**Estado:** El preprocesamiento usa correctamente 42 valores (21 landmarks × 2 coordenadas X,Y)

---

## 🔧 Cómo Calibrar el Modelo

**IMPORTANTE:** El mapeo actual asume que las letras faltantes (D, F, J, Ñ, P, S, CH) están en los índices 21-27. **Debes verificar esto con tu modelo original.**

### Paso 1: Identificar el Orden de Entrenamiento

Necesitas saber en qué orden entrenaste las clases. Por ejemplo:
```python
# En tu código de entrenamiento de Keras/TensorFlow
# Busca algo como:
class_names = ['A', 'B', 'C', 'D', 'E', 'F', ...]  # ¿En qué orden?
# o
label_encoder.classes_  # Si usaste LabelEncoder
```

### Paso 2: Usar el Modo Calibración en la App

1. Abre la aplicación y ve a cualquier módulo de práctica
2. Haz clic en el botón **"Calibrar (C)"** en el panel de debug
3. Para cada letra:
   - Haz la seña estática
   - Observa el **índice top** que muestra el modelo
   - Si el índice no coincide, haz clic en **"Asignar top → [letra]"**
4. Cuando termines, haz clic en **"Descargar JSON"**
5. Reemplaza el archivo `public/models/estatico_last/class_index.json`

### Paso 3: Verificar el Preprocesamiento

Asegúrate de que el preprocesamiento en producción coincida con el de entrenamiento:

#### En tu código de entrenamiento (Python):
```python
def preprocess_landmarks(landmarks):
    # 1. Normalizar respecto a la muñeca (punto 0)
    wrist = landmarks[0]
    landmarks = landmarks - wrist

    # 2. Escalar por bounding box
    bbox_width = landmarks[:, 0].max() - landmarks[:, 0].min()
    bbox_height = landmarks[:, 1].max() - landmarks[:, 1].min()
    scale = np.hypot(bbox_width, bbox_height)
    landmarks = landmarks / scale

    # 3. Aplanar a vector (solo X,Y, sin Z)
    return landmarks[:, :2].flatten()  # Shape: (42,)
```

#### En la app (JavaScript - ya implementado):
- ✅ Normalización respecto a muñeca (línea 309)
- ✅ Escalado por bounding box (líneas 312-315)
- ✅ Solo usa X,Y (42 valores) (línea 325)

---

## 📊 Validación del Mapeo Actual

El mapeo actual es:

```json
{
  "A": 0, "B": 1, "C": 2, "E": 3, "G": 4, "H": 5, "I": 6,
  "K": 7, "L": 8, "M": 9, "N": 10, "O": 11, "Q": 12, "R": 13,
  "T": 14, "U": 15, "V": 16, "W": 17, "X": 18, "Y": 19, "Z": 20,
  "D": 21, "F": 22, "J": 23, "Ñ": 24, "P": 25, "S": 26, "CH": 27
}
```

**⚠️ ESTO ES UNA ESTIMACIÓN.** Debes verificar con tu código de entrenamiento original.

---

## 🐍 Script de Python para Verificar el Modelo

Si tienes el modelo original en Keras, ejecuta esto:

```python
import tensorflow as tf
import numpy as np

# Cargar modelo original
model = tf.keras.models.load_model('ruta/al/modelo.h5')

# Ver estructura
print("Input shape:", model.input_shape)   # Debe ser (None, 42)
print("Output shape:", model.output_shape) # Debe ser (None, 28)

# Verificar última activación
last_layer = model.layers[-1]
print("Última activación:", last_layer.activation)  # Debe ser 'softmax'

# Ver clases (si guardaste los labels)
# Busca un archivo como 'class_names.npy' o similar
class_names = np.load('class_names.npy')  # O como lo hayas guardado
print("Clases:", class_names)

# Crear mapeo correcto
class_index = {name: idx for idx, name in enumerate(class_names)}
print("Mapeo correcto:", class_index)
```

---

## 🧪 Probar las Correcciones

1. **Prueba con señas conocidas:**
   - Haz la seña de "A" → Debe dar alta confianza para índice 0
   - Haz la seña de "B" → Debe dar alta confianza para índice 1
   - etc.

2. **Compara con Keras:**
   ```python
   # En Python
   import numpy as np

   # Simula los landmarks que estás enviando desde la app
   landmarks_test = np.array([...])  # 21 puntos × 2 = shape (42,)

   prediction = model.predict(landmarks_test.reshape(1, 42))
   predicted_class = np.argmax(prediction)
   confidence = prediction[0][predicted_class]

   print(f"Clase predicha: {predicted_class} ({class_names[predicted_class]})")
   print(f"Confianza: {confidence * 100:.2f}%")
   ```

3. **Usa el modo debug de la app:**
   - Observa si "top" coincide con la letra esperada
   - Verifica que la confianza sea > 70% con buena iluminación

---

## 📝 Notas Importantes

### Coordenadas Z
- El modelo usa **solo X,Y** (42 valores)
- MediaPipe proporciona X,Y,Z (63 valores)
- La configuración `USE_Z_BY_F` está correctamente configurada para ignorar Z

### Mirror X
- `MIRROR_X: true` invierte la coordenada X
- Esto es correcto si entrenaste con cámara frontal (selfie mode)
- Si entrenaste con imágenes sin espejo, cambia a `false` en línea 19

### Rotación
- `ROT_ALIGN: false` está desactivado
- Si entrenaste con alineación rotacional, actívalo en línea 22

---

## 🆘 Troubleshooting

### El modelo sigue siendo impreciso:

1. **Verifica el orden de las clases** con tu código de entrenamiento
2. **Revisa el preprocesamiento:** ¿Normalizaste de la misma manera?
3. **Comprueba MIRROR_X:** ¿Entrenaste con imágenes espejadas?
4. **Iluminación:** Prueba con buena luz directa
5. **Distancia de la cámara:** Mantén la mano a ~50cm de la cámara

### Cómo comparar preprocesamiento:

Exporta landmarks desde la app (agrega esto temporalmente en línea 299):
```typescript
console.log('Landmarks procesados:', frameVec);
```

Luego compara con Python:
```python
# Tus landmarks de Python
python_landmarks = preprocess_landmarks(hand_data)
print('Landmarks Python:', python_landmarks)
```

Deben ser muy similares (diferencias < 0.01).

---

## ✅ Checklist de Validación

- [ ] Verifiqué el orden de clases en mi código de entrenamiento
- [ ] Actualicé `class_index.json` con el mapeo correcto
- [ ] Probé al menos 5 señas diferentes
- [ ] La confianza es > 70% con buena iluminación
- [ ] El índice "top" coincide con la letra esperada
- [ ] Comparé el preprocesamiento entre Python y JavaScript
- [ ] Verifiqué que `MIRROR_X` es correcto para mi caso

---

**¿Necesitas más ayuda?** Revisa los logs del navegador (F12 → Console) para ver errores de TensorFlow.js.
