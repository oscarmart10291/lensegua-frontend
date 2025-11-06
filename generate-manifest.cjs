/**
 * Script para generar el manifest.json de landmarks
 * Ejecutar con: node generate-manifest.cjs
 */

const fs = require('fs');
const path = require('path');

const landmarksDir = path.join(__dirname, 'public/landmarks');
const manifest = {};

// Leer todas las carpetas de letras
const letters = fs.readdirSync(landmarksDir).filter(item => {
  const itemPath = path.join(landmarksDir, item);
  return fs.statSync(itemPath).isDirectory();
});

console.log(`Encontradas ${letters.length} carpetas de letras`);

// Para cada letra, listar los archivos JSON (excepto EXAMPLE.json y README.md)
letters.forEach(letter => {
  const letterDir = path.join(landmarksDir, letter);
  const files = fs.readdirSync(letterDir)
    .filter(file => file.endsWith('.json') && file !== 'EXAMPLE.json')
    .sort();

  if (files.length > 0) {
    manifest[letter] = files;
    console.log(`  ${letter}: ${files.length} archivos`);
  }
});

// Escribir el manifest
const manifestPath = path.join(landmarksDir, 'manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

console.log(`\n✓ Manifest generado: ${manifestPath}`);
console.log(`✓ Total de letras: ${Object.keys(manifest).length}`);
console.log(`✓ Total de archivos: ${Object.values(manifest).reduce((sum, files) => sum + files.length, 0)}`);
