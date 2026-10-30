/**
 * Archivo: backend/src/middlewares/auth.js
 * Descripción: Middlewares de autenticación JWT y autorización basada en roles (RBAC).
 * Verifica que el usuario exista en MySQL, no esté eliminado ni suspendido y obtiene su rol real.
 */
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { AppError, asyncHandler } = require('../utils/errors');

const USER_SQL = `
  SELECT u.id, u.first_name, u.last_name, u.email, u.status, u.role_id, r.name AS role_name
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE u.id = ? AND u.deleted_at IS NULL`;

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'skilltrack_jwt_secret_key_2026_segura';

exports.authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError('Autenticación requerida', 401, 'AUTH_REQUIRED');

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new AppError('Sesión inválida o vencida. Iniciá sesión nuevamente.', 401, 'INVALID_TOKEN');
  }

  const [rows] = await db.execute(USER_SQL, [payload.sub]);
  if (!rows.length) throw new AppError('Usuario no encontrado', 401, 'USER_NOT_FOUND');
  const u = rows[0];
  if (u.status === 'suspended') {
    throw new AppError('Tu cuenta se encuentra suspendida. Contactá a soporte.', 403, 'ACCOUNT_SUSPENDED');
  }

  req.user = {
    id: u.id,
    role: u.role_name,
    roleId: u.role_id,
    email: u.email,
    name: `${u.first_name} ${u.last_name}`.trim(),
  };
  next();
});

exports.optionalAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const [rows] = await db.execute(USER_SQL, [payload.sub]);
    if (rows.length && rows[0].status !== 'suspended') {
      req.user = {
        id: rows[0].id,
        role: rows[0].role_name,
        roleId: rows[0].role_id,
        email: rows[0].email,
        name: `${rows[0].first_name} ${rows[0].last_name}`.trim(),
      };
    }
  } catch {
    // Token inválido en ruta pública opcional: continuar como visitante
  }
  next();
});

exports.authorize =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('No tenés permisos para realizar esta acción', 403, 'FORBIDDEN'));
    }
    next();
  };
