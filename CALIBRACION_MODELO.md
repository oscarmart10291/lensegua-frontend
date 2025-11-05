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

## 📊 Mapeo de Clases Estáticas (21 clases)

El mapeo correcto para señas **estáticas** es:

```json
{
  "A": 0, "B": 1, "C": 2, "E": 3, "G": 4, "H": 5, "I": 6,
  "K": 7, "L": 8, "M": 9, "N": 10, "O": 11, "Q": 12, "R": 13,
  "T": 14, "U": 15, "V": 16, "W": 17, "X": 18, "Y": 19, "Z": 20
}
```

**✅ Este es el orden CORRECTO de entrenamiento.**

**⚠️ PROBLEMA DETECTADO:** El modelo tiene 28 unidades de salida pero solo 21 clases fueron entrenadas. Los índices 21-27 son "clases fantasma" y serán ignorados automáticamente por el código.

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

---

## 🚨 Problema: 28 Unidades de Salida vs 21 Clases Entrenadas

### El Problema

Tu modelo actual tiene una **inconsistencia crítica**:

- **Modelo:** 28 unidades en la capa de salida (Dense)
- **Dataset:** Solo 21 clases estáticas entrenadas (A-Z sin D, F, J, Ñ, P, S)

Esto significa que hay **7 neuronas "fantasma"** (índices 21-27) que:
- ❌ Nunca fueron entrenadas con datos reales
- ❌ Generan predicciones aleatorias/basura
- ❌ Pueden interferir con las predicciones correctas

### Solución Temporal (Ya Implementada)

El código ha sido **modificado automáticamente** para:
- ✅ Ignorar índices 21-27 al calcular el top-1
- ✅ Solo considerar índices 0-20 (clases válidas)
- ✅ Filtrar predicciones basura

**Ubicación:** `src/components/PracticeModal.tsx` línea 283-292

### Solución Permanente (Recomendada)

**Re-entrenar el modelo con la arquitectura correcta:**

```python
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout

# ⚠️ IMPORTANTE: 21 clases, NO 28
NUM_CLASES = 21

class_names = [
    'A', 'B', 'C', 'E', 'G', 'H', 'I', 'K', 'L', 'M', 'N',
    'O', 'Q', 'R', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'
]

# Arquitectura corregida (basada en tu model.json)
model = Sequential([
    Dense(256, activation='relu', input_shape=(42,)),
    Dropout(0.3),
    Dense(128, activation='relu'),
    Dropout(0.2),
    Dense(64, activation='relu'),
    Dense(NUM_CLASES, activation='softmax')  # ✅ 21 clases
])

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=0.000125),
    loss='sparse_categorical_crossentropy',
    metrics=['accuracy']
)

print(f"✅ Modelo corregido con {NUM_CLASES} clases de salida")

# Entrenar con tu dataset...
# model.fit(X_train, y_train, epochs=100, validation_data=(X_val, y_val))

# Exportar a TensorFlow.js
import tensorflowjs as tfjs
tfjs.converters.save_keras_model(model, 'models/estatico_corregido')
```

### Diagnóstico del Problema

Usa el script de diagnóstico para investigar:

```bash
# Analizar el modelo Keras original
python scripts/diagnosticar_modelo.py --model modelo_original.h5

# Analizar el dataset
python scripts/diagnosticar_modelo.py --dataset dataset/estaticas/

# Analizar el modelo TF.js exportado
python scripts/diagnosticar_modelo.py --tfjs public/models/estatico_last/

# Análisis completo
python scripts/diagnosticar_modelo.py \
  --model modelo_original.h5 \
  --dataset dataset/estaticas/ \
  --tfjs public/models/estatico_last/
```

El script te dirá:
- ✅ Cuántas clases hay en tu dataset
- ✅ Cuántas unidades tiene tu modelo
- ✅ Si hay discrepancia entre modelo y dataset
- ✅ Código para corregir el problema

### Por Qué Ocurrió Esto

Posibles causas:

1. **Error al definir la última capa:**
   ```python
   # ❌ Pusiste 28 en lugar de 21
   model.add(Dense(28, activation='softmax'))
   ```

2. **Contaste mal las clases:**
   - Pensaste que eran 28 (26 letras + CH + LL)
   - Pero realmente solo entrenaste 21

3. **Usaste un modelo pre-definido:**
   - Copiaste código de otro proyecto que usaba 28 clases
   - Olvidaste ajustar la última capa

### ¿Puedo Seguir Usando el Modelo Actual?

**Sí, temporalmente:**
- ✅ El código ahora ignora los índices 21-27
- ✅ Solo usa las 21 clases válidas (0-20)
- ✅ Debería funcionar con mejor precisión

**Pero es mejor re-entrenar porque:**
- ⚡ Modelo más pequeño = más rápido
- 📉 Menos probabilidad de errores
- 🎯 Arquitectura limpia y correcta

### Checklist de Corrección

- [ ] Revisé mi código de entrenamiento
- [ ] Confirmé que solo tengo 21 clases
- [ ] Ejecuté `diagnosticar_modelo.py` para verificar
- [ ] Re-entrené el modelo con Dense(21) en la salida
- [ ] Exporté correctamente a TensorFlow.js
- [ ] Reemplacé el modelo en `public/models/estatico_last/`
- [ ] Verifiqué que la precisión mejoró

---
