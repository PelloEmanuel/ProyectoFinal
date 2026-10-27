const { validationResult } = require('express-validator');

/** Devuelve 422 con el detalle por campo si fallaron las validaciones. */
module.exports = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const errors = result.array().map((e) => ({ field: e.path, message: e.msg }));
  res.status(422).json({ message: errors[0].message, errors });
};
