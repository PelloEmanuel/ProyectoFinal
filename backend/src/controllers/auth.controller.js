/**
 * Archivo: backend/src/controllers/auth.controller.js
 * Descripción: Controlador de autenticación completa para SkillTrack.
 * Soporta registro (rol inicial obligatorio: student), login, verificación de email,
 * recuperación de contraseña, OAuth 2.0 (Google, GitHub, Facebook), segundo factor TOTP
 * con códigos de recuperación y gestión de sesiones activas (JWT + Refresh Tokens).
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/db');
const { AppError, asyncHandler } = require('../utils/errors');
const tokens = require('../utils/tokens');
const totp = require('../utils/totp');
const mailer = require('../utils/mailer');
const social = require('../utils/social');
const { publicUser } = require('../utils/serializers');
const { logAudit } = require('../utils/audit');
const { syncStudentCourseEnrollments } = require('../utils/school');

const USER_QUERY = `
  SELECT u.*, r.name AS role_name
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE u.deleted_at IS NULL`;

async function findById(id) {
  const [rows] = await db.execute(`${USER_QUERY} AND u.id = ?`, [id]);
  return rows[0] || null;
}

async function findByEmail(email) {
  const [rows] = await db.execute(`${USER_QUERY} AND u.email = ?`, [String(email).trim().toLowerCase()]);
  return rows[0] || null;
}

async function buildSessionResponse(user, req) {
  const deviceInfo = req?.headers?.['user-agent'] || 'SkillTrack Android App';
  const sessionTokens = await tokens.issueSession(user, deviceInfo);
  const serialized = publicUser(user);
  return {
    success: true,
    user: serialized,
    ...sessionTokens,
    data: {
      user: serialized,
      ...sessionTokens,
    },
  };
}

function getPublicBaseUrl(req) {
  if (process.env.APP_PUBLIC_URL && !process.env.APP_PUBLIC_URL.includes('localhost')) {
    return process.env.APP_PUBLIC_URL.replace(/\/+$/, '');
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
  }
  const host = req?.get ? req.get('host') : null;
  const proto = req?.headers?.['x-forwarded-proto'] || req?.protocol || 'https';
  if (host && !host.includes('localhost')) {
    return `${proto}://${host}`;
  }
  return 'https://campus-58oe.onrender.com';
}

async function issueEmailVerificationToken(userId, email) {
  const rawToken = crypto.randomInt(100000, 1000000).toString();
  const tokenHash = tokens.sha256(`verify:${userId}:${rawToken}`);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.execute('UPDATE email_verification_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [userId]);
  await db.execute(
    'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [userId, tokenHash, expiresAt]
  );
  mailer.sendVerificationEmail(email, rawToken).catch((err) => {
    console.error(`[MAILER] Error en segundo plano enviando verificación a ${email}:`, err.message);
  });
  return { rawToken, sent: true };
}

exports.registrationStatus = asyncHandler(async (_req, res) => {
  const [[{ totalUsers }]] = await db.execute('SELECT COUNT(*) AS totalUsers FROM users WHERE deleted_at IS NULL');
  const isFirstUser = Number(totalUsers) === 0;
  res.json({
    success: true,
    isFirstUser,
    data: { isFirstUser, totalUsers: Number(totalUsers) },
  });
});

exports.register = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    name,
    username,
    email,
    password,
    acceptTerms,
    role,
    instructorKey,
    instructorCode,
    preceptorKey,
    preceptorCode,
  } = req.body;
  if (acceptTerms === false) {
    throw new AppError('Debés aceptar los términos y condiciones para crear una cuenta', 400, 'TERMS_REQUIRED');
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  // 1. Verificar si existe algún usuario previo con este correo (incluso si fue eliminado o está pendiente)
  const [anyUsers] = await db.execute('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
  if (anyUsers.length > 0) {
    const rawUser = anyUsers[0];

    // Caso A: La cuenta previa fue eliminada. La borramos de forma definitiva y limpia para permitir el nuevo registro.
    if (rawUser.deleted_at !== null) {
      await db.execute('UPDATE courses SET instructor_id = NULL WHERE instructor_id = ?', [rawUser.id]);
      await db.execute('DELETE FROM users WHERE id = ?', [rawUser.id]);
    }
    // Caso B: La cuenta existe pero NUNCA completó la verificación en 2 pasos por correo
    else if (!rawUser.email_verified_at && !rawUser.created_by_admin) {
      let resolvedFirst = (firstName || '').trim();
      let resolvedLast = (lastName || '').trim();
      if (!resolvedFirst && name) {
        const parts = String(name).trim().split(/\s+/);
        resolvedFirst = parts[0] || 'Usuario';
        resolvedLast = parts.slice(1).join(' ') || 'SkillTrack';
      }
      if (!resolvedLast) resolvedLast = 'SkillTrack';

      const newHash = await bcrypt.hash(password, 10);
      await db.execute(
        `UPDATE users 
         SET first_name = ?, last_name = ?, password_hash = ?, status = 'pending_verification'
         WHERE id = ?`,
        [resolvedFirst, resolvedLast, newHash, rawUser.id]
      );

      await issueEmailVerificationToken(rawUser.id, rawUser.email);
      return res.status(202).json({
        success: true,
        requiresVerification: true,
        twoFactorRequired: true,
        userId: rawUser.id,
        email: rawUser.email,
        message: 'Habías iniciado un registro previo. Te enviamos un nuevo código de verificación de 6 dígitos a tu casilla de correo.',
      });
    }
    // Caso C: Cuenta existente activa
    else {
      // Unificación de cuentas: si el usuario ya se había registrado con Google/GitHub/Facebook (sin contraseña manual aún),
      // vinculamos esta contraseña a la MISMA cuenta existente para que no sean cuentas distintas.
      if (!rawUser.password_hash) {
        const linkedHash = await bcrypt.hash(password, 10);
        await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [linkedHash, rawUser.id]);
        if (rawUser.role_name === 'student' && req.body.schoolYear && req.body.courseDivision) {
          const sy = Number(req.body.schoolYear);
          const cd = Number(req.body.courseDivision);
          if (sy >= 1 && sy <= 6 && cd >= 1 && cd <= 3) {
            await syncStudentCourseEnrollments(rawUser.id, sy, cd);
          }
        }
        await logAudit(rawUser.id, 'OAUTH_ACCOUNT_LINKED_PASSWORD', 'user', rawUser.id, { email: normalizedEmail });
        const unifiedUser = await findById(rawUser.id);
        return res.status(200).json(await buildSessionResponse(unifiedUser, req));
      }
      // Si ya tenía contraseña y coincide, iniciar sesión en la misma cuenta
      if (await bcrypt.compare(password, rawUser.password_hash)) {
        const unifiedUser = await findById(rawUser.id);
        return res.status(200).json(await buildSessionResponse(unifiedUser, req));
      }
      throw new AppError(
        'Este correo electrónico ya pertenece a una cuenta activa. Iniciá sesión con tu contraseña o con tu cuenta vinculada.',
        409,
        'EMAIL_EXISTS'
      );
    }
  }

  // Verificar si es el primer usuario registrado en toda la base de datos
  const [[{ totalUsers }]] = await db.execute('SELECT COUNT(*) AS totalUsers FROM users WHERE deleted_at IS NULL');
  const isFirstUser = Number(totalUsers) === 0;

  let targetRoleName = 'student';
  if (isFirstUser) {
    // El primer usuario registrado se convierte automáticamente en Administrador
    targetRoleName = 'admin';
  } else if (String(role || '').trim().toLowerCase() === 'instructor') {
    const submittedKey = String(instructorKey ?? instructorCode ?? '').trim();
    if (!submittedKey) {
      throw new AppError(
        'Debés completar el campo de clave de docente para poder registrarte e iniciar sesión como docente.',
        422,
        'INSTRUCTOR_KEY_REQUIRED',
        [{ field: 'instructorKey', message: 'Debés completar este campo con la clave de docente' }]
      );
    }

    const [keyRows] = await db.execute(
      "SELECT setting_value FROM platform_settings WHERE setting_key = 'instructor_registration_key' LIMIT 1"
    );
    const validKey = String(keyRows[0]?.setting_value || '').trim();
    if (!validKey || submittedKey !== validKey) {
      throw new AppError(
        'La clave de docente introducida es incorrecta. No se permite iniciar sesión sin la clave vigente del administrador.',
        403,
        'INVALID_INSTRUCTOR_KEY',
        [{ field: 'instructorKey', message: 'La clave de docente ingresada es incorrecta' }]
      );
    }
    targetRoleName = 'instructor';
  } else if (String(role || '').trim().toLowerCase() === 'preceptor') {
    const submittedKey = String(preceptorKey ?? preceptorCode ?? req.body?.preceptorKey ?? req.body?.preceptorCode ?? '').trim();
    if (!submittedKey) {
      throw new AppError(
        'Debés completar el campo de clave de preceptor para poder registrarte como preceptor/a.',
        422,
        'PRECEPTOR_KEY_REQUIRED',
        [{ field: 'preceptorKey', message: 'Debés completar este campo con la clave de preceptor' }]
      );
    }

    const [keyRows] = await db.execute(
      "SELECT setting_value FROM platform_settings WHERE setting_key = 'preceptor_registration_key' LIMIT 1"
    );
    const validKey = String(keyRows[0]?.setting_value || 'PRECEPTOR2026').trim();
    if (!validKey || submittedKey !== validKey) {
      throw new AppError(
        'La clave de preceptor introducida es incorrecta. Solicitá la clave institucional al administrador.',
        403,
        'INVALID_PRECEPTOR_KEY',
        [{ field: 'preceptorKey', message: 'La clave de preceptor ingresada es incorrecta' }]
      );
    }
    targetRoleName = 'preceptor';
  } else {
    targetRoleName = 'student';
  }

  let resolvedFirst = (firstName || '').trim();
  let resolvedLast = (lastName || '').trim();
  if (!resolvedFirst && name) {
    const parts = String(name).trim().split(/\s+/);
    resolvedFirst = parts[0] || 'Usuario';
    resolvedLast = parts.slice(1).join(' ') || 'SkillTrack';
  }
  if (!resolvedLast) resolvedLast = 'SkillTrack';

  // Identidad basada en Nombre y Apellido (los nombres y apellidos pueden repetirse libremente entre usuarios)
  const resolvedUsername = `${resolvedFirst} ${resolvedLast}`.trim();

  const passwordHash = await bcrypt.hash(password, 10);
  const [roleRows] = await db.execute('SELECT id FROM roles WHERE name = ? LIMIT 1', [targetRoleName]);
  const roleId = roleRows[0]?.id || (targetRoleName === 'admin' ? 1 : targetRoleName === 'instructor' ? 2 : 3);

  const [result] = await db.execute(
    `INSERT INTO users (first_name, last_name, username, email, password_hash, role_id, status, preferences)
     VALUES (?, ?, ?, ?, ?, ?, 'pending_verification', ?)`,
    [
      resolvedFirst,
      resolvedLast,
      resolvedUsername,
      normalizedEmail,
      passwordHash,
      roleId,
      JSON.stringify({ theme: 'light', notifications: true, language: 'es', acceptedTermsAt: new Date().toISOString() }),
    ]
  );

  // Si es alumno e indicó en qué año (1° a 6°) y curso (1° a 3°) se encuentra, aplicarle su curso y materias
  if (targetRoleName === 'student') {
    const sy = Number(req.body.schoolYear);
    const cd = Number(req.body.courseDivision);
    if (sy >= 1 && sy <= 6 && cd >= 1 && cd <= 3) {
      await syncStudentCourseEnrollments(result.insertId, sy, cd);
    }
  }

  const { rawToken, sent } = await issueEmailVerificationToken(result.insertId, normalizedEmail);
  const welcomeTitle =
    targetRoleName === 'admin'
      ? '¡Bienvenido/a, Administrador/a General!'
      : targetRoleName === 'instructor'
      ? '¡Bienvenido/a al equipo docente de SkillTrack!'
      : '¡Bienvenido/a a SkillTrack!';
  const welcomeBody =
    targetRoleName === 'admin'
      ? 'Por ser el primer usuario registrado, tu cuenta recibió automáticamente el rol de Administrador. Podés configurar la clave para docentes desde tu panel.'
      : targetRoleName === 'instructor'
      ? 'Tu clave de docente fue validada correctamente. Ya podés crear y publicar cursos, módulos y evaluaciones.'
      : 'Explorá el catálogo de cursos e inscribite para comenzar tu camino de aprendizaje.';

  await db.execute(
    `INSERT INTO notifications (user_id, type, title, body, resource_type, resource_id)
     VALUES (?, 'welcome', ?, ?, NULL, NULL)`,
    [result.insertId, welcomeTitle, welcomeBody]
  );
  await logAudit(result.insertId, 'USER_REGISTERED_PENDING_2FA', 'user', result.insertId, {
    email: normalizedEmail,
    role: targetRoleName,
    autoPromotedFirstUser: isFirstUser,
  });

  const response = {
    success: true,
    requiresVerification: true,
    twoFactorRequired: true,
    userId: result.insertId,
    email: normalizedEmail,
    message: 'Te enviamos un código de verificación en 2 pasos a tu correo electrónico. Ingresalo manualmente para completar tu registro.',
  };
  res.status(201).json(response);
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  let user = await findByEmail(email);
  if (!user) {
    throw new AppError('Correo electrónico o contraseña incorrectos', 401, 'INVALID_CREDENTIALS');
  }

  // Si el usuario se registró originalmente con Google/GitHub/Facebook (ej. 123@gmail.com) y no tenía contraseña manual,
  // al iniciar sesión escribiendo el mismo mail y una contraseña se vincula a esa MISMA cuenta existente.
  if (!user.password_hash) {
    if (!password || String(password).length < 6) {
      throw new AppError('Ingresá una contraseña válida para acceder a tu cuenta.', 401, 'INVALID_CREDENTIALS');
    }
    const newHash = await bcrypt.hash(String(password), 10);
    await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);
    await logAudit(user.id, 'OAUTH_ACCOUNT_LINKED_PASSWORD_ON_LOGIN', 'user', user.id, { email: user.email });
    user = await findById(user.id);
  } else if (!(await bcrypt.compare(password, user.password_hash))) {
    throw new AppError('Correo electrónico o contraseña incorrectos', 401, 'INVALID_CREDENTIALS');
  }

  if (user.status === 'suspended') {
    throw new AppError('Tu cuenta ha sido suspendida por un administrador', 403, 'ACCOUNT_SUSPENDED');
  }

  // Cuentas de ejemplo creadas por el Administrador: NO requieren verificación en 2 pasos
  if (user.created_by_admin) {
    await logAudit(user.id, 'USER_LOGIN_ADMIN_TEST_ACCOUNT', 'user', user.id, { method: 'password' });
    return res.json(await buildSessionResponse(user, req));
  }

  // Requisito obligatorio: La cuenta debe completar la verificación en 2 pasos antes de entrar
  if (!user.email_verified_at) {
    await issueEmailVerificationToken(user.id, user.email);
    const resp = {
      success: true,
      requiresVerification: true,
      twoFactorRequired: true,
      userId: user.id,
      email: user.email,
      message: 'Debés ingresar el código de verificación en 2 pasos enviado a tu correo antes de acceder al Campus.',
    };
    return res.status(202).json(resp);
  }

  // Si tiene TOTP configurado mediante app autenticadora
  const [tfRows] = await db.execute('SELECT id, enabled_at FROM user_two_factor WHERE user_id = ? AND enabled_at IS NOT NULL', [user.id]);
  if (tfRows.length > 0) {
    return res.status(202).json({
      success: true,
      twoFactorRequired: true,
      userId: user.id,
      email: user.email,
      message: 'Ingresá el código de 6 dígitos de tu aplicación autenticadora o un código de recuperación',
    });
  }

  await logAudit(user.id, 'USER_LOGIN', 'user', user.id, { method: 'password' });
  res.json(await buildSessionResponse(user, req));
});

exports.me = asyncHandler(async (req, res) => {
  const user = await findById(req.user.id);
  if (!user) throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  const serialized = publicUser(user);
  res.json({ success: true, data: serialized, ...serialized });
});

exports.verifyEmail = asyncHandler(async (req, res) => {
  const token = String(req.body.token || req.body.code || req.query.token || '').trim();
  const userId = req.body.userId || req.user?.id;
  if (!token || !userId) {
    throw new AppError('Código de verificación y usuario requeridos', 400, 'MISSING_VERIFICATION_DATA');
  }

  const tokenHash = tokens.sha256(`verify:${userId}:${token}`);
  const [rows] = await db.execute(
    `SELECT id FROM email_verification_tokens
     WHERE user_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [userId, tokenHash]
  );
  if (!rows.length) {
    throw new AppError('El código de verificación es inválido o ha vencido', 400, 'INVALID_VERIFICATION_TOKEN');
  }

  await db.execute('UPDATE email_verification_tokens SET used_at = NOW() WHERE id = ?', [rows[0].id]);
  await db.execute("UPDATE users SET email_verified_at = NOW(), two_factor_enabled = 1, status = 'active' WHERE id = ?", [userId]);
  await logAudit(userId, 'EMAIL_VERIFIED_2FA', 'user', userId);

  const updated = await findById(userId);
  const sessionResponse = await buildSessionResponse(updated, req);
  res.json({
    success: true,
    message: '¡Verificación en 2 pasos completada con éxito! Ya tenés acceso completo al Campus.',
    ...sessionResponse,
  });
});

exports.resendVerification = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.body.userId;
  const email = req.body.email;
  const user = userId ? await findById(userId) : email ? await findByEmail(email) : null;

  if (user) {
    await issueEmailVerificationToken(user.id, user.email);
    const resp = {
      success: true,
      message: 'Enviamos un nuevo código de verificación en 2 pasos a tu correo electrónico',
      userId: user.id,
      email: user.email,
    };
    return res.json(resp);
  }

  res.json({
    success: true,
    message: 'Si la cuenta existe, enviamos un nuevo código al correo registrado',
  });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await findByEmail(email);

  if (user && user.status !== 'suspended') {
    const rawCode = crypto.randomInt(100000, 1000000).toString();
    const tokenHash = tokens.sha256(`reset:${user.email}:${rawCode}`);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await db.execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [user.id]);
    await db.execute(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user.id, tokenHash, expiresAt]
    );
    mailer.sendPasswordResetEmail(user.email, rawCode).catch((err) => {
      console.error(`[MAILER] Error en segundo plano enviando reset password a ${user.email}:`, err.message);
    });
  }

  res.json({
    success: true,
    message: 'Si el correo está registrado, recibirás un código temporal para restablecer tu contraseña en tu casilla de correo.',
  });
});

exports.mailDiagnostic = asyncHandler(async (req, res) => {
  const testTo = req.query.to || req.query.test_to;
  if (testTo) {
    const diagnostic = await mailer.testDelivery(String(testTo).trim());
    return res.json({
      success: true,
      diagnostic,
    });
  }

  const isConfigured = mailer.isConfigured();
  const host = process.env.SMTP_HOST || 'none';
  const port = process.env.SMTP_PORT || 'none';
  const service = process.env.SMTP_SERVICE || 'none';
  const user = process.env.SMTP_USER ? `${process.env.SMTP_USER.slice(0, 3)}***` : 'none';
  const passSet = Boolean(process.env.SMTP_PASS);
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const hasBrevo = Boolean(process.env.BREVO_API_KEY);
  const mailFrom = process.env.MAIL_FROM || 'not_set';

  let smtpVerifyResult = 'not_tested';
  let smtpVerifyError = null;

  if (isConfigured && (process.env.SMTP_USER || process.env.SMTP_HOST)) {
    try {
      const transport = mailer.getTransporter();
      if (transport) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('transporter.verify timeout tras 6 segundos')), 6000);
          transport.verify((err, success) => {
            clearTimeout(timeout);
            if (err) reject(err);
            else resolve(success);
          });
        });
        smtpVerifyResult = 'verified_ok';
      }
    } catch (err) {
      smtpVerifyResult = 'verify_failed';
      smtpVerifyError = err.message;
    }
  }

  res.json({
    success: true,
    data: {
      isConfigured,
      hasResend,
      hasBrevo,
      mailFrom,
      host,
      port,
      service,
      user,
      passSet,
      smtpVerifyResult,
      smtpVerifyError,
      instruction: 'Para probar envío real a una casilla de correo, agrega ?to=tu_correo@gmail.com a esta URL',
    },
  });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { email, token, code, newPassword } = req.body;
  const resetCode = String(token || code || '').trim();
  const user = await findByEmail(email);
  if (!user || !resetCode) {
    throw new AppError('Código de recuperación inválido o vencido', 400, 'INVALID_RESET_TOKEN');
  }

  const tokenHash = tokens.sha256(`reset:${user.email}:${resetCode}`);
  const [rows] = await db.execute(
    `SELECT id FROM password_reset_tokens
     WHERE user_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [user.id, tokenHash]
  );
  if (!rows.length) {
    throw new AppError('El código de recuperación es inválido o ha vencido', 400, 'INVALID_RESET_TOKEN');
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await db.withTransaction(async (conn) => {
    await conn.execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [rows[0].id]);
    await conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);
    await conn.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [user.id]);
  });

  await logAudit(user.id, 'PASSWORD_RESET', 'user', user.id);
  res.json({
    success: true,
    message: 'Contraseña actualizada correctamente. Ya podés iniciar sesión.',
  });
});

/**
 * Configura el segundo factor TOTP (genera secreto cifrado, URI otpauth y códigos de recuperación).
 */
exports.setupTwoFactor = asyncHandler(async (req, res) => {
  const user = await findById(req.user.id);
  const { currentPassword } = req.body;
  if (user.password_hash && currentPassword) {
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) throw new AppError('La contraseña actual es incorrecta', 401, 'INVALID_PASSWORD');
  }

  const secretBase32 = totp.generateTotpSecret();
  const encryptedSecret = totp.encryptSecret(secretBase32);
  const { plainCodes, hashedCodes } = totp.generateRecoveryCodes(6);
  const otpauthUri = totp.buildOtpAuthUri(user.email, secretBase32);

  await db.execute(
    `INSERT INTO user_two_factor (user_id, encrypted_secret, recovery_codes_json, attempts, enabled_at)
     VALUES (?, ?, ?, 0, NULL)
     ON DUPLICATE KEY UPDATE
       encrypted_secret = VALUES(encrypted_secret),
       recovery_codes_json = VALUES(recovery_codes_json),
       attempts = 0,
       enabled_at = NULL`,
    [user.id, encryptedSecret, JSON.stringify(hashedCodes)]
  );

  res.json({
    success: true,
    message: 'Escaneá o copiá la clave secreta en tu app autenticadora e ingresá el código de 6 dígitos para confirmar.',
    data: {
      secret: secretBase32,
      otpauthUri,
      otpauthUrl: otpauthUri,
      recoveryCodes: plainCodes,
      currentCodeHint: process.env.NODE_ENV !== 'production' ? totp.computeHotp(secretBase32, Math.floor(Date.now() / 30000)) : undefined,
    },
  });
});

/**
 * Verifica el código TOTP (o de recuperación) tanto para activar el 2FA como durante el inicio de sesión.
 */
exports.verifyTwoFactor = asyncHandler(async (req, res) => {
  const userId = req.user?.id || Number(req.body.userId);
  const code = String(req.body.code || req.body.token || '').trim();
  if (!userId || !code) {
    throw new AppError('Usuario y código requeridos', 400, 'MISSING_2FA_CODE');
  }

  const user = await findById(userId);
  if (!user || user.status === 'suspended') {
    throw new AppError('Cuenta no disponible', 403, 'ACCOUNT_UNAVAILABLE');
  }

  // 1. Probar si coincide con código de verificación por correo electrónico (flujo principal de 2 pasos)
  const tokenHash = tokens.sha256(`verify:${user.id}:${code}`);
  const [emRows] = await db.execute(
    `SELECT id FROM email_verification_tokens
     WHERE user_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [user.id, tokenHash]
  );
  if (emRows.length) {
    await db.execute('UPDATE email_verification_tokens SET used_at = NOW() WHERE id = ?', [emRows[0].id]);
    await db.execute("UPDATE users SET email_verified_at = NOW(), two_factor_enabled = 1, status = 'active' WHERE id = ?", [user.id]);
    await logAudit(user.id, '2FA_EMAIL_VERIFIED', 'user', user.id);
    const freshUser = await findById(user.id);
    return res.json(await buildSessionResponse(freshUser, req));
  }

  // 2. Probar si coincide con TOTP (Google Authenticator)
  const [tfRows] = await db.execute('SELECT * FROM user_two_factor WHERE user_id = ?', [user.id]);
  const tf = tfRows[0];
  if (!tf) {
    throw new AppError('Código de verificación incorrecto o vencido', 400, 'INVALID_2FA_CODE');
  }
  if (tf.attempts >= 5) {
    throw new AppError('Demasiados intentos fallidos. Reconfigurá o usá un código de recuperación.', 429, 'TOO_MANY_ATTEMPTS');
  }

  const secretBase32 = totp.decryptSecret(tf.encrypted_secret);
  const check = totp.verifyTotpCode(secretBase32, code, tf.last_used_step);

  let verified = check.valid;
  let updatedRecoveryHashes = null;

  if (!verified && code.includes('-')) {
    const recoveryHashes = JSON.parse(tf.recovery_codes_json || '[]');
    const candidateHash = totp.hashRecoveryCode(code);
    const idx = recoveryHashes.indexOf(candidateHash);
    if (idx !== -1) {
      verified = true;
      recoveryHashes.splice(idx, 1);
      updatedRecoveryHashes = JSON.stringify(recoveryHashes);
    }
  }

  if (!verified) {
    await db.execute('UPDATE user_two_factor SET attempts = attempts + 1 WHERE user_id = ?', [user.id]);
    throw new AppError('Código de verificación incorrecto o ya utilizado', 401, 'INVALID_2FA_CODE');
  }

  await db.execute(
    `UPDATE user_two_factor
     SET attempts = 0,
         enabled_at = COALESCE(enabled_at, NOW()),
         last_used_step = COALESCE(?, last_used_step),
         recovery_codes_json = COALESCE(?, recovery_codes_json)
     WHERE user_id = ?`,
    [check.step, updatedRecoveryHashes, user.id]
  );

  if (!user.two_factor_enabled) {
    await db.execute("UPDATE users SET two_factor_enabled = 1, email_verified_at = COALESCE(email_verified_at, NOW()), status = 'active' WHERE id = ?", [user.id]);
    await logAudit(user.id, '2FA_ENABLED', 'user', user.id);
  } else {
    await logAudit(user.id, 'USER_LOGIN_2FA', 'user', user.id);
  }

  const freshUser = await findById(user.id);
  res.json(await buildSessionResponse(freshUser, req));
});

exports.disableTwoFactor = asyncHandler(async (req, res) => {
  const user = await findById(req.user.id);
  const currentPassword = req.body.currentPassword || req.body.password;
  if (user.password_hash && (!currentPassword || !(await bcrypt.compare(currentPassword, user.password_hash)))) {
    throw new AppError('Ingresá tu contraseña actual para desactivar el segundo factor', 401, 'INVALID_PASSWORD');
  }

  await db.withTransaction(async (conn) => {
    await conn.execute('UPDATE users SET two_factor_enabled = 0 WHERE id = ?', [user.id]);
    await conn.execute('DELETE FROM user_two_factor WHERE user_id = ?', [user.id]);
  });

  await logAudit(user.id, '2FA_DISABLED', 'user', user.id);
  const updated = await findById(user.id);
  res.json({
    success: true,
    message: 'Segundo factor desactivado correctamente',
    user: publicUser(updated),
  });
});

/**
 * Inicia el flujo OAuth 2.0 en el servidor Render para Expo Go y Web.
 * Redirige al proveedor social (Google, GitHub, Discord) con una URL de callback fija y HTTPS de Render.
 */
exports.oauthStart = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const supported = ['google', 'github', 'discord', 'facebook'];
  if (!supported.includes(provider)) {
    throw new AppError(`Proveedor social '${provider}' no soportado`, 400, 'UNSUPPORTED_PROVIDER');
  }

  const returnTo = String(req.query.return_to || req.query.redirect_uri || '').trim() || getPublicBaseUrl(req);
  const statePayload = {
    returnTo,
    provider,
    role: req.query.role || null,
    instructorKey: req.query.instructorKey || null,
    preceptorKey: req.query.preceptorKey || null,
    schoolYear: req.query.schoolYear || null,
    courseDivision: req.query.courseDivision || null,
    t: Date.now(),
  };
  const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');
  const callbackUrl = `${getPublicBaseUrl(req)}/api/v1/auth/oauth/${provider}/callback`;

  if (provider === 'google') {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new AppError('GOOGLE_CLIENT_ID no configurado en las variables de entorno de Render', 503, 'OAUTH_NOT_CONFIGURED');
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
      state,
    });
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  }

  if (provider === 'github') {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      throw new AppError('GITHUB_CLIENT_ID no configurado en las variables de entorno de Render', 503, 'OAUTH_NOT_CONFIGURED');
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: 'read:user user:email',
      state,
    });
    return res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  }

  if (provider === 'discord') {
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId) {
      throw new AppError('DISCORD_CLIENT_ID no configurado en las variables de entorno de Render', 503, 'OAUTH_NOT_CONFIGURED');
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'identify email',
      prompt: 'consent',
      state,
    });
    return res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
  }

  if (provider === 'facebook') {
    const clientId = process.env.FACEBOOK_APP_ID;
    if (!clientId) {
      throw new AppError('FACEBOOK_APP_ID no configurado en las variables de entorno de Render', 503, 'OAUTH_NOT_CONFIGURED');
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'email,public_profile',
      state,
    });
    return res.redirect(`https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`);
  }
});

/**
 * Recibe el callback del proveedor OAuth en Render, valida el código, crea o sincroniza la sesión
 * y redirige automáticamente de regreso a Expo Go o a la Web.
 */
exports.oauthCallback = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const { code, state, error, error_description } = req.query;

  let stateData = {};
  if (state) {
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    } catch {
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      } catch {}
    }
  }

  const returnTo = stateData.returnTo || getPublicBaseUrl(req);

  const sendRedirectWithBridge = (targetUrl, message = 'Completando autenticación...') => {
    const safeUrl = String(targetUrl).replace(/"/g, '&quot;');
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Campus Técnica 5 - Conectando</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      background: #1e2430;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 90vh;
      text-align: center;
      box-sizing: border-box;
    }
    .card {
      background: #283141;
      border: 1px solid #3a4659;
      border-radius: 14px;
      padding: 32px 24px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
    }
    h2 { margin: 0 0 12px; font-size: 20px; color: #ffffff; }
    p { margin: 0 0 24px; font-size: 14px; color: #94a3b8; line-height: 1.5; }
    .btn {
      display: inline-block;
      width: 100%;
      box-sizing: border-box;
      padding: 14px 20px;
      background: #15803d;
      color: #ffffff;
      text-decoration: none;
      font-weight: 700;
      border-radius: 8px;
      font-size: 15px;
      transition: background 0.2s;
      cursor: pointer;
    }
    .btn:hover { background: #166534; }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid rgba(255,255,255,0.15);
      border-top-color: #15803d;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>Campus Técnica 5</h2>
    <p>${message}</p>
    <a id="openBtn" class="btn" href="${safeUrl}">Abrir Campus Técnica 5</a>
  </div>
  <script>
    var target = ${JSON.stringify(targetUrl)};
    function doRedirect() {
      try {
        var btn = document.getElementById('openBtn');
        if (btn) btn.click();
      } catch (e) {}
      try {
        window.location.href = target;
      } catch (e) {}
    }
    doRedirect();
    setTimeout(doRedirect, 300);
    setTimeout(doRedirect, 1000);
  </script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  };

  const makeTarget = (params) => {
    const sep = returnTo.includes('?') ? '&' : '?';
    const qs = new URLSearchParams(params).toString();
    return `${returnTo}${sep}${qs}`;
  };

  if (error) {
    const errMsg = error_description || error || 'Autorización cancelada o denegada por el proveedor';
    return sendRedirectWithBridge(makeTarget({ error: errMsg }), 'Redirigiendo tras error...');
  }

  if (!code) {
    return sendRedirectWithBridge(makeTarget({ error: 'No se recibió el código de autorización del proveedor social' }), 'Error al conectar...');
  }

  const callbackUrl = `${getPublicBaseUrl(req)}/api/v1/auth/oauth/${provider}/callback`;

  try {
    const profile = await social.getProfile(provider, { code, redirectUri: callbackUrl });

    const [identityRows] = await db.execute(
      `SELECT u.*, r.name AS role_name
       FROM user_identities ui
       JOIN users u ON u.id = ui.user_id
       JOIN roles r ON r.id = u.role_id
       WHERE ui.provider = ? AND ui.provider_user_id = ? AND u.deleted_at IS NULL`,
      [provider, profile.id]
    );

    let user = identityRows[0];

    if (!user) {
      if (!profile.email || !profile.emailVerified) {
        return sendRedirectWithBridge(
          makeTarget({ error: 'El proveedor social no devolvió un correo electrónico verificado' }),
          'Correo no verificado...'
        );
      }

      user = await findByEmail(profile.email);
      if (!user) {
        const [[{ totalUsers }]] = await db.execute('SELECT COUNT(*) AS totalUsers FROM users WHERE deleted_at IS NULL');
        const isFirstUser = Number(totalUsers) === 0;
        let targetRoleName = isFirstUser ? 'admin' : 'student';

        if (!isFirstUser && String(stateData.role || '').trim().toLowerCase() === 'instructor') {
          const submittedKey = String(stateData.instructorKey || '').trim();
          const [keyRows] = await db.execute(
            "SELECT setting_value FROM platform_settings WHERE setting_key = 'instructor_registration_key' LIMIT 1"
          );
          const validKey = String(keyRows[0]?.setting_value || '').trim();
          if (validKey && submittedKey === validKey) {
            targetRoleName = 'instructor';
          }
        } else if (!isFirstUser && String(stateData.role || '').trim().toLowerCase() === 'preceptor') {
          const submittedKey = String(stateData.preceptorKey || '').trim();
          const [keyRows] = await db.execute(
            "SELECT setting_value FROM platform_settings WHERE setting_key = 'preceptor_registration_key' LIMIT 1"
          );
          const validKey = String(keyRows[0]?.setting_value || 'PRECEPTOR2026').trim();
          if (validKey && submittedKey === validKey) {
            targetRoleName = 'preceptor';
          }
        }

        const [roleRows] = await db.execute('SELECT id FROM roles WHERE name = ? LIMIT 1', [targetRoleName]);
        const roleId = roleRows[0]?.id || (targetRoleName === 'admin' ? 1 : targetRoleName === 'instructor' ? 2 : 3);

        const [ins] = await db.execute(
          `INSERT INTO users (first_name, last_name, email, avatar_url, role_id, status, email_verified_at, preferences)
           VALUES (?, ?, ?, ?, ?, 'active', NOW(), ?)`,
          [
            profile.firstName,
            profile.lastName,
            profile.email.toLowerCase(),
            profile.avatar,
            roleId,
            JSON.stringify({ theme: 'light', notifications: true, language: 'es' }),
          ]
        );
        user = await findById(ins.insertId);

        if (targetRoleName === 'student' && stateData.schoolYear && stateData.courseDivision) {
          const sy = Number(stateData.schoolYear);
          const cd = Number(stateData.courseDivision);
          if (sy >= 1 && sy <= 6 && cd >= 1 && cd <= 3) {
            await syncStudentCourseEnrollments(user.id, sy, cd).catch(() => {});
          }
        }
      }

      await db.execute(
        'INSERT IGNORE INTO user_identities (user_id, provider, provider_user_id, provider_email) VALUES (?, ?, ?, ?)',
        [user.id, provider, profile.id, profile.email.toLowerCase()]
      );
    }

    if (user.status === 'suspended') {
      return sendRedirectWithBridge(makeTarget({ error: 'Tu cuenta ha sido suspendida' }), 'Cuenta suspendida...');
    }

    // Solo requerir segundo factor en OAuth si el usuario configuró una app autenticadora TOTP específica
    const [tfRows] = await db.execute('SELECT id, enabled_at FROM user_two_factor WHERE user_id = ? AND enabled_at IS NOT NULL', [user.id]);
    if (tfRows.length > 0) {
      return sendRedirectWithBridge(
        makeTarget({
          twoFactorRequired: 'true',
          userId: String(user.id),
          email: user.email,
        }),
        'Se requiere código de tu aplicación autenticadora...'
      );
    }

    await logAudit(user.id, 'USER_LOGIN_OAUTH_PROXY', 'user', user.id, { provider });
    const sessionTokens = await tokens.issueSession(user, req.headers['user-agent'] || 'Expo Go Client');

    return sendRedirectWithBridge(
      makeTarget({
        token: sessionTokens.accessToken,
        accessToken: sessionTokens.accessToken,
        refreshToken: sessionTokens.refreshToken,
        success: 'true',
      }),
      '¡Inicio de sesión exitoso! Volviendo a Campus Técnica 5...'
    );
  } catch (err) {
    console.error('OAuth Callback Error:', err);
    return sendRedirectWithBridge(
      makeTarget({ error: err.message || 'Error durante la verificación con el proveedor social' }),
      'Error de autenticación...'
    );
  }
});

exports.socialLogin = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const profile = await social.getProfile(provider, req.body);

  const [identityRows] = await db.execute(
    `SELECT u.*, r.name AS role_name
     FROM user_identities ui
     JOIN users u ON u.id = ui.user_id
     JOIN roles r ON r.id = u.role_id
     WHERE ui.provider = ? AND ui.provider_user_id = ? AND u.deleted_at IS NULL`,
    [provider, profile.id]
  );

  let user = identityRows[0];

  if (!user) {
    if (!profile.email || !profile.emailVerified) {
      throw new AppError(
        'El proveedor social no proporcionó un correo electrónico verificado. Usá una cuenta con email verificado.',
        400,
        'UNVERIFIED_OAUTH_EMAIL'
      );
    }

    user = await findByEmail(profile.email);
    if (!user) {
      const [[{ totalUsers }]] = await db.execute('SELECT COUNT(*) AS totalUsers FROM users WHERE deleted_at IS NULL');
      const isFirstUser = Number(totalUsers) === 0;
      let targetRoleName = isFirstUser ? 'admin' : 'student';

      if (!isFirstUser && String(req.body?.role || '').trim().toLowerCase() === 'instructor') {
        const submittedKey = String(req.body?.instructorKey ?? req.body?.instructorCode ?? '').trim();
        if (!submittedKey) {
          throw new AppError(
            'Debés completar el campo de clave de docente para ingresar como docente.',
            422,
            'INSTRUCTOR_KEY_REQUIRED',
            [{ field: 'instructorKey', message: 'Debés completar este campo con la clave de docente' }]
          );
        }
        const [keyRows] = await db.execute(
          "SELECT setting_value FROM platform_settings WHERE setting_key = 'instructor_registration_key' LIMIT 1"
        );
        const validKey = String(keyRows[0]?.setting_value || '').trim();
        if (!validKey || submittedKey !== validKey) {
          throw new AppError(
            'La clave de docente introducida es incorrecta.',
            403,
            'INVALID_INSTRUCTOR_KEY',
            [{ field: 'instructorKey', message: 'La clave de docente ingresada es incorrecta' }]
          );
        }
        targetRoleName = 'instructor';
      }

      const [roleRows] = await db.execute('SELECT id FROM roles WHERE name = ? LIMIT 1', [targetRoleName]);
      const roleId = roleRows[0]?.id || (targetRoleName === 'admin' ? 1 : targetRoleName === 'instructor' ? 2 : 3);
      const [ins] = await db.execute(
        `INSERT INTO users (first_name, last_name, email, avatar_url, role_id, status, email_verified_at, preferences)
         VALUES (?, ?, ?, ?, ?, 'active', NOW(), ?)`,
        [
          profile.firstName,
          profile.lastName,
          profile.email.toLowerCase(),
          profile.avatar,
          roleId,
          JSON.stringify({ theme: 'light', notifications: true, language: 'es' }),
        ]
      );
      user = await findById(ins.insertId);
    }

    await db.execute(
      'INSERT IGNORE INTO user_identities (user_id, provider, provider_user_id, provider_email) VALUES (?, ?, ?, ?)',
      [user.id, provider, profile.id, profile.email.toLowerCase()]
    );
  }

  if (user.status === 'suspended') {
    throw new AppError('Tu cuenta está suspendida', 403, 'ACCOUNT_SUSPENDED');
  }

  await logAudit(user.id, 'USER_LOGIN_OAUTH', 'user', user.id, { provider });
  res.json(await buildSessionResponse(user, req));
});

exports.refresh = asyncHandler(async (req, res) => {
  const userId = await tokens.consumeRefresh(req.body.refreshToken);
  if (!userId) throw new AppError('Sesión vencida. Iniciá sesión nuevamente.', 401, 'REFRESH_EXPIRED');
  const user = await findById(userId);
  if (!user || user.status === 'suspended') {
    throw new AppError('Cuenta no disponible', 401, 'ACCOUNT_UNAVAILABLE');
  }
  const sessionTokens = await tokens.issueSession(user, req.headers['user-agent']);
  res.json({ success: true, ...sessionTokens, data: sessionTokens });
});

exports.logout = asyncHandler(async (req, res) => {
  if (req.body?.refreshToken) {
    await tokens.revokeRefresh(req.body.refreshToken);
  }
  res.status(204).end();
});

exports.listSessions = asyncHandler(async (req, res) => {
  const sessions = await tokens.listActiveSessions(req.user.id);
  res.json({ success: true, data: sessions });
});

exports.revokeSession = asyncHandler(async (req, res) => {
  const ok = await tokens.revokeSessionById(req.user.id, Number(req.params.id));
  if (!ok) throw new AppError('Sesión no encontrada', 404, 'SESSION_NOT_FOUND');
  res.json({ success: true, message: 'Sesión cerrada correctamente' });
});
