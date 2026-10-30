/**
 * Archivo: backend/src/scripts/seed.js
 * Descripción: Inicializa el esquema y regenera los usuarios de demostración de SkillTrack.
 * Uso: npm run seed
 */
require('dotenv').config();
const initDatabase = require('./init-db');

(async () => {
  await initDatabase();
  console.log('\nCuentas de demostración listas en SkillTrack:');
  console.log('  [Administrador] admin@skilltrack.edu      / Admin123!');
  console.log('  [Instructor 1]  instructor@skilltrack.edu / Instructor123!');
  console.log('  [Instructor 2]  ana.docente@skilltrack.edu/ Instructor123!');
  console.log('  [Estudiante]    estudiante@skilltrack.edu / Estudiante123!');
  process.exit(0);
})().catch((e) => {
  console.error('Error en seed:', e.message);
  process.exit(1);
});
