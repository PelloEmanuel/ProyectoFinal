const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
exports.sha256 = sha256;

/** Access token JWT de corta duración. */
const signAccess = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  });

/** Refresh token opaco, guardado hasheado en BD (se puede revocar). */
async function issueRefresh(userId) {
  const token = crypto.randomBytes(48).toString('hex');
  const days = Number(process.env.REFRESH_DAYS) || 30;
  const expires = new Date(Date.now() + days * 864e5);
  await db.execute('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?,?,?)', [
    userId,
    sha256(token),
    expires,
  ]);
  return token;
}

/** Valida y revoca (rotación) un refresh token. Devuelve user_id o null. */
exports.consumeRefresh = async (token) => {
  const [rows] = await db.execute(
    'SELECT id, user_id FROM refresh_tokens WHERE token_hash=? AND revoked=0 AND expires_at>?',
    [sha256(token), new Date()]
  );
  if (!rows.length) return null;
  await db.execute('UPDATE refresh_tokens SET revoked=1 WHERE id=?', [rows[0].id]);
  return rows[0].user_id;
};

exports.revokeRefresh = (token) =>
  db.execute('UPDATE refresh_tokens SET revoked=1 WHERE token_hash=?', [sha256(token)]);

exports.revokeAllForUser = (userId) =>
  db.execute('UPDATE refresh_tokens SET revoked=1 WHERE user_id=?', [userId]);

exports.issueSession = async (user) => ({
  accessToken: signAccess(user),
  refreshToken: await issueRefresh(user.id),
});
