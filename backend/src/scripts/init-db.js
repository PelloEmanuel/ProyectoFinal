/**
 * Archivo: backend/src/scripts/init-db.js
 * Descripción: Crea la base de datos MySQL 'skilltrack', aplica la estructura (schema.sql),
 * ejecuta migraciones idempotentes para el modo Campus Escolar y carga los datos base (seed.sql).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function safeExec(conn, sql) {
  try {
    await conn.query(sql);
  } catch {
    // Columna o índice ya existente
  }
}

async function initDatabase() {
  const schemaPath = path.join(__dirname, '../../sql/schema.sql');
  const seedPath = path.join(__dirname, '../../sql/seed.sql');

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const seedSql = fs.readFileSync(seedPath, 'utf8');

  const connConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  };

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
    await conn.query(schemaSql);

    // Migraciones idempotentes sobre tablas preexistentes para Campus Escolar (1° a 6° Año, 1° a 3° Curso)
    await conn.query('USE skilltrack');
    await safeExec(conn, 'ALTER TABLE users ADD COLUMN created_by_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER two_factor_enabled');
    await safeExec(conn, 'ALTER TABLE users ADD COLUMN school_year TINYINT UNSIGNED NULL AFTER created_by_admin');
    await safeExec(conn, 'ALTER TABLE users ADD COLUMN course_division TINYINT UNSIGNED NULL AFTER school_year');
    await safeExec(conn, 'ALTER TABLE courses MODIFY COLUMN instructor_id INT UNSIGNED NULL');
    await safeExec(conn, 'ALTER TABLE courses ADD COLUMN subject_id INT UNSIGNED NULL AFTER category_id');
    await safeExec(conn, 'ALTER TABLE courses ADD COLUMN school_year TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER subject_id');
    await safeExec(conn, 'ALTER TABLE courses ADD COLUMN course_division TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER school_year');
    await safeExec(conn, 'ALTER TABLE lessons ADD COLUMN attachments JSON NULL AFTER content');
    await safeExec(conn, 'ALTER TABLE assignments ADD COLUMN attachments JSON NULL AFTER description');
    await safeExec(conn, 'ALTER TABLE assignments ADD COLUMN allow_late_submissions TINYINT(1) NOT NULL DEFAULT 1 AFTER due_at');
    await safeExec(conn, 'ALTER TABLE assignment_attempts ADD COLUMN is_late TINYINT(1) NOT NULL DEFAULT 0 AFTER status');
    await safeExec(conn, 'ALTER TABLE assignment_attempts ADD COLUMN attachments JSON NULL AFTER submission_text');
    await safeExec(conn, 'ALTER TABLE announcements ADD COLUMN attachments JSON NULL AFTER content');
    await safeExec(
      conn,
      `CREATE TABLE IF NOT EXISTS feed_comments (
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
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`
    );
    await safeExec(conn, "ALTER TABLE assignments MODIFY COLUMN assignment_type ENUM('multiple_choice','true_false','short_answer','text_submission','file_submission') NOT NULL DEFAULT 'file_submission'");
    await safeExec(
      conn,
      'INSERT IGNORE INTO school_subjects (name, description, category_id) SELECT DISTINCT title, short_description, category_id FROM courses'
    );

    await conn.query(seedSql);
    console.log('SkillTrack: Base de datos MySQL inicializada correctamente (schema.sql + seed.sql).');
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  initDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error al inicializar MySQL:', err.message);
      process.exit(1);
    });
}

module.exports = initDatabase;
