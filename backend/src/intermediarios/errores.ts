// Importa los tipos de solicitud, respuesta y siguiente middleware de Express.
import { Request, Response, NextFunction } from 'express';

// Responde con estado HTTP 404 cuando se solicita una ruta que no existe en la API.
export const notFound = (_req: Request, res: Response): Response =>
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
    error: { code: 'NOT_FOUND', message: 'El recurso solicitado no existe' },
  });

// Gestiona de forma centralizada todas las excepciones capturadas sin exponer trazas SQL internas.
export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction): Response | void => {
  // Traduce errores de clave duplicada de MySQL / TiDB al código HTTP 409 Conflict.
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success: false,
      message: 'El registro ya existe en el sistema',
      error: { code: 'CONFLICT', message: 'El registro ya existe en el sistema' },
    });
  }

  // Traduce errores de sintaxis en cuerpos JSON malformados al código HTTP 400 Bad Request.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Formato JSON inválido en la petición',
      error: { code: 'INVALID_JSON', message: 'Formato JSON inválido en la petición' },
    });
  }

  const status: number = err.status || 500;
  if (status >= 500 && process.env.NODE_ENV !== 'test') {
    console.error('[ERROR INTERNO]', err.message);
  }

  const safeMessage: string = status >= 500 ? 'Error interno del servidor' : err.message;
  res.status(status).json({
    success: false,
    message: safeMessage,
    error: {
      code: err.code || (status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'ERROR'),
      message: safeMessage,
      details: err.details || err.errors || null,
    },
    ...(err.errors && { errors: err.errors }),
  });
};
