/**
 * Archivo: backend/src/server.js
 * Descripción: Punto de entrada del servidor HTTP Express.
 * Verifica la conexión a PostgreSQL, inicializa las tablas y datos base si aún no existen
 * (ideal para el plan gratuito de Render donde no hay consola interactiva) y levanta la API.
 * Se conecta con: backend/src/app.js, backend/src/config/db.js y backend/src/scripts/init-db.js.
 */
require('dotenv').config();
const app = require('./app');
const db = require('./config/db');
const initDatabase = require('./scripts/init-db');

const port = process.env.PORT || 3000;

(async () => {
  try {
    await db.query('SELECT 1');
    if (process.env.AUTO_INIT_DB !== 'false') {
      await initDatabase({ closePool: false });
    }
    app.listen(port, '0.0.0.0', () => console.log(`TaskFlow API (PostgreSQL) en http://0.0.0.0:${port}`));
  } catch (e) {
    console.error('No se pudo conectar a PostgreSQL:', e.message);
    process.exit(1);
  }
})();
