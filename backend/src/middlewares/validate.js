/**
 * Archivo: backend/src/middlewares/validate.js
 * Descripción: Middleware que verifica los resultados de express-validator y devuelve 422.
 */
const { validationResult } = require('express-validator');

module.exports = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const errors = result.array().map((e) => ({ field: e.path, message: e.msg }));
  res.status(422).json({
    success: false,
    message: errors[0].message,
    errors,
    error: {
      code: 'VALIDATION_ERROR',
      message: errors[0].message,
      details: errors,
    },
  });
};
