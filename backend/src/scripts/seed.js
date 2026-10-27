// Crea usuarios de prueba (uno por rol). Uso: npm run seed
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const users = [
  ['Admin TaskFlow', 'admin@taskflow.test', 'Admin123!', 'admin'],
  ['Sofía Supervisora', 'manager@taskflow.test', 'Manager123!', 'manager'],
  ['Ulises Usuario', 'user@taskflow.test', 'User1234!', 'user'],
];

(async () => {
  for (const [name, email, pass, role] of users) {
    const hash = await bcrypt.hash(pass, 10);
    await db.execute(
      `INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), password_hash=VALUES(password_hash), role=VALUES(role)`,
      [name, email, hash, role]
    );
    console.log(`OK ${role.padEnd(7)} ${email} / ${pass}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
