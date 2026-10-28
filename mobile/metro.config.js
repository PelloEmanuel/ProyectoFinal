/**
 * Configuración de Metro Bundler (Expo).
 * 1) Reenvía (proxy) las peticiones /api/v1 y /health al backend local (127.0.0.1:3000)
 *    usando el mismo puerto 8081 o túnel de Expo, para que funcione en cualquier Wi-Fi.
 * 2) Si el backend en el puerto 3000 está apagado, lo inicia automáticamente en segundo plano.
 */
const { getDefaultConfig } = require('expo/metro-config');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const BACKEND_PORT = Number(process.env.BACKEND_PORT) || 3000;
let backendBooting = false;

/** Verifica si el puerto 3000 está activo; si no, levanta el backend automáticamente. */
function ensureBackendRunning() {
  if (backendBooting) return;
  const socket = new net.Socket();
  socket.setTimeout(600);
  socket.once('connect', () => socket.destroy());
  socket.once('error', () => {
    socket.destroy();
    backendBooting = true;
    const backendDir = path.resolve(__dirname, '../backend');
    const child = spawn(process.execPath, ['src/server.js'], {
      cwd: backendDir,
      stdio: 'ignore',
      detached: true,
    });
    child.unref();
    setTimeout(() => { backendBooting = false; }, 4000);
  });
  socket.connect(BACKEND_PORT, '127.0.0.1');
}

ensureBackendRunning();

const config = getDefaultConfig(__dirname);

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      if (req.url && (req.url.startsWith('/api/v1') || req.url === '/health')) {
        ensureBackendRunning();
        const proxyReq = http.request(
          {
            hostname: '127.0.0.1',
            port: BACKEND_PORT,
            path: req.url,
            method: req.method,
            headers: { ...req.headers, host: `127.0.0.1:${BACKEND_PORT}` },
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
            proxyRes.pipe(res, { end: true });
          }
        );
        proxyReq.on('error', () => {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Iniciando servidor backend, intentá de nuevo en 2 segundos...' }));
        });
        req.pipe(proxyReq, { end: true });
        return;
      }
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
