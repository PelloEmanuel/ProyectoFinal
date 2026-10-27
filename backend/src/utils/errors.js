/** Error controlado con código HTTP. */
class AppError extends Error {
  constructor(message, status = 400, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

/** Envuelve handlers async para delegar errores al middleware global. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { AppError, asyncHandler };
