import bcrypt from 'bcryptjs';
import db from '../configuracion/baseDatos';

// Configura el rol de preceptor, la tabla de registros de asistencia y el usuario preceptor inicial.
async function setup(): Promise<void> {
  try {
    // Asegura que el rol de preceptor exista en la tabla roles.
    await db.execute(`
      INSERT INTO roles (id, name, description)
      VALUES (4, 'preceptor', 'Preceptor/a escolar encargado de asistencia y control de cursos')
      ON DUPLICATE KEY UPDATE name = 'preceptor', description = 'Preceptor/a escolar encargado de asistencia y control de cursos'
    `);
    console.log('Rol preceptor preparado.');

    // Crea la tabla registros_asistencia si aún no existe en la base de datos.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS registros_asistencia (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        school_year INT UNSIGNED NOT NULL,
        course_division INT UNSIGNED NOT NULL,
        student_id INT UNSIGNED NOT NULL,
        date DATE NOT NULL,
        status ENUM('presente', 'falta_completa', 'media_falta', 'cuarto_falta', 'justificada', 'nulo') NOT NULL DEFAULT 'presente',
        notes VARCHAR(255) NULL,
        recorded_by INT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_student_date (student_id, date),
        INDEX idx_group_date (school_year, course_division, date),
        CONSTRAINT fk_att_student FOREIGN KEY (student_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        CONSTRAINT fk_att_recorder FOREIGN KEY (recorded_by) REFERENCES usuarios(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('Tabla registros_asistencia preparada.');

    // Crea o actualiza la cuenta institucional del preceptor general en la tabla usuarios.
    const hash = await bcrypt.hash('Password123!', 10);
    const [existingPreceptor] = await db.execute<any[]>('SELECT id FROM usuarios WHERE email = ?', ['preceptor@skilltrack.edu']);
    if (!existingPreceptor.length) {
      await db.execute(
        `INSERT INTO usuarios (role_id, first_name, last_name, email, password_hash, email_verified_at, status)
         VALUES (4, 'Preceptor', 'General', 'preceptor@skilltrack.edu', ?, NOW(), 'active')`,
        [hash]
      );
      console.log('Usuario preceptor creado: preceptor@skilltrack.edu / Password123!');
    } else {
      await db.execute('UPDATE usuarios SET role_id = 4 WHERE id = ?', [existingPreceptor[0].id]);
      console.log('Usuario preceptor@skilltrack.edu actualizado con role_id = 4.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error al configurar preceptor:', err);
    process.exit(1);
  }
}

setup();
