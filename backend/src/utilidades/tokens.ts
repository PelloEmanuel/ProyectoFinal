// Importa las librerías criptográficas y de firma de JSON Web Tokens junto con la conexión a base de datos.
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../configuracion/baseDatos';
import { FilaUsuarioBD, ParTokensSesion } from '../tipos';

// Define la estructura de una sesión activa almacenada en la tabla tokens_renovacion.
export interface SesionActiva {
  id: number;
  deviceInfo: string | null;
  createdAt: string | Date;
  expiresAt: string | Date;
}

// Calcula el hash SHA-256 en formato hexadecimal para proteger tokens en reposo.
export const sha256 = (s: unknown): string =>
  crypto.createHash('sha256').update(String(s)).digest('hex');

// Define la clave secreta utilizada para firmar y verificar los tokens de acceso JWT.
const JWT_SECRET: string = process.env.JWT_ACCESS_SECRET || 'skilltrack_jwt_secret_key_2026_segura';

// Firma un token JWT de corta duración con el identificador y el rol del usuario.
const signAccess = (user: Partial<FilaUsuarioBD> & { id: number }): string => {
  const roleName =
    user.role_name ||
    user.role ||
    (user.role_id === 1 ? 'admin' : user.role_id === 2 ? 'instructor' : user.role_id === 4 ? 'preceptor' : 'student');
  const options: SignOptions = {
    expiresIn: (process.env.JWT_ACCESS_EXPIRES || '15m') as any,
  };
  return jwt.sign({ sub: user.id, role: roleName }, JWT_SECRET, options);
};

// Genera un token de actualización aleatorio y guarda su hash en la tabla tokens_renovacion.
async function issueRefresh(userId: number, deviceInfo: string = 'React Native Android'): Promise<string> {
  const token = crypto.randomBytes(48).toString('hex');
  const days = Number(process.env.REFRESH_DAYS) || 30;
  const expires = new Date(Date.now() + days * 864e5);
  await db.execute(
    'INSERT INTO tokens_renovacion (user_id, token_hash, device_info, expires_at) VALUES (?, ?, ?, ?)',
    [userId, sha256(token), String(deviceInfo || 'App Móvil').slice(0, 250), expires]
  );
  return token;
}

// Consume y rota un token de actualización válido, marcándolo como revocado y devolviendo el ID del usuario.
export const consumeRefresh = async (token?: string | null): Promise<number | null> => {
  if (!token) return null;
  const [rows] = await db.execute(
    'SELECT id, user_id FROM tokens_renovacion WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()',
    [sha256(token)]
  );
  if (!rows.length) return null;
  await db.execute('UPDATE tokens_renovacion SET revoked_at = NOW() WHERE id = ?', [rows[0].id]);
  return Number(rows[0].user_id);
};

// Revoca un token de actualización específico cuando el usuario cierra su sesión.
export const revokeRefresh = (token: string): Promise<[any, any]> =>
  db.execute('UPDATE tokens_renovacion SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL', [sha256(token)]);

// Revoca todas las sesiones activas de un usuario ante un cambio de contraseña o suspensión.
export const revokeAllForUser = (userId: number): Promise<[any, any]> =>
  db.execute('UPDATE tokens_renovacion SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [userId]);

// Lista todas las sesiones activas y vigentes asociadas a un usuario.
export const listActiveSessions = async (userId: number): Promise<SesionActiva[]> => {
  const [rows] = await db.execute(
    `SELECT id, device_info AS deviceInfo, created_at AS createdAt, expires_at AS expiresAt
     FROM tokens_renovacion
     WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows as SesionActiva[];
};

// Revoca una sesión específica identificada por su ID asegurando que pertenezca al usuario autenticado.
export const revokeSessionById = async (userId: number, sessionId: number): Promise<boolean> => {
  const [res] = await db.execute(
    'UPDATE tokens_renovacion SET revoked_at = NOW() WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
    [sessionId, userId]
  );
  return res.affectedRows > 0;
};

// Emite simultáneamente un token de acceso JWT y un token de actualización para iniciar sesión.
export const issueSession = async (
  user: Partial<FilaUsuarioBD> & { id: number },
  deviceInfo?: string
): Promise<ParTokensSesion> => ({
  accessToken: signAccess(user),
  refreshToken: await issueRefresh(user.id, deviceInfo),
});
