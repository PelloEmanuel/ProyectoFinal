/**
 * Archivo: backend/src/middlewares/error.js
 * Descripción: Manejo centralizado de rutas inexistentes (404) y excepciones (errorHandler).
 * Nunca expone trazas internas ni sentencias SQL al cliente.
 */
exports.notFound = (req, res) =>
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
    error: { code: 'NOT_FOUND', message: 'El recurso solicitado no existe' },
  });

// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, next) => {
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success: false,
      message: 'El registro ya existe en el sistema',
      error: { code: 'CONFLICT', message: 'El registro ya existe en el sistema' },
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Formato JSON inválido en la petición',
      error: { code: 'INVALID_JSON', message: 'Formato JSON inválido en la petición' },
    });
  }

  const status = err.status || 500;
  if (status >= 500 && process.env.NODE_ENV !== 'test') {
    console.error('[ERROR INTERNO]', err.message);
  }

  const safeMessage = status >= 500 ? 'Error interno del servidor' : err.message;
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
