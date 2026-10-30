/**
 * Archivo: backend/src/utils/tokens.js
 * Descripción: Emisión, validación, rotación y revocación de JWT y Refresh Tokens.
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
exports.sha256 = sha256;

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'skilltrack_jwt_secret_key_2026_segura';

const signAccess = (user) => {
  const roleName = user.role_name || user.role || (user.role_id === 1 ? 'admin' : user.role_id === 2 ? 'instructor' : 'student');
  return jwt.sign({ sub: user.id, role: roleName }, JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  });
};

async function issueRefresh(userId, deviceInfo = 'React Native Android') {
  const token = crypto.randomBytes(48).toString('hex');
  const days = Number(process.env.REFRESH_DAYS) || 30;
  const expires = new Date(Date.now() + days * 864e5);
  await db.execute(
    'INSERT INTO refresh_tokens (user_id, token_hash, device_info, expires_at) VALUES (?, ?, ?, ?)',
    [userId, sha256(token), String(deviceInfo || 'App Móvil').slice(0, 250), expires]
  );
  return token;
}

exports.consumeRefresh = async (token) => {
  if (!token) return null;
  const [rows] = await db.execute(
    'SELECT id, user_id FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()',
    [sha256(token)]
  );
  if (!rows.length) return null;
  await db.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [rows[0].id]);
  return rows[0].user_id;
};

exports.revokeRefresh = (token) =>
  db.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL', [sha256(token)]);

exports.revokeAllForUser = (userId) =>
  db.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [userId]);

exports.listActiveSessions = async (userId) => {
  const [rows] = await db.execute(
    `SELECT id, device_info AS deviceInfo, created_at AS createdAt, expires_at AS expiresAt
     FROM refresh_tokens
     WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
};

exports.revokeSessionById = async (userId, sessionId) => {
  const [res] = await db.execute(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
    [sessionId, userId]
  );
  return res.affectedRows > 0;
};

exports.issueSession = async (user, deviceInfo) => ({
  accessToken: signAccess(user),
  refreshToken: await issueRefresh(user.id, deviceInfo),
});
