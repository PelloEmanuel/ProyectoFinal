/**
 * Archivo: backend/src/server.js
 * Descripción: Punto de entrada del servidor HTTP del Campus (Node.js + Express + MySQL).
 * Incluye manejo automático de puerto ocupado (EADDRINUSE) para evitar colisiones en Windows.
 */
require('dotenv').config();
process.env.TZ = 'America/Argentina/Buenos_Aires';
const http = require('http');
const { execSync } = require('child_process');
const app = require('./app');
const db = require('./config/db');
const initDatabase = require('./scripts/init-db');

const port = Number(process.env.PORT) || 3000;

function freePortWindows(targetPort) {
  try {
    const output = execSync(`netstat -ano | findstr :${targetPort}`, { encoding: 'utf8' });
    const lines = output.split(/\r?\n/).filter((l) => l.includes('LISTENING'));
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
      if (pid && pid !== process.pid) {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      }
    }
    return true;
  } catch {
    return false;
  }
}

function startListening(retried = false) {
  const server = http.createServer(app);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && !retried) {
      console.log(`Puerto ${port} en uso por una instancia previa. Liberando puerto automáticamente...`);
      freePortWindows(port);
      setTimeout(() => startListening(true), 500);
      return;
    }
    console.error(`Error al iniciar el servidor en el puerto ${port}:`, err.message);
    process.exit(1);
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`Campus API escuchando en http://0.0.0.0:${port}`);
  });
}

(async () => {
  try {
    if (process.env.AUTO_INIT_DB !== 'false') {
      await initDatabase();
    }
    await db.query('SELECT 1');
    startListening(false);
  } catch (e) {
    console.error('No se pudo conectar o inicializar MySQL para Campus:', e.message);
    process.exit(1);
  }
})();
