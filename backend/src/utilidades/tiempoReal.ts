// Importa los tipos de petición, respuesta y siguiente función de Express y la conexión a base de datos.
import { Request, Response, NextFunction } from 'express';
import db from '../configuracion/baseDatos';

// Define la estructura del evento de sincronización en tiempo real.
export interface EventoSincronizacion {
  version: number;
  method: string;
  path: string;
  timestamp: string;
}

// Mantiene en memoria la versión actual de sincronización y el conjunto de clientes SSE conectados.
let currentSyncVersion: number = Date.now();
let lastChangeInfo: EventoSincronizacion = {
  version: currentSyncVersion,
  method: 'INIT',
  path: '/',
  timestamp: new Date().toISOString(),
};
const clientesSse = new Set<Response>();

// Emite una notificación instantánea a todos los dispositivos conectados cuando ocurre un cambio en el servidor.
export function notificarCambioTiempoReal(method: string = 'UPDATE', path: string = '/'): void {
  // Actualiza la marca de tiempo de versión y construye el paquete de datos del evento.
  currentSyncVersion = Date.now();
  lastChangeInfo = {
    version: currentSyncVersion,
    method: method.toUpperCase(),
    path,
    timestamp: new Date(currentSyncVersion).toISOString(),
  };

  // Persiste de forma asíncrona la última versión en ajustes_plataforma sin bloquear el hilo principal.
  db.execute(
    `INSERT INTO ajustes_plataforma (setting_key, setting_value)
     VALUES ('last_sync_version', ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [String(currentSyncVersion)]
  ).catch(() => {});

  // Transmite el evento en vivo a cada navegador o aplicación móvil suscrita por Server-Sent Events.
  const payload = `data: ${JSON.stringify(lastChangeInfo)}\n\n`;
  for (const cliente of clientesSse) {
    try {
      cliente.write(payload);
    } catch {
      clientesSse.delete(cliente);
    }
  }
}

// Intercepta todas las peticiones de escritura exitosas (POST, PUT, PATCH, DELETE) para disparar la actualización en tiempo real.
export function intermediarioMutacionTiempoReal(req: Request, res: Response, next: NextFunction): void {
  const method = (req.method || '').toUpperCase();
  const isMutation = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';

  if (isMutation && req.originalUrl.startsWith('/api/v1')) {
    const cleanUrl = req.originalUrl.split('?')[0];
    const ignoredPaths = ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/logout'];

    if (!ignoredPaths.includes(cleanUrl)) {
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          notificarCambioTiempoReal(method, cleanUrl);
        }
      });
    }
  }

  next();
}

// Devuelve la versión actual de sincronización para consultas rápidas de estado desde dispositivos móviles y web.
export function obtenerVersionSincronizacion(_req: Request, res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.json({
    success: true,
    version: currentSyncVersion,
    data: lastChangeInfo,
  });
}

// Establece un canal persistente Server-Sent Events (SSE) para empujar cambios en tiempo real al cliente.
export function suscribirEventosTiempoReal(req: Request, res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // Envía el estado inicial inmediatamente al conectarse el dispositivo.
  res.write(`data: ${JSON.stringify(lastChangeInfo)}\n\n`);
  clientesSse.add(res);

  // Mantiene viva la conexión frente a proxies como Render enviando un latido cada 20 segundos.
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
      clientesSse.delete(res);
    }
  }, 20000);

  // Limpia la suscripción cuando el dispositivo cierra la pestaña o pierde conexión.
  req.on('close', () => {
    clearInterval(heartbeat);
    clientesSse.delete(res);
  });
}
