const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/db');
const { AppError, asyncHandler } = require('../utils/errors');
const tokens = require('../utils/tokens');
const { sendOtp } = require('../utils/mailer');
const social = require('../utils/social');
const { publicUser } = require('../utils/serializers');

const findById = async (id) => (await db.execute('SELECT * FROM users WHERE id=?', [id]))[0][0];
const session = async (user) => ({ user: publicUser(user), ...(await tokens.issueSession(user)) });

/** Genera y envía un código de 6 dígitos (vence en 10 min, invalida los anteriores). */
async function startOtp(user) {
  const code = crypto.randomInt(100000, 1000000).toString();
  await db.execute('UPDATE otp_codes SET used=1 WHERE user_id=? AND used=0', [user.id]);
  await db.execute('INSERT INTO otp_codes (user_id, code_hash, expires_at) VALUES (?,?,?)', [
    user.id,
    tokens.sha256(code + user.id),
    new Date(Date.now() + 10 * 60 * 1000),
  ]);
  await sendOtp(user.email, code);
}

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, twoFactorEnabled = false } = req.body;
  const [exists] = await db.execute('SELECT id FROM users WHERE email=?', [email]);
  if (exists.length) throw new AppError('El email ya está registrado', 409);
  const hash = await bcrypt.hash(password, 10);
  // El rol siempre es "user": los roles superiores los asigna un administrador.
  const [r] = await db.execute(
    'INSERT INTO users (name,email,password_hash,role,two_factor_enabled) VALUES (?,?,?,?,?)',
    [name, email, hash, 'user', twoFactorEnabled ? 1 : 0]
  );
  res.status(201).json(await session(await findById(r.insertId)));
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await db.execute('SELECT * FROM users WHERE email=?', [email]);
  const user = rows[0];
  if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash)))
    throw new AppError('Email o contraseña incorrectos', 401);
  if (!user.is_active) throw new AppError('Tu cuenta está desactivada', 403);

  if (user.two_factor_enabled) {
    await startOtp(user);
    return res.status(202).json({
      twoFactorRequired: true,
      userId: user.id,
      message: 'Te enviamos un código de verificación a tu email',
    });
  }
  res.json(await session(user));
});

exports.verifyTwoFactor = asyncHandler(async (req, res) => {
  const { userId, code } = req.body;
  const [rows] = await db.execute(
    'SELECT * FROM otp_codes WHERE user_id=? AND used=0 AND expires_at>? ORDER BY id DESC LIMIT 1',
    [userId, new Date()]
  );
  const otp = rows[0];
  if (!otp) throw new AppError('El código venció. Pedí uno nuevo', 401);
  if (otp.attempts >= 5) throw new AppError('Demasiados intentos. Pedí un código nuevo', 429);
  if (otp.code_hash !== tokens.sha256(String(code) + userId)) {
    await db.execute('UPDATE otp_codes SET attempts=attempts+1 WHERE id=?', [otp.id]);
    throw new AppError('Código incorrecto', 401);
  }
  await db.execute('UPDATE otp_codes SET used=1 WHERE id=?', [otp.id]);
  const user = await findById(userId);
  if (!user || !user.is_active) throw new AppError('Cuenta no disponible', 403);
  res.json(await session(user));
});

exports.resendTwoFactor = asyncHandler(async (req, res) => {
  const user = await findById(req.body.userId);
  if (user && user.two_factor_enabled && user.is_active) await startOtp(user);
  // Respuesta idéntica exista o no el usuario (no filtra información)
  res.json({ message: 'Si la cuenta existe, enviamos un nuevo código' });
});

exports.socialLogin = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const profile = await social.getProfile(provider, req.body);

  const [links] = await db.execute(
    'SELECT u.* FROM social_accounts s JOIN users u ON u.id=s.user_id WHERE s.provider=? AND s.provider_id=?',
    [provider, profile.id]
  );
  let user = links[0];
  if (!user) {
    if (!profile.email) throw new AppError('El proveedor no compartió un email verificado', 400);
    // Si ya existe un usuario con ese email se vincula; si no, se crea con rol "user".
    user = (await db.execute('SELECT * FROM users WHERE email=?', [profile.email]))[0][0];
    if (!user) {
      const [r] = await db.execute('INSERT INTO users (name,email,role,avatar_url) VALUES (?,?,?,?)', [
        profile.name || profile.email.split('@')[0],
        profile.email,
        'user',
        profile.avatar || null,
      ]);
      user = await findById(r.insertId);
    }
    await db.execute('INSERT INTO social_accounts (user_id, provider, provider_id) VALUES (?,?,?)', [
      user.id,
      provider,
      profile.id,
    ]);
  }
  if (!user.is_active) throw new AppError('Tu cuenta está desactivada', 403);
  res.json(await session(user));
});

exports.refresh = asyncHandler(async (req, res) => {
  const userId = await tokens.consumeRefresh(req.body.refreshToken);
  if (!userId) throw new AppError('Sesión vencida, iniciá sesión nuevamente', 401);
  const user = await findById(userId);
  if (!user || !user.is_active) throw new AppError('Cuenta no disponible', 401);
  res.json(await tokens.issueSession(user));
});

exports.logout = asyncHandler(async (req, res) => {
  if (req.body.refreshToken) await tokens.revokeRefresh(req.body.refreshToken);
  res.status(204).end();
});
