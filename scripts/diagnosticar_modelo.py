#!/usr/bin/env python3
"""
Script para diagnosticar el problema de 28 salidas vs 21 clases

Uso:
    python diagnosticar_modelo.py --model modelo.h5 --dataset dataset/

Este script te ayudará a entender por qué tu modelo tiene 28 unidades
de salida cuando solo entrenaste 21 clases.
"""

import argparse
import sys
from pathlib import Path

try:
    import tensorflow as tf
    import numpy as np
except ImportError:
    print("❌ Error: Necesitas instalar TensorFlow y NumPy")
    print("   pip install tensorflow numpy")
    sys.exit(1)


def analizar_modelo(model_path):
    """Analiza la estructura del modelo"""
    print(f"\n🔍 Analizando modelo: {model_path}")
    print("=" * 60)

    try:
        model = tf.keras.models.load_model(model_path)
    except Exception as e:
        print(f"❌ Error al cargar el modelo: {e}")
        return None

    # Información básica
    print(f"\n📐 Estructura:")
    print(f"   Input shape:  {model.input_shape}")
    print(f"   Output shape: {model.output_shape}")

    input_dim = model.input_shape[-1]
    output_dim = model.output_shape[-1]

    print(f"\n🔢 Dimensiones:")
    print(f"   Input:  {input_dim} valores (landmarks)")
    print(f"   Output: {output_dim} clases")

    # Analizar última capa
    last_layer = model.layers[-1]
    config = last_layer.get_config()

    print(f"\n🎯 Última capa:")
    print(f"   Tipo: {last_layer.__class__.__name__}")
    print(f"   Unidades: {config.get('units', 'N/A')}")
    print(f"   Activación: {config.get('activation', 'N/A')}")

    # Verificar si tiene softmax
    if config.get('activation') == 'softmax':
        print(f"   ✅ Tiene softmax (NO aplicar softmax en JavaScript)")
    else:
        print(f"   ⚠️  Sin softmax (DEBES aplicar softmax en JavaScript)")

    # Buscar información de entrenamiento en config
    if hasattr(model, 'optimizer'):
        print(f"\n🏋️ Información de entrenamiento:")
        try:
            # Intentar obtener métricas
            if hasattr(model, 'metrics_names'):
                print(f"   Métricas: {model.metrics_names}")
        except:
            pass

    return model


def analizar_dataset(dataset_path):
    """Analiza el dataset de entrenamiento"""
    dataset_path = Path(dataset_path)

    if not dataset_path.exists():
        print(f"\n⚠️  No se encontró el dataset en: {dataset_path}")
        return None

    print(f"\n📁 Analizando dataset: {dataset_path}")
    print("=" * 60)

    # Buscar estructura de carpetas (ImageDataGenerator style)
    subdirs = [d for d in dataset_path.iterdir() if d.is_dir()]

    if not subdirs:
        print(f"   ⚠️  No se encontraron subcarpetas (clases)")
        return None

    print(f"\n📋 Clases encontradas: {len(subdirs)}")

    # Listar clases en orden alfabético (como ImageDataGenerator)
    clases_ordenadas = sorted([d.name for d in subdirs])

    for idx, clase in enumerate(clases_ordenadas):
        clase_path = dataset_path / clase
        num_images = len(list(clase_path.glob('*.jpg'))) + \
                     len(list(clase_path.glob('*.png'))) + \
                     len(list(clase_path.glob('*.jpeg')))
        print(f"   {idx:2d}: {clase:15s} ({num_images} imágenes)")

    return clases_ordenadas


def comparar_modelo_dataset(model, clases):
    """Compara el modelo con el dataset"""
    print(f"\n🔍 Comparación:")
    print("=" * 60)

    if model is None:
        print("   ⚠️  Modelo no cargado")
        return

    output_dim = model.output_shape[-1]
    num_clases = len(clases) if clases else 0

    print(f"   Modelo tiene:  {output_dim} unidades de salida")
    print(f"   Dataset tiene: {num_clases} clases")

    if output_dim == num_clases:
        print(f"   ✅ ¡Coinciden! El modelo está correctamente configurado.")
    elif output_dim > num_clases:
        diff = output_dim - num_clases
        print(f"   ❌ El modelo tiene {diff} unidades EXTRA")
        print(f"\n   💡 Posibles causas:")
        print(f"      1. Error al definir la última capa Dense")
        print(f"      2. Agregaste clases adicionales que no están en el dataset")
        print(f"      3. El modelo fue entrenado con un dataset diferente")
        print(f"\n   🔧 Soluciones:")
        print(f"      A. Re-entrenar el modelo con Dense(units={num_clases})")
        print(f"      B. Verificar si hay clases faltantes en el dataset")
        print(f"      C. Buscar el dataset original usado para entrenar")
    else:
        diff = num_clases - output_dim
        print(f"   ❌ El dataset tiene {diff} clases MÁS que el modelo")
        print(f"\n   💡 Esto sugiere que el modelo está incompleto o corrupto")


def generar_codigo_correccion(clases):
    """Genera código Python para re-entrenar correctamente"""
    if not clases:
        return

    print(f"\n📝 Código sugerido para re-entrenar:")
    print("=" * 60)

    print(f"""
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout

# Definir clases correctamente
NUM_CLASES = {len(clases)}
class_names = {clases}

# Arquitectura del modelo (basada en tu model.json)
model = Sequential([
    Dense(256, activation='relu', input_shape=(42,)),
    Dropout(0.3),
    Dense(128, activation='relu'),
    Dropout(0.2),
    Dense(64, activation='relu'),
    Dense(NUM_CLASES, activation='softmax')  # ⚠️ IMPORTANTE: {len(clases)} clases
])

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=0.000125),
    loss='sparse_categorical_crossentropy',
    metrics=['accuracy']
)

print(f"✅ Modelo creado con {{NUM_CLASES}} clases de salida")
print(f"   Output shape: {{model.output_shape}}")

# Entrenar...
# model.fit(X_train, y_train, ...)

# Exportar a TensorFlow.js
import tensorflowjs as tfjs
tfjs.converters.save_keras_model(model, 'models/estatico_corregido')
""")


def verificar_exportacion_tfjs(tfjs_model_path):
    """Verifica el modelo exportado de TensorFlow.js"""
    import json

    model_path = Path(tfjs_model_path)

    if not model_path.exists():
        print(f"\n⚠️  No se encontró el modelo TF.js en: {model_path}")
        return

    model_json = model_path / 'model.json'

    if not model_json.exists():
        print(f"\n⚠️  No se encontró model.json")
        return

    print(f"\n🔍 Verificando exportación TF.js:")
    print("=" * 60)

    with open(model_json, 'r') as f:
        data = json.load(f)

    # Buscar la última capa
    layers = data['modelTopology']['model_config']['config']['layers']
    last_layer = None

    for layer in reversed(layers):
        if layer['class_name'] == 'Dense':
            last_layer = layer
            break

    if last_layer:
        units = last_layer['config']['units']
        activation = last_layer['config']['activation']

        print(f"   Última capa Dense:")
        print(f"   - Unidades: {units}")
        print(f"   - Activación: {activation}")

        if activation == 'softmax':
            print(f"   ✅ Tiene softmax (correcto)")
        else:
            print(f"   ⚠️  Sin softmax")

        return units

    return None


def main():
    parser = argparse.ArgumentParser(
        description='Diagnosticar problema de 28 salidas vs 21 clases'
    )
    parser.add_argument(
        '--model', '-m',
        type=str,
        help='Ruta al modelo de Keras (.h5)'
    )
    parser.add_argument(
        '--dataset', '-d',
        type=str,
        help='Ruta al dataset de entrenamiento (carpeta con subcarpetas por clase)'
    )
    parser.add_argument(
        '--tfjs', '-t',
        type=str,
        help='Ruta al modelo exportado de TF.js (carpeta con model.json)'
    )

    args = parser.parse_args()

    if not any([args.model, args.dataset, args.tfjs]):
        print("❌ Error: Debes proporcionar al menos un argumento")
        print("\nUso:")
        print("  python diagnosticar_modelo.py --model modelo.h5")
        print("  python diagnosticar_modelo.py --dataset dataset/")
        print("  python diagnosticar_modelo.py --tfjs public/models/estatico_last/")
        print("  python diagnosticar_modelo.py --model modelo.h5 --dataset dataset/")
        sys.exit(1)

    model = None
    clases = None
    tfjs_units = None

    # Analizar modelo Keras
    if args.model:
        model = analizar_modelo(args.model)

    # Analizar dataset
    if args.dataset:
        clases = analizar_dataset(args.dataset)

    # Verificar exportación TF.js
    if args.tfjs:
        tfjs_units = verificar_exportacion_tfjs(args.tfjs)

    # Comparar
    if model and clases:
        comparar_modelo_dataset(model, clases)
        generar_codigo_correccion(clases)
    elif clases:
        generar_codigo_correccion(clases)

    # Resumen
    print(f"\n📊 Resumen:")
    print("=" * 60)

    if model:
        print(f"   Modelo Keras:    {model.output_shape[-1]} clases")

    if tfjs_units:
        print(f"   Modelo TF.js:    {tfjs_units} clases")

    if clases:
        print(f"   Dataset:         {len(clases)} clases")

    print(f"\n💡 Recomendación:")
    if model and clases and model.output_shape[-1] != len(clases):
        print(f"   ⚠️  Re-entrenar el modelo con {len(clases)} clases en la salida")
        print(f"   ⚠️  O verificar si hay clases faltantes en el dataset")
    elif tfjs_units and clases and tfjs_units != len(clases):
        print(f"   ⚠️  El modelo TF.js tiene unidades extra")
        print(f"   ⚠️  Mientras tanto, el código JS ignorará índices 21-27")
    else:
        print(f"   ✅ Todo parece estar correcto")


if __name__ == '__main__':
    main()
