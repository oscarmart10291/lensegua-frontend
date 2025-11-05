#!/usr/bin/env python3
"""
Script para verificar el modelo de Keras y generar el class_index.json correcto
para usar con TensorFlow.js

Uso:
    python verificar_modelo.py --model ruta/al/modelo.h5 --labels ruta/a/labels.npy

El script:
1. Carga el modelo de Keras
2. Verifica la arquitectura y activación
3. Genera el class_index.json con el mapeo correcto
4. Compara predicciones entre Keras y el preprocesamiento de la app
"""

import argparse
import json
import sys
from pathlib import Path

try:
    import tensorflow as tf
    import numpy as np
except ImportError:
    print("❌ Error: Necesitas instalar TensorFlow y NumPy")
    print("   pip install tensorflow numpy")
    sys.exit(1)


def verificar_modelo(model_path):
    """Verifica la estructura del modelo de Keras"""
    print(f"\n🔍 Verificando modelo: {model_path}")
    print("=" * 60)

    try:
        model = tf.keras.models.load_model(model_path)
    except Exception as e:
        print(f"❌ Error al cargar el modelo: {e}")
        return None

    # Verificar estructura
    print(f"\n📐 Estructura del modelo:")
    print(f"   Input shape:  {model.input_shape}")
    print(f"   Output shape: {model.output_shape}")

    input_dim = model.input_shape[-1]
    output_dim = model.output_shape[-1]

    # Verificaciones
    if input_dim != 42:
        print(f"   ⚠️  ADVERTENCIA: Input esperado es 42 (21 landmarks × 2)")
        print(f"      Tu modelo usa {input_dim}")
    else:
        print(f"   ✅ Input correcto: 42 valores (X,Y por landmark)")

    if output_dim != 28:
        print(f"   ⚠️  ADVERTENCIA: Output esperado es 28 clases")
        print(f"      Tu modelo usa {output_dim}")
    else:
        print(f"   ✅ Output correcto: 28 clases")

    # Verificar última capa
    last_layer = model.layers[-1]
    activation = last_layer.get_config().get('activation', 'unknown')

    print(f"\n🔬 Última capa:")
    print(f"   Tipo: {last_layer.__class__.__name__}")
    print(f"   Activación: {activation}")

    if activation == 'softmax':
        print(f"   ✅ Softmax en la última capa (correcto)")
        print(f"   ⚠️  NO aplicar softmax adicional en JavaScript")
    else:
        print(f"   ⚠️  Sin softmax - necesitas aplicarlo en JavaScript")

    # Resumen del modelo
    print(f"\n📊 Resumen del modelo:")
    model.summary()

    return model


def cargar_labels(labels_path, num_classes):
    """Carga los nombres de las clases"""
    if not labels_path:
        print(f"\n⚠️  No se proporcionó archivo de labels")
        print(f"   Generando labels genéricos: clase_0, clase_1, ...")
        return [f"clase_{i}" for i in range(num_classes)]

    labels_path = Path(labels_path)

    if not labels_path.exists():
        print(f"\n❌ No se encontró el archivo de labels: {labels_path}")
        print(f"   Generando labels genéricos")
        return [f"clase_{i}" for i in range(num_classes)]

    try:
        if labels_path.suffix == '.npy':
            labels = np.load(labels_path, allow_pickle=True)
        elif labels_path.suffix == '.json':
            with open(labels_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    labels = data
                elif isinstance(data, dict):
                    # Puede ser un dict {letra: indice} o {indice: letra}
                    # Intentamos inferir
                    first_key = list(data.keys())[0]
                    if first_key.isdigit() or isinstance(first_key, int):
                        # {indice: letra}
                        labels = [data[str(i)] for i in range(len(data))]
                    else:
                        # {letra: indice} - invertir
                        sorted_items = sorted(data.items(), key=lambda x: x[1])
                        labels = [letra for letra, _ in sorted_items]
                else:
                    raise ValueError("Formato JSON no reconocido")
        elif labels_path.suffix == '.txt':
            with open(labels_path, 'r', encoding='utf-8') as f:
                labels = [line.strip() for line in f if line.strip()]
        else:
            raise ValueError(f"Formato no soportado: {labels_path.suffix}")

        labels = list(labels)
        print(f"\n✅ Labels cargados desde: {labels_path}")
        print(f"   Total: {len(labels)} clases")

        if len(labels) != num_classes:
            print(f"\n⚠️  ADVERTENCIA: Número de labels ({len(labels)}) "
                  f"no coincide con clases del modelo ({num_classes})")

        return labels

    except Exception as e:
        print(f"\n❌ Error al cargar labels: {e}")
        print(f"   Generando labels genéricos")
        return [f"clase_{i}" for i in range(num_classes)]


def generar_class_index(labels):
    """Genera el diccionario class_index.json"""
    class_index = {label: idx for idx, label in enumerate(labels)}
    return class_index


def simular_preprocesamiento_js(landmarks_3d):
    """
    Simula el preprocesamiento que hace la app en JavaScript
    para comparar con el de Python

    Args:
        landmarks_3d: Array de shape (21, 3) con coordenadas X,Y,Z normalizadas [0,1]

    Returns:
        Vector de 42 elementos procesado igual que en PracticeModal.tsx
    """
    # Copiar para no modificar el original
    landmarks = landmarks_3d.copy()

    # 1. Normalizar respecto a la muñeca (punto 0)
    wrist = landmarks[0]
    landmarks = landmarks - wrist

    # 2. Calcular bounding box (solo X,Y)
    min_x, min_y = landmarks[:, :2].min(axis=0)
    max_x, max_y = landmarks[:, :2].max(axis=0)

    # 3. Escalar por diagonal del bounding box
    scale = max(1e-6, np.hypot(max_x - min_x, max_y - min_y))
    landmarks = landmarks / scale

    # 4. Aplanar solo X,Y (ignorar Z)
    vector = landmarks[:, :2].flatten()

    return vector


def test_preprocesamiento():
    """Genera landmarks de ejemplo y muestra el preprocesamiento"""
    print(f"\n🧪 Test de preprocesamiento:")
    print("=" * 60)

    # Generar landmarks de ejemplo (mano abierta simulada)
    np.random.seed(42)
    landmarks = np.random.rand(21, 3)  # Valores entre 0 y 1

    print(f"\nLandmarks originales (primeros 3 puntos):")
    print(landmarks[:3])

    # Aplicar preprocesamiento
    processed = simular_preprocesamiento_js(landmarks)

    print(f"\nVector procesado (primeros 10 valores):")
    print(processed[:10])
    print(f"\nShape: {processed.shape}")
    print(f"Min: {processed.min():.4f}, Max: {processed.max():.4f}")

    print(f"\n💡 Copia este código en tu pipeline de entrenamiento:")
    print(f"   y verifica que los valores sean similares")


def main():
    parser = argparse.ArgumentParser(
        description='Verificar modelo de Keras y generar class_index.json'
    )
    parser.add_argument(
        '--model', '-m',
        type=str,
        help='Ruta al modelo de Keras (.h5 o directorio SavedModel)'
    )
    parser.add_argument(
        '--labels', '-l',
        type=str,
        help='Ruta a los labels (.npy, .json, o .txt)'
    )
    parser.add_argument(
        '--output', '-o',
        type=str,
        default='class_index.json',
        help='Archivo de salida para class_index.json (default: class_index.json)'
    )
    parser.add_argument(
        '--test',
        action='store_true',
        help='Solo ejecutar test de preprocesamiento sin cargar modelo'
    )

    args = parser.parse_args()

    if args.test:
        test_preprocesamiento()
        return

    if not args.model:
        print("❌ Error: Debes proporcionar la ruta al modelo con --model")
        print("\nUso:")
        print("  python verificar_modelo.py --model modelo.h5 --labels labels.npy")
        print("  python verificar_modelo.py --test  # Solo test de preprocesamiento")
        sys.exit(1)

    # Verificar modelo
    model = verificar_modelo(args.model)
    if model is None:
        sys.exit(1)

    num_classes = model.output_shape[-1]

    # Cargar labels
    labels = cargar_labels(args.labels, num_classes)

    # Mostrar labels
    print(f"\n📋 Labels detectados:")
    for idx, label in enumerate(labels):
        print(f"   {idx:2d}: {label}")

    # Generar class_index
    class_index = generar_class_index(labels)

    # Guardar a archivo
    output_path = Path(args.output)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(class_index, f, indent=2, ensure_ascii=False)

    print(f"\n✅ class_index.json generado en: {output_path}")
    print(f"\nContenido:")
    print(json.dumps(class_index, indent=2, ensure_ascii=False))

    print(f"\n📝 Siguiente paso:")
    print(f"   1. Copia {output_path} a public/models/estatico_last/class_index.json")
    print(f"   2. Recarga la aplicación")
    print(f"   3. Prueba con señas conocidas")

    # Test de preprocesamiento
    print(f"\n" + "=" * 60)
    test_preprocesamiento()


if __name__ == '__main__':
    main()
