/**
 * Archivo: backend/src/scripts/init-db.js
 * Descripción: Inicializa la base de datos PostgreSQL ejecutando sql/schema.sql
 * y sql/seed.sql dentro de una transacción, sin necesitar el comando psql en Windows.
 * Se conecta con: backend/src/config/db.js, backend/sql/schema.sql y backend/sql/seed.sql.
 * Uso en PowerShell: npm run init-db
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

async function initDatabase({ closePool = false } = {}) {
  const schemaPath = path.join(__dirname, '../../sql/schema.sql');
  const seedPath = path.join(__dirname, '../../sql/seed.sql');

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const seedSql = fs.readFileSync(seedPath, 'utf8');

  await db.withTransaction(async (tx) => {
    await tx.raw(schemaSql);
    await tx.raw(seedSql);
  });

  console.log('Base de datos PostgreSQL inicializada (schema.sql + seed.sql aplicados correctamente).');
  if (closePool) await db.pool.end();
}

if (require.main === module) {
  initDatabase({ closePool: true })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error al inicializar PostgreSQL:', err.message);
      process.exit(1);
    });
}

module.exports = initDatabase;
