# API LENSEGUA - Sistema de Progreso y Monedas

API Backend para el sistema de progreso, monedas y medallas de LENSEGUA.

## 🗄️ Base de Datos

### Configuración de PostgreSQL

El sistema utiliza PostgreSQL con Prisma ORM. Asegúrate de tener un contenedor Docker con PostgreSQL corriendo:

```bash
# Iniciar contenedor PostgreSQL (ejemplo)
docker run --name pg-lensegua \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=lensegua \
  -p 5432:5432 \
  -d postgres:16
```

### Inicializar la Base de Datos

1. **Configurar variables de entorno**: Edita el archivo `.env` en la carpeta `api/`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lensegua?schema=public"
GOOGLE_APPLICATION_CREDENTIALS="./serviceAccountKey.json"
PORT=4000
```

2. **Ejecutar el script SQL de inicialización**:

```bash
# Conectar a PostgreSQL y ejecutar el script
psql -h localhost -U postgres -d lensegua -f prisma/init_schema.sql
```

O ejecutar desde Docker:

```bash
docker exec -i pg-lensegua psql -U postgres -d lensegua < prisma/init_schema.sql
```

3. **Generar el cliente de Prisma**:

```bash
cd api
npm install
npx prisma generate
```

## 🚀 Iniciar la API

```bash
cd api
npm run dev
```

La API estará disponible en `http://localhost:4000`

## 📊 Estructura de la Base de Datos

### Tablas Principales

1. **usuarios**: Información de usuarios autenticados con Firebase
2. **modulos**: Módulos de aprendizaje (Abecedario, Números, etc.)
3. **senas**: Señas individuales por módulo
4. **recursos_multimedia**: Recursos (imágenes, videos) asociados a señas
5. **intentos_practica**: Registro de cada intento de práctica
6. **progreso_modulo**: Progreso agregado del usuario por módulo
7. **evaluaciones**: Evaluaciones formales
8. **resultados_evaluacion**: Resultados detallados de evaluaciones

### Relaciones Clave

- Un **usuario** puede tener múltiples **intentos_practica** y **progreso_modulo**
- Cada **módulo** contiene múltiples **señas**
- Cada **intento_practica** registra la precisión y si fue correcta
- El **progreso_modulo** se actualiza automáticamente con cada intento

## 🔌 Endpoints API

### Rutas Públicas

- `GET /api/health` - Health check
- `GET /api/dbcheck` - Verificar conexión a base de datos

### Rutas Protegidas (requieren autenticación)

#### Estadísticas del Usuario
```http
GET /api/stats
Authorization: Bearer <firebase-id-token>
```

Respuesta:
```json
{
  "totalCoins": 15,
  "completed": 1,
  "medals": {
    "gold": 0,
    "silver": 1,
    "bronze": 0
  },
  "modules": [
    {
      "id": "abecedario",
      "name": "Abecedario",
      "progress": 42.3,
      "attempts": 11,
      "bestScore": 87.5,
      "medal": "silver",
      "coinsEarned": 9
    }
  ]
}
```

#### Registrar Intento de Práctica
```http
POST /api/intentos
Authorization: Bearer <firebase-id-token>
Content-Type: application/json

{
  "moduleKey": "abecedario",
  "precision": 85.5,
  "correcta": true,
  "senaId": 1  // Opcional
}
```

Respuesta:
```json
{
  "ok": true,
  "progreso": {
    "porcentaje": 42.3,
    "intentos": 12,
    "mejorPuntaje": 87.5,
    "medalla": "silver",
    "monedasGanadas": 10
  },
  "monedas": 16,
  "coinEarned": true
}
```

#### Obtener Progreso de un Módulo
```http
GET /api/progreso/:moduleKey
Authorization: Bearer <firebase-id-token>
```

#### Obtener Señas de un Módulo
```http
GET /api/senas/:moduleKey
Authorization: Bearer <firebase-id-token>
```

#### Obtener Todos los Módulos
```http
GET /api/modulos
Authorization: Bearer <firebase-id-token>
```

## 🎮 Sistema de Monedas y Medallas

### Monedas
- Se gana **1 moneda** por cada intento correcto
- Las monedas se acumulan globalmente en el perfil del usuario
- Se pueden usar para futuras funcionalidades (tienda, recompensas, etc.)

### Medallas
Las medallas se otorgan al **completar un módulo** (100% de las señas correctas):

- 🥇 **Oro**: Promedio de precisión ≥ 90%
- 🥈 **Plata**: Promedio de precisión ≥ 75%
- 🥉 **Bronce**: Promedio de precisión ≥ 60%

### Progreso
El progreso se calcula como:
```
Progreso = (Señas únicas correctas / Total de señas del módulo) × 100
```

## 🔧 Desarrollo

### Comandos Útiles

```bash
# Desarrollo con auto-reload
npm run dev

# Compilar TypeScript
npm run build

# Ejecutar en producción
npm start

# Generar cliente de Prisma (después de cambios en schema)
npx prisma generate

# Ver base de datos en navegador
npx prisma studio
```

### Agregar Nuevos Módulos

1. Insertar en la tabla `modulos`:
```sql
INSERT INTO modulos (nombre, descripcion, nivel, orden, module_key)
VALUES ('Nuevo Módulo', 'Descripción', 1, 6, 'nuevo_modulo');
```

2. Insertar señas asociadas:
```sql
INSERT INTO senas (id_modulo, codigo, nombre, precision_esperada)
VALUES
  ((SELECT id_modulo FROM modulos WHERE module_key = 'nuevo_modulo'), 1, 'Seña 1', 80.00),
  ((SELECT id_modulo FROM modulos WHERE module_key = 'nuevo_modulo'), 2, 'Seña 2', 80.00);
```

## 📝 Logs y Debug

La API incluye logs detallados:
- En desarrollo: Muestra queries de Prisma, errores y warnings
- En producción: Solo errores

## 🔒 Seguridad

- Todas las rutas protegidas requieren autenticación con Firebase
- Los tokens JWT se verifican en cada request
- Los usuarios se crean automáticamente en la BD al primer login
- Las relaciones de BD previenen inconsistencias con CASCADE/RESTRICT

## 🚨 Troubleshooting

### Error: No se puede conectar a la base de datos
```bash
# Verificar que el contenedor esté corriendo
docker ps | grep pg-lensegua

# Verificar logs del contenedor
docker logs pg-lensegua

# Reiniciar contenedor
docker restart pg-lensegua
```

### Error: Prisma Client no está generado
```bash
cd api
npx prisma generate
```

### Error: Tabla no existe
```bash
# Ejecutar el script de inicialización
psql -h localhost -U postgres -d lensegua -f prisma/init_schema.sql
```
