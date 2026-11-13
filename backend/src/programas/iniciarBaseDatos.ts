import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import mysql, { Connection } from 'mysql2/promise';

// Carga las variables de entorno desde el archivo .env.
dotenv.config();

// Ejecuta una sentencia SQL ignorando errores si la columna o el índice ya existen.
async function safeExec(conn: Connection, sql: string): Promise<void> {
  try {
    await conn.query(sql);
  } catch {
    // Ignora errores de estructura preexistente durante migraciones idempotentes.
  }
}

// Inicializa la base de datos aplicando el esquema en español, las migraciones y los datos semilla.
export async function initDatabase(): Promise<void> {
  // Resuelve las rutas de los archivos SQL de esquema y datos iniciales en español.
  const schemaPath = path.join(__dirname, '../../sql/esquema.sql');
  const seedPath = path.join(__dirname, '../../sql/semilla.sql');

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const seedSql = fs.readFileSync(seedPath, 'utf8');

  // Configura los parámetros de conexión al servidor MySQL o TiDB Cloud.
  const connConfig: mysql.ConnectionOptions = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  };

  // Activa TLS seguro si la conexión apunta a TiDB Cloud o al puerto 4000.
  if (
    process.env.DB_SSL === 'true' ||
    (process.env.DB_HOST && process.env.DB_HOST.includes('tidbcloud.com')) ||
    Number(process.env.DB_PORT) === 4000
  ) {
    connConfig.ssl = {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    };
  }

  const conn = await mysql.createConnection(connConfig);

  try {
    // Ejecuta la creación de tablas del esquema principal.
    await conn.query(schemaSql);

    // Aplica migraciones idempotentes sobre las tablas en español para garantizar compatibilidad completa.
    await conn.query('USE skilltrack');
    await safeExec(conn, 'ALTER TABLE usuarios ADD COLUMN created_by_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER two_factor_enabled');
    await safeExec(conn, 'ALTER TABLE usuarios ADD COLUMN school_year TINYINT UNSIGNED NULL AFTER created_by_admin');
    await safeExec(conn, 'ALTER TABLE usuarios ADD COLUMN course_division TINYINT UNSIGNED NULL AFTER school_year');
    await safeExec(conn, 'ALTER TABLE cursos MODIFY COLUMN instructor_id INT UNSIGNED NULL');
    await safeExec(conn, 'ALTER TABLE cursos ADD COLUMN subject_id INT UNSIGNED NULL AFTER category_id');
    await safeExec(conn, 'ALTER TABLE cursos ADD COLUMN school_year TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER subject_id');
    await safeExec(conn, 'ALTER TABLE cursos ADD COLUMN course_division TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER school_year');
    await safeExec(conn, 'ALTER TABLE cursos ADD COLUMN theme_color VARCHAR(30) NULL');
    await safeExec(conn, 'ALTER TABLE grupos_escolares ADD COLUMN access_code VARCHAR(60) NULL AFTER status');
    await safeExec(conn, 'ALTER TABLE lecciones ADD COLUMN attachments JSON NULL AFTER content');
    await safeExec(conn, 'ALTER TABLE tareas ADD COLUMN attachments JSON NULL AFTER description');
    await safeExec(conn, 'ALTER TABLE tareas ADD COLUMN allow_late_submissions TINYINT(1) NOT NULL DEFAULT 1 AFTER due_at');
    await safeExec(conn, 'ALTER TABLE entregas_tareas ADD COLUMN is_late TINYINT(1) NOT NULL DEFAULT 0 AFTER status');
    await safeExec(conn, 'ALTER TABLE entregas_tareas ADD COLUMN attachments JSON NULL AFTER submission_text');
    await safeExec(conn, 'ALTER TABLE anuncios ADD COLUMN attachments JSON NULL AFTER content');
    await safeExec(
      conn,
      `CREATE TABLE IF NOT EXISTS comentarios_tablon (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        course_id INT UNSIGNED NOT NULL,
        item_type ENUM('announcement','lesson','assignment') NOT NULL,
        item_id INT UNSIGNED NOT NULL,
        user_id INT UNSIGNED NOT NULL,
        is_private TINYINT(1) NOT NULL DEFAULT 0,
        student_id INT UNSIGNED NULL,
        message TEXT NOT NULL,
        attachments JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_feed_comm_item (item_type, item_id, is_private, student_id),
        INDEX idx_feed_comm_course (course_id),
        FOREIGN KEY (course_id) REFERENCES cursos(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES usuarios(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`
    );
    await safeExec(
      conn,
      "ALTER TABLE tareas MODIFY COLUMN assignment_type ENUM('multiple_choice','true_false','short_answer','text_submission','file_submission') NOT NULL DEFAULT 'file_submission'"
    );
    await safeExec(
      conn,
      'INSERT IGNORE INTO materias_escolares (name, description, category_id) SELECT DISTINCT title, NULL, category_id FROM cursos'
    );
    await safeExec(
      conn,
      'UPDATE materias_escolares SET description = NULL WHERE description IS NOT NULL'
    );

    // Carga los datos iniciales de semilla en la base de datos.
    await conn.query(seedSql);
    console.log('Campus: Base de datos MySQL inicializada correctamente (esquema.sql + semilla.sql).');
  } finally {
    await conn.end();
  }
}

// Permite ejecutar el programa directamente desde la línea de comandos.
if (require.main === module) {
  initDatabase()
    .then(() => process.exit(0))
    .catch((err: any) => {
      console.error('Error al inicializar MySQL:', err.message);
      process.exit(1);
    });
}

export default initDatabase;
