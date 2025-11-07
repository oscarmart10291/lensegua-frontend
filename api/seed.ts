import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de la base de datos...');

  // Insertar módulos
  console.log('📚 Insertando módulos...');
  await prisma.modulo.createMany({
    data: [
      { nombre: 'Abecedario', descripcion: 'Aprende el abecedario en lengua de señas', nivel: 1, orden: 1, module_key: 'abecedario' },
      { nombre: 'Números', descripcion: 'Aprende los números en lengua de señas', nivel: 1, orden: 2, module_key: 'numeros' },
      { nombre: 'Colores', descripcion: 'Aprende los colores en lengua de señas', nivel: 1, orden: 3, module_key: 'colores' },
      { nombre: 'Familia', descripcion: 'Aprende palabras relacionadas con la familia', nivel: 2, orden: 4, module_key: 'familia' },
      { nombre: 'Saludos', descripcion: 'Aprende saludos y despedidas', nivel: 1, orden: 5, module_key: 'saludos' },
    ],
    skipDuplicates: true,
  });

  // Obtener ID del módulo de Abecedario
  const abecedario = await prisma.modulo.findUnique({
    where: { module_key: 'abecedario' },
  });

  if (abecedario) {
    console.log('🔤 Insertando señas del abecedario (A-Z)...');
    const letras = [];
    for (let codigo = 65; codigo <= 90; codigo++) {
      const letra = String.fromCharCode(codigo);
      letras.push({
        id_modulo: abecedario.id_modulo,
        codigo: codigo,
        nombre: letra,
        precision_esperada: 80.00,
      });
    }
    await prisma.sena.createMany({
      data: letras,
      skipDuplicates: true,
    });
  }

  // Obtener ID del módulo de Números
  const numeros = await prisma.modulo.findUnique({
    where: { module_key: 'numeros' },
  });

  if (numeros) {
    console.log('🔢 Insertando señas de números (0-10)...');
    const nums = [];
    for (let num = 0; num <= 10; num++) {
      nums.push({
        id_modulo: numeros.id_modulo,
        codigo: num,
        nombre: num.toString(),
        precision_esperada: 80.00,
      });
    }
    await prisma.sena.createMany({
      data: nums,
      skipDuplicates: true,
    });
  }

  // Obtener ID del módulo de Colores
  const colores = await prisma.modulo.findUnique({
    where: { module_key: 'colores' },
  });

  if (colores) {
    console.log('🎨 Insertando señas de colores...');
    await prisma.sena.createMany({
      data: [
        { id_modulo: colores.id_modulo, codigo: 1, nombre: 'Rojo', precision_esperada: 80.00 },
        { id_modulo: colores.id_modulo, codigo: 2, nombre: 'Azul', precision_esperada: 80.00 },
        { id_modulo: colores.id_modulo, codigo: 3, nombre: 'Verde', precision_esperada: 80.00 },
        { id_modulo: colores.id_modulo, codigo: 4, nombre: 'Amarillo', precision_esperada: 80.00 },
        { id_modulo: colores.id_modulo, codigo: 5, nombre: 'Negro', precision_esperada: 80.00 },
        { id_modulo: colores.id_modulo, codigo: 6, nombre: 'Blanco', precision_esperada: 80.00 },
      ],
      skipDuplicates: true,
    });
  }

  // Agregar columna current_letter_index si no existe
  console.log('🔧 Verificando columna current_letter_index...');
  try {
    await prisma.$executeRaw`
      ALTER TABLE progreso_modulo
      ADD COLUMN IF NOT EXISTS current_letter_index INTEGER DEFAULT NULL
    `;
    console.log('✅ Columna current_letter_index agregada/verificada');
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log('ℹ️  Columna current_letter_index ya existe');
    } else {
      console.log('⚠️  Error al agregar columna:', error.message);
    }
  }

  // Estadísticas
  const totalModulos = await prisma.modulo.count();
  const totalSenas = await prisma.sena.count();

  console.log('\n✅ Seed completado exitosamente!');
  console.log(`📊 Módulos creados: ${totalModulos}`);
  console.log(`📊 Señas creadas: ${totalSenas}`);
}

main()
  .catch((e) => {
    console.error('❌ Error durante el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
