const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { AppError, asyncHandler } = require('../utils/errors');

/** Exige un access token válido y un usuario activo. Deja req.user = { id, role }. */
exports.authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError('Token requerido', 401);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch {
    throw new AppError('Token inválido o vencido', 401);
  }
  const [rows] = await db.execute('SELECT id, role, is_active FROM users WHERE id=?', [payload.sub]);
  if (!rows.length || !rows[0].is_active) throw new AppError('Usuario no autorizado', 401);
  req.user = { id: rows[0].id, role: rows[0].role }; // el rol sale de la BD, no del token
  next();
});

/** Restringe un endpoint a ciertos roles: authorize('admin', 'manager'). */
exports.authorize =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role) ? next() : next(new AppError('No tenés permisos para esta acción', 403));
