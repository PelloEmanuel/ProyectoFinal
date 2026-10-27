require('dotenv').config();
const app = require('./app');
const db = require('./config/db');

const port = process.env.PORT || 3000;
(async () => {
  try {
    await db.query('SELECT 1');
    app.listen(port, '0.0.0.0', () => console.log(`TaskFlow API en http://localhost:${port}`));
  } catch (e) {
    console.error('No se pudo conectar a MySQL:', e.message);
    process.exit(1);
  }
})();
