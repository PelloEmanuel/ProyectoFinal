import db from './src/configuracion/baseDatos';

// Asegura la existencia de la tabla grupos_escolares y migra las divisiones existentes desde la tabla cursos.
async function migrate(): Promise<void> {
  // Crea la tabla grupos_escolares si no existe en la base de datos.
  await db.query(`
    CREATE TABLE IF NOT EXISTS grupos_escolares (
      id INT AUTO_INCREMENT PRIMARY KEY,
      school_year INT NOT NULL,
      course_division INT NOT NULL,
      status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_group (school_year, course_division)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Sincroniza los años y divisiones presentes en la tabla cursos hacia grupos_escolares.
  const [courses] = await db.query<any[]>('SELECT DISTINCT school_year, course_division FROM cursos WHERE school_year IS NOT NULL');
  for (const c of courses) {
    if (c.school_year && c.course_division) {
      await db.query('INSERT IGNORE INTO grupos_escolares (school_year, course_division, status) VALUES (?, ?, "open")', [
        c.school_year,
        c.course_division,
      ]);
    }
  }

  // Asegura que el grupo escolar 6° 1ª se encuentre registrado y abierto.
  await db.query('INSERT IGNORE INTO grupos_escolares (school_year, course_division, status) VALUES (6, 1, "open")');

  const [rows] = await db.query<any[]>('SELECT * FROM grupos_escolares');
  console.log('Tabla grupos_escolares preparada:', rows);
  process.exit(0);
}

// Ejecuta la migración y maneja posibles errores de conexión.
migrate().catch((e: any) => {
  console.error(e);
  process.exit(1);
});
