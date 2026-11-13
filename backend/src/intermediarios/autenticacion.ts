// Importa la librería de verificación JWT, el acceso a base de datos y las utilidades de error.
import jwt from 'jsonwebtoken';
import { Response, NextFunction } from 'express';
import db from '../configuracion/baseDatos';
import { AppError, asyncHandler } from '../utilidades/errores';
import { RolUsuario, SolicitudAutenticada } from '../tipos';

// Define la consulta SQL para recuperar un usuario activo y su rol desde las tablas en español.
const USER_SQL = `
  SELECT u.id, u.first_name, u.last_name, u.email, u.status, u.role_id, r.name AS role_name
  FROM usuarios u
  JOIN roles r ON r.id = u.role_id
  WHERE u.id = ? AND u.deleted_at IS NULL`;

// Define la clave secreta utilizada para validar los tokens de acceso JWT.
const JWT_SECRET: string = process.env.JWT_ACCESS_SECRET || 'skilltrack_jwt_secret_key_2026_segura';

// Verifica el token Bearer de la cabecera Authorization y adjunta el usuario autenticado a la solicitud.
export const authenticate = asyncHandler(async (req: SolicitudAutenticada, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError('Autenticación requerida', 401, 'AUTH_REQUIRED');

  let payload: any;
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
    role: u.role_name as RolUsuario,
    roleId: u.role_id,
    email: u.email,
    name: `${u.first_name} ${u.last_name}`.trim(),
  };
  next();
});

// Intenta autenticar al usuario si envía un token Bearer válido o continúa como visitante si no lo envía.
export const optionalAuth = asyncHandler(async (req: SolicitudAutenticada, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload: any = jwt.verify(token, JWT_SECRET);
    const [rows] = await db.execute(USER_SQL, [payload.sub]);
    if (rows.length && rows[0].status !== 'suspended') {
      req.user = {
        id: rows[0].id,
        role: rows[0].role_name as RolUsuario,
        roleId: rows[0].role_id,
        email: rows[0].email,
        name: `${rows[0].first_name} ${rows[0].last_name}`.trim(),
      };
    }
  } catch {
    // Continúa sin usuario autenticado cuando la ruta admite acceso público opcional.
  }
  next();
});

// Restringe el acceso a una ruta permitiendo únicamente a los usuarios que posean uno de los roles indicados.
export const authorize =
  (...roles: string[]) =>
  (req: SolicitudAutenticada, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('No tenés permisos para realizar esta acción', 403, 'FORBIDDEN'));
    }
    next();
  };
