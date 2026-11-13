import dotenv from 'dotenv';
import initDatabase from './iniciarBaseDatos';

// Carga las variables de entorno del proyecto.
dotenv.config();

// Ejecuta la inicialización de la base de datos y muestra las credenciales de demostración en consola.
(async () => {
  await initDatabase();
  console.log('\nCuentas de demostración listas en Campus:');
  console.log('  [Administrador] admin@skilltrack.edu      / Admin123!');
  console.log('  [Instructor 1]  instructor@skilltrack.edu / Instructor123!');
  console.log('  [Instructor 2]  ana.docente@skilltrack.edu/ Instructor123!');
  console.log('  [Estudiante]    estudiante@skilltrack.edu / Estudiante123!');
  process.exit(0);
})().catch((e: any) => {
  console.error('Error en semilla de datos:', e.message);
  process.exit(1);
});
