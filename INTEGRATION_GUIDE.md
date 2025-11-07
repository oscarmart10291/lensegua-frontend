# 🎯 Guía de Integración - Sistema de Progreso y Monedas

Esta guía explica cómo usar el nuevo sistema de progreso, monedas y medallas en LENSEGUA.

## 📋 Resumen de Cambios

Se ha implementado un sistema completo de seguimiento de progreso con:

- ✅ Base de datos PostgreSQL con Prisma ORM
- ✅ API REST para gestionar progreso y monedas
- ✅ Integración con la vista de tests
- ✅ Sistema de monedas (1 moneda por seña correcta)
- ✅ Sistema de medallas (oro, plata, bronce)
- ✅ Barra de progreso actualizada en tiempo real

## 🚀 Inicio Rápido

### 1. Configurar la Base de Datos

```bash
# Iniciar contenedor PostgreSQL
docker run --name pg-lensegua \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=lensegua \
  -p 5432:5432 \
  -d postgres:16

# Ejecutar script de inicialización
cd api
psql -h localhost -U postgres -d lensegua -f prisma/init_schema.sql
```

### 2. Configurar Variables de Entorno

Edita `api/.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lensegua?schema=public"
GOOGLE_APPLICATION_CREDENTIALS="./serviceAccountKey.json"
PORT=4000
```

### 3. Instalar Dependencias y Generar Prisma Client

```bash
cd api
npm install
npx prisma generate
```

### 4. Iniciar la API

```bash
cd api
npm run dev
```

La API estará en `http://localhost:4000`

### 5. Iniciar el Frontend

```bash
# En la raíz del proyecto
npm install
npm run dev
```

El frontend estará en `http://localhost:5173`

## 🎮 Cómo Funciona

### Vista de Tests (`/tests`)

1. **Al cargar la página**: Se obtienen las estadísticas del usuario desde la API
2. **Al abrir el modal de Abecedario**: Se inicia la cámara y MediaPipe Hands
3. **Cuando se detecta una seña correcta**:
   - Se registra el intento en la base de datos
   - Se suma 1 moneda si fue correcta
   - Se actualiza el progreso del módulo
   - Se actualiza la barra de progreso
   - Se recalculan las medallas si aplica

### Sistema de Monedas

```typescript
// Cada seña correcta suma 1 moneda
correcta === true → +1 moneda
```

### Sistema de Medallas

Las medallas se otorgan al completar un módulo (100% de señas):

```typescript
if (progreso === 100%) {
  if (promedioPrecision >= 90) → Medalla de Oro 🥇
  else if (promedioPrecision >= 75) → Medalla de Plata 🥈
  else if (promedioPrecision >= 60) → Medalla de Bronce 🥉
}
```

### Cálculo de Progreso

```typescript
Progreso = (Señas únicas correctas / Total señas del módulo) × 100
```

## 🔌 Uso de la API en el Frontend

### Importar funciones

```typescript
import { getUserStats, registrarIntento, getModuleProgress } from '../lib/api';
```

### Obtener estadísticas del usuario

```typescript
const stats = await getUserStats();
console.log(stats);
// {
//   totalCoins: 15,
//   completed: 1,
//   medals: { gold: 0, silver: 1, bronze: 0 },
//   modules: [...]
// }
```

### Registrar un intento

```typescript
const response = await registrarIntento(
  'abecedario',  // moduleKey
  85.5,          // precision (0-100)
  true,          // correcta (true/false)
  1              // senaId (opcional)
);

console.log(response);
// {
//   ok: true,
//   progreso: { porcentaje: 42.3, intentos: 12, ... },
//   monedas: 16,
//   coinEarned: true
// }
```

### Obtener progreso de un módulo

```typescript
const progreso = await getModuleProgress('abecedario');
console.log(progreso);
// {
//   id: "abecedario",
//   name: "Abecedario",
//   progress: 42.3,
//   attempts: 11,
//   bestScore: 87.5,
//   medal: "silver",
//   coinsEarned: 9
// }
```

## 📊 Estructura de Datos

### Módulos Iniciales

El sistema viene con 5 módulos pre-configurados:

1. **Abecedario** - 26 señas (A-Z)
2. **Números** - 11 señas (0-10)
3. **Colores** - 6 señas básicas
4. **Familia** - (Por configurar)
5. **Saludos** - (Por configurar)

### Señas del Abecedario

Las 26 letras del abecedario (A-Z) están pre-cargadas en la base de datos con:
- Código ASCII correspondiente (65-90)
- Precisión esperada: 80%

## 🛠️ Personalización

### Agregar Nuevas Señas

1. Conectar a la base de datos:
```bash
psql -h localhost -U postgres -d lensegua
```

2. Insertar señas:
```sql
INSERT INTO senas (id_modulo, codigo, nombre, precision_esperada)
VALUES
  ((SELECT id_modulo FROM modulos WHERE module_key = 'familia'), 1, 'Madre', 80.00),
  ((SELECT id_modulo FROM modulos WHERE module_key = 'familia'), 2, 'Padre', 80.00);
```

### Modificar Requisitos de Medallas

Edita en `api/index.ts`:

```typescript
// Línea ~254
let medalla = 'none';
if (porcentajeAvance >= 100) {
  if (promedioPrecision >= 90) medalla = 'gold';
  else if (promedioPrecision >= 75) medalla = 'silver';
  else if (promedioPrecision >= 60) medalla = 'bronze';
}
```

### Modificar Monedas por Seña Correcta

Edita en `api/index.ts`:

```typescript
// Línea ~188
if (correcta) {
  nuevasMonedas += 1;  // Cambiar este valor
  nuevasMonedasGanadas += 1;
}
```

## 🔍 Debugging

### Ver base de datos en navegador

```bash
cd api
npx prisma studio
```

Abre http://localhost:5555 para ver y editar datos.

### Ver logs de la API

Los logs incluyen:
- ✅ Intentos registrados
- 🪙 Monedas ganadas
- 📊 Progreso actualizado
- ❌ Errores

### Ver logs del frontend

Abre la consola del navegador para ver:
- Llamadas a la API
- Respuestas del servidor
- Errores de autenticación

## 📝 Notas Importantes

### Autenticación

- Todas las llamadas a la API requieren estar autenticado con Firebase
- El token se envía automáticamente en el header `Authorization`
- Si el usuario no existe en la BD, se crea automáticamente

### Progreso

- El progreso se calcula por **señas únicas correctas**, no por intentos totales
- Si el usuario hace la misma seña correcta 10 veces, solo cuenta como 1 para el progreso
- Esto evita que puedan "hacer trampa" repitiendo la misma seña

### Monedas

- Las monedas sí se acumulan por cada intento correcto
- Hacer la misma seña correcta 10 veces = 10 monedas
- Las monedas se pueden usar para futuras funcionalidades

## 🐛 Problemas Comunes

### "No hay sesión activa"
- Asegúrate de estar logueado con Firebase
- Verifica que el token no haya expirado
- Cierra sesión y vuelve a iniciar

### "No se pudo conectar a la base de datos"
- Verifica que el contenedor PostgreSQL esté corriendo: `docker ps`
- Verifica la URL en `api/.env`
- Prueba conectar manualmente: `psql -h localhost -U postgres -d lensegua`

### "Module not found"
- Verifica que el `module_key` en la BD coincida con el usado en el código
- Ejecuta el script `init_schema.sql` para crear los módulos

### El progreso no se actualiza en la UI
- Abre la consola del navegador y verifica errores
- Verifica que la función `onProgressUpdate` se esté llamando
- Prueba recargar la página

## 📚 Próximos Pasos

Ideas para extender el sistema:

- [ ] Implementar tienda de recompensas con monedas
- [ ] Agregar avatares o personalización con monedas
- [ ] Implementar rankings y tablas de clasificación
- [ ] Agregar logros y trofeos especiales
- [ ] Exportar progreso a PDF
- [ ] Compartir logros en redes sociales
- [ ] Modo competitivo entre usuarios
- [ ] Sistema de racha diaria (daily streak)

## 🤝 Soporte

Si encuentras problemas, revisa:

1. Los logs de la API (`api/` en consola)
2. Los logs del navegador (consola F12)
3. La documentación de Prisma: https://www.prisma.io/docs
4. La documentación de la API: `api/README.md`
