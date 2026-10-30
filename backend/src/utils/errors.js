/**
 * Archivo: backend/src/utils/errors.js
 * Descripción: Clases y helpers para manejo consistente de errores y respuestas HTTP JSON.
 */
class AppError extends Error {
  constructor(message, status = 400, code = 'BAD_REQUEST', details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    if (Array.isArray(details)) this.errors = details;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { AppError, asyncHandler };
