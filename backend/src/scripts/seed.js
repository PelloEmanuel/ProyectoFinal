/**
 * Archivo: backend/src/scripts/seed.js
 * Descripción: Crea o actualiza los 3 usuarios de prueba por rol en PostgreSQL.
 * Se conecta con: backend/src/config/db.js y backend/src/scripts/init-db.js.
 * Uso en PowerShell: npm run seed
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const initDatabase = require('./init-db');

const users = [
  ['Admin TaskFlow', 'admin@taskflow.test', 'Admin123!', 'admin'],
  ['Sofía Supervisora', 'manager@taskflow.test', 'Manager123!', 'manager'],
  ['Ulises Usuario', 'user@taskflow.test', 'User1234!', 'user'],
];

(async () => {
  await initDatabase({ closePool: false });
  for (const [name, email, pass, role] of users) {
    const hash = await bcrypt.hash(pass, 10);
    await db.execute(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role`,
      [name, email, hash, role]
    );
    console.log(`OK ${role.padEnd(7)} ${email} / ${pass}`);
  }
  await db.pool.end();
  process.exit(0);
})().catch((e) => {
  console.error('Error en seed:', e.message);
  process.exit(1);
});
