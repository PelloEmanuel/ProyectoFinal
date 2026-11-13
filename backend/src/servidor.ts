import dotenv from 'dotenv';
import http from 'http';
import { execSync } from 'child_process';
import app from './aplicacion';
import db from './configuracion/baseDatos';
import initDatabase from './programas/iniciarBaseDatos';

// Carga las variables de entorno y fija el huso horario de Argentina.
dotenv.config();
process.env.TZ = 'America/Argentina/Buenos_Aires';

// Define el puerto de escucha del servidor HTTP.
const port = Number(process.env.PORT) || 3000;

// Libera automáticamente el puerto en sistemas Windows si una instancia previa quedó bloqueada.
function freePortWindows(targetPort: number): boolean {
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

// Inicia el servidor HTTP y gestiona posibles colisiones de puerto ocupado.
function startListening(retried = false): void {
  const server = http.createServer(app);

  // Captura errores de apertura de puerto y reintenta tras liberar el puerto en Windows.
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && !retried) {
      console.log(`Puerto ${port} en uso por una instancia previa. Liberando puerto automáticamente...`);
      freePortWindows(port);
      setTimeout(() => startListening(true), 500);
      return;
    }
    console.error(`Error al iniciar el servidor en el puerto ${port}:`, err.message);
    process.exit(1);
  });

  // Pone el servidor a escuchar peticiones en todas las interfaces de red.
  server.listen(port, '0.0.0.0', () => {
    console.log(`Campus API escuchando en http://0.0.0.0:${port}`);
  });
}

// Verifica la conexión con la base de datos e inicia el servidor HTTP.
(async () => {
  try {
    if (process.env.AUTO_INIT_DB !== 'false') {
      await initDatabase();
    }
    await db.query('SELECT 1');
    startListening(false);
  } catch (e: any) {
    console.error('No se pudo conectar o inicializar MySQL para Campus:', e.message);
    process.exit(1);
  }
})();
