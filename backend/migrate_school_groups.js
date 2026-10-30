const db = require('../backend/src/config/db');

async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS school_groups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      school_year INT NOT NULL,
      course_division INT NOT NULL,
      status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_group (school_year, course_division)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  const [courses] = await db.query('SELECT DISTINCT school_year, course_division FROM courses WHERE school_year IS NOT NULL');
  for (const c of courses) {
    if (c.school_year && c.course_division) {
      await db.query('INSERT IGNORE INTO school_groups (school_year, course_division, status) VALUES (?, ?, "open")', [c.school_year, c.course_division]);
    }
  }

  await db.query('INSERT IGNORE INTO school_groups (school_year, course_division, status) VALUES (6, 1, "open")');

  const [rows] = await db.query('SELECT * FROM school_groups');
  console.log('School groups table ready:', rows);
  process.exit(0);
}

migrate().catch(e => {
  console.error(e);
  process.exit(1);
});
