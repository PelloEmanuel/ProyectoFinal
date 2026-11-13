import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Request, Response } from 'express';
import db from '../configuracion/baseDatos';
import { AppError, asyncHandler } from '../utilidades/errores';
import * as tokens from '../utilidades/tokens';
import * as totp from '../utilidades/dobleFactor';
import * as mailer from '../utilidades/correo';
import * as social from '../utilidades/redesSociales';
import { publicUser } from '../utilidades/serializadores';
import { logAudit } from '../utilidades/auditoria';
import { syncStudentCourseEnrollments } from '../utilidades/escuela';
import { SolicitudAutenticada } from '../tipos';

// Define la consulta SQL base para recuperar los datos de un usuario junto con el nombre de su rol.
const USER_QUERY = `
  SELECT u.*, r.name AS role_name
  FROM usuarios u
  JOIN roles r ON r.id = u.role_id
  WHERE u.deleted_at IS NULL`;

// Busca un usuario activo en la base de datos por su identificador numérico.
async function findById(id: number): Promise<any | null> {
  // Ejecuta la búsqueda filtrando por el identificador de usuario.
  const [rows] = await db.execute<any[]>(`${USER_QUERY} AND u.id = ?`, [id]);
  return rows[0] || null;
}

// Busca un usuario activo en la base de datos por su dirección de correo electrónico normalizada.
async function findByEmail(email: string): Promise<any | null> {
  // Ejecuta la búsqueda convirtiendo el correo a minúsculas y sin espacios.
  const [rows] = await db.execute<any[]>(`${USER_QUERY} AND u.email = ?`, [String(email).trim().toLowerCase()]);
  return rows[0] || null;
}

// Construye la respuesta estándar de inicio de sesión emitiendo nuevos tokens de acceso y renovación.
async function buildSessionResponse(user: any, req: Request) {
  // Identifica el dispositivo del cliente a partir del encabezado User-Agent.
  const deviceInfo = String(req?.headers?.['user-agent'] || 'Campus App');
  const sessionTokens = await tokens.issueSession(user, deviceInfo);
  const serialized = publicUser(user);

  // Devuelve el usuario serializado junto con los tokens de sesión.
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

// Determina la URL pública base del servidor para construir enlaces de redirección OAuth.
function getPublicBaseUrl(req: Request): string {
  // Prioriza las variables de entorno de producción si están configuradas.
  if (process.env.APP_PUBLIC_URL && !process.env.APP_PUBLIC_URL.includes('localhost')) {
    return process.env.APP_PUBLIC_URL.replace(/\/+$/, '');
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
  }

  // Deduce el dominio y protocolo a partir de la petición HTTP entrante.
  const host = req?.get ? req.get('host') : null;
  const proto = req?.headers?.['x-forwarded-proto'] || req?.protocol || 'https';
  if (host && !host.includes('localhost')) {
    return `${proto}://${host}`;
  }
  return 'https://campus-58oe.onrender.com';
}

// Genera un código numérico de 6 dígitos para verificar el correo, lo almacena en la base de datos y lo envía por email.
async function issueEmailVerificationToken(userId: number, email: string): Promise<{ rawToken: string; sent: boolean }> {
  // Calcula el código aleatorio, su hash SHA-256 y su fecha de vencimiento a 24 horas.
  const rawToken = crypto.randomInt(100000, 1000000).toString();
  const tokenHash = tokens.sha256(`verify:${userId}:${rawToken}`);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Invalida códigos anteriores y registra el nuevo código en la tabla tokens_verificacion_correo.
  await db.execute('UPDATE tokens_verificacion_correo SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [userId]);
  await db.execute(
    'INSERT INTO tokens_verificacion_correo (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [userId, tokenHash, expiresAt]
  );

  // Dispara el envío del correo electrónico en segundo plano.
  mailer.sendVerificationEmail(email, rawToken).catch((err: any) => {
    console.error(`[MAILER] Error en segundo plano enviando verificación a ${email}:`, err.message);
  });
  return { rawToken, sent: true };
}

// Consulta el estado inicial de registro en la plataforma y la lista de cursos escolares abiertos.
export const registrationStatus = asyncHandler(async (_req: Request, res: Response) => {
  // Cuenta el total de usuarios activos para saber si el próximo registro será el primer administrador.
  const [[{ totalUsers }]] = await db.execute<any[]>('SELECT COUNT(*) AS totalUsers FROM usuarios WHERE deleted_at IS NULL');
  const isFirstUser = Number(totalUsers) === 0;

  // Obtiene todos los cursos y divisiones escolares que se encuentran abiertos para inscripción.
  let availableSchoolGroups: any[] = [];
  try {
    const [groups] = await db.execute<any[]>(
      `SELECT sg.id, sg.school_year AS schoolYear, sg.course_division AS courseDivision, sg.status
       FROM grupos_escolares sg
       WHERE sg.status = 'open'
       ORDER BY sg.school_year ASC, sg.course_division ASC`
    );
    availableSchoolGroups = groups.map((g: any) => ({
      id: g.id,
      schoolYear: Number(g.schoolYear),
      courseDivision: Number(g.courseDivision),
      label: `${g.schoolYear}° ${g.courseDivision}ª`,
      fullLabel: `${g.schoolYear}° Año - ${g.courseDivision}° Curso`,
    }));
  } catch (err: any) {
    console.warn('[RegistrationStatus] Error obteniendo grupos escolares:', err.message);
  }

  // Envía el estado de registro y los grupos disponibles al cliente.
  res.json({
    success: true,
    isFirstUser,
    data: {
      isFirstUser,
      totalUsers: Number(totalUsers),
      availableSchoolGroups,
    },
    availableSchoolGroups,
  });
});

// Registra un nuevo usuario en la plataforma validando su rol, claves institucionales y verificación en dos pasos.
export const register = asyncHandler(async (req: Request, res: Response) => {
  // Extrae los campos de registro enviados en el cuerpo de la petición.
  const {
    firstName,
    lastName,
    name,
    email,
    password,
    acceptTerms,
    role,
    instructorKey,
    instructorCode,
    preceptorKey,
    preceptorCode,
  } = req.body;

  // Verifica que el usuario haya aceptado los términos y condiciones.
  if (acceptTerms === false) {
    throw new AppError('Debés aceptar los términos y condiciones para crear una cuenta', 400, 'TERMS_REQUIRED');
  }

  // Normaliza el correo electrónico y comprueba si ya existe un registro previo en la tabla usuarios.
  const normalizedEmail = String(email).trim().toLowerCase();
  const [anyUsers] = await db.execute<any[]>('SELECT * FROM usuarios WHERE email = ?', [normalizedEmail]);
  if (anyUsers.length > 0) {
    const rawUser = anyUsers[0];

    // Si la cuenta anterior fue dada de baja lógica, la elimina definitivamente para permitir el nuevo registro.
    if (rawUser.deleted_at !== null) {
      await db.execute('UPDATE cursos SET instructor_id = NULL WHERE instructor_id = ?', [rawUser.id]);
      await db.execute('DELETE FROM usuarios WHERE id = ?', [rawUser.id]);
    } else if (!rawUser.email_verified_at && !rawUser.created_by_admin) {
      // Si la cuenta estaba pendiente de verificación por correo, actualiza sus datos y reenvía el código de 6 dígitos.
      let resolvedFirst = (firstName || '').trim();
      let resolvedLast = (lastName || '').trim();
      if (!resolvedFirst && name) {
        const parts = String(name).trim().split(/\s+/);
        resolvedFirst = parts[0] || 'Usuario';
        resolvedLast = parts.slice(1).join(' ') || 'Campus';
      }
      if (!resolvedLast) resolvedLast = 'Campus';

      const newHash = await bcrypt.hash(password, 10);
      await db.execute(
        `UPDATE usuarios 
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
    } else {
      // Si la cuenta ya existía mediante proveedor social sin contraseña, vincula la nueva contraseña a la misma cuenta.
      if (!rawUser.password_hash) {
        const linkedHash = await bcrypt.hash(password, 10);
        await db.execute('UPDATE usuarios SET password_hash = ? WHERE id = ?', [linkedHash, rawUser.id]);
        if (rawUser.role_name === 'student' && req.body.schoolYear && req.body.courseDivision) {
          const sy = Number(req.body.schoolYear);
          const cd = Number(req.body.courseDivision);
          if (sy >= 1 && cd >= 1) {
            await syncStudentCourseEnrollments(rawUser.id, sy, cd);
          }
        }
        await logAudit(rawUser.id, 'OAUTH_ACCOUNT_LINKED_PASSWORD', 'user', rawUser.id, { email: normalizedEmail });
        const unifiedUser = await findById(rawUser.id);
        return res.status(200).json(await buildSessionResponse(unifiedUser, req));
      }

      // Si la contraseña coincide con la cuenta activa existente, inicia sesión directamente.
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

  // Determina si es el primer usuario registrado en el sistema para asignarle rol de administrador.
  const [[{ totalUsers }]] = await db.execute<any[]>('SELECT COUNT(*) AS totalUsers FROM usuarios WHERE deleted_at IS NULL');
  const isFirstUser = Number(totalUsers) === 0;

  // Valida el rol solicitado y verifica las claves institucionales de docente o preceptor en mayúsculas.
  let targetRoleName = 'student';
  if (isFirstUser) {
    targetRoleName = 'admin';
  } else if (String(role || '').trim().toLowerCase() === 'instructor') {
    const submittedKey = String(instructorKey ?? instructorCode ?? '').trim().toUpperCase();
    if (!submittedKey) {
      throw new AppError(
        'Debés completar el campo de clave de docente para poder registrarte e iniciar sesión como docente.',
        422,
        'INSTRUCTOR_KEY_REQUIRED',
        [{ field: 'instructorKey', message: 'Debés completar este campo con la clave de docente' }]
      );
    }

    const [keyRows] = await db.execute<any[]>(
      "SELECT setting_value FROM ajustes_plataforma WHERE setting_key = 'instructor_registration_key' LIMIT 1"
    );
    const validKey = String(keyRows[0]?.setting_value || '').trim().toUpperCase();
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
    const submittedKey = String(preceptorKey ?? preceptorCode ?? req.body?.preceptorKey ?? req.body?.preceptorCode ?? '').trim().toUpperCase();
    if (!submittedKey) {
      throw new AppError(
        'Debés completar el campo de clave de preceptor para poder registrarte como preceptor/a.',
        422,
        'PRECEPTOR_KEY_REQUIRED',
        [{ field: 'preceptorKey', message: 'Debés completar este campo con la clave de preceptor' }]
      );
    }

    const [keyRows] = await db.execute<any[]>(
      "SELECT setting_value FROM ajustes_plataforma WHERE setting_key = 'preceptor_registration_key' LIMIT 1"
    );
    const validKey = String(keyRows[0]?.setting_value || 'PRECEPTOR2026').trim().toUpperCase();
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

  // Normaliza el nombre y apellido del usuario para almacenarlos en la base de datos.
  let resolvedFirst = (firstName || '').trim();
  let resolvedLast = (lastName || '').trim();
  if (!resolvedFirst && name) {
    const parts = String(name).trim().split(/\s+/);
    resolvedFirst = parts[0] || 'Usuario';
    resolvedLast = parts.slice(1).join(' ') || 'Campus';
  }
  if (!resolvedLast) resolvedLast = 'Campus';
  const resolvedUsername = `${resolvedFirst} ${resolvedLast}`.trim();

  // Encripta la contraseña e inserta el nuevo usuario en la tabla usuarios.
  const passwordHash = await bcrypt.hash(password, 10);
  const [roleRows] = await db.execute<any[]>('SELECT id FROM roles WHERE name = ? LIMIT 1', [targetRoleName]);
  const roleId = roleRows[0]?.id || (targetRoleName === 'admin' ? 1 : targetRoleName === 'instructor' ? 2 : 3);

  const [result] = await db.execute<any>(
    `INSERT INTO usuarios (first_name, last_name, username, email, password_hash, role_id, status, preferences)
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

  // Si el usuario es estudiante y seleccionó un año y división, sincroniza sus inscripciones escolares.
  if (targetRoleName === 'student') {
    const sy = Number(req.body.schoolYear);
    const cd = Number(req.body.courseDivision);
    if (sy >= 1 && cd >= 1) {
      await syncStudentCourseEnrollments(result.insertId, sy, cd);
    }
  }

  // Emite el token de verificación por correo y crea una notificación de bienvenida para el usuario.
  await issueEmailVerificationToken(result.insertId, normalizedEmail);
  const welcomeTitle =
    targetRoleName === 'admin'
      ? '¡Bienvenido/a, Administrador/a General!'
      : targetRoleName === 'instructor'
      ? '¡Bienvenido/a al equipo docente del Campus!'
      : '¡Bienvenido/a al Campus!';
  const welcomeBody =
    targetRoleName === 'admin'
      ? 'Por ser el primer usuario registrado, tu cuenta recibió automáticamente el rol de Administrador. Podés configurar la clave para docentes desde tu panel.'
      : targetRoleName === 'instructor'
      ? 'Tu clave de docente fue validada correctamente. Ya podés crear y publicar cursos, módulos y evaluaciones.'
      : 'Explorá el catálogo de cursos e inscribite para comenzar tu camino de aprendizaje.';

  await db.execute(
    `INSERT INTO notificaciones (user_id, type, title, body, resource_type, resource_id)
     VALUES (?, 'welcome', ?, ?, NULL, NULL)`,
    [result.insertId, welcomeTitle, welcomeBody]
  );
  await logAudit(result.insertId, 'USER_REGISTERED_PENDING_2FA', 'user', result.insertId, {
    email: normalizedEmail,
    role: targetRoleName,
    autoPromotedFirstUser: isFirstUser,
  });

  // Devuelve el estado 201 indicando que requiere verificación de correo en 2 pasos.
  res.status(201).json({
    success: true,
    requiresVerification: true,
    twoFactorRequired: true,
    userId: result.insertId,
    email: normalizedEmail,
    message: 'Te enviamos un código de verificación en 2 pasos a tu correo electrónico. Ingresalo manualmente para completar tu registro.',
  });
});

// Autentica a un usuario mediante correo y contraseña verificando el estado de su cuenta y el segundo factor.
export const login = asyncHandler(async (req: Request, res: Response) => {
  // Busca al usuario por su correo electrónico.
  const { email, password } = req.body;
  let user = await findByEmail(email);
  if (!user) {
    throw new AppError('Correo electrónico o contraseña incorrectos', 401, 'INVALID_CREDENTIALS');
  }

  // Si la cuenta provino de OAuth sin contraseña, vincula la contraseña ingresada; de lo contrario valida el hash.
  if (!user.password_hash) {
    if (!password) {
      throw new AppError('Ingresá una contraseña para acceder a tu cuenta.', 401, 'INVALID_CREDENTIALS');
    }
    const newHash = await bcrypt.hash(String(password), 10);
    await db.execute('UPDATE usuarios SET password_hash = ? WHERE id = ?', [newHash, user.id]);
    await logAudit(user.id, 'OAUTH_ACCOUNT_LINKED_PASSWORD_ON_LOGIN', 'user', user.id, { email: user.email });
    user = await findById(user.id);
  } else if (!(await bcrypt.compare(password, user.password_hash))) {
    throw new AppError('Correo electrónico o contraseña incorrectos', 401, 'INVALID_CREDENTIALS');
  }

  // Verifica que la cuenta no se encuentre suspendida.
  if (user.status === 'suspended') {
    throw new AppError('Tu cuenta ha sido suspendida por un administrador', 403, 'ACCOUNT_SUSPENDED');
  }

  // Permite el acceso directo a las cuentas de demostración creadas por el administrador.
  if (user.created_by_admin) {
    await logAudit(user.id, 'USER_LOGIN_ADMIN_TEST_ACCOUNT', 'user', user.id, { method: 'password' });
    return res.json(await buildSessionResponse(user, req));
  }

  // Si el usuario aún no verificó su correo electrónico, envía un nuevo código de 6 dígitos.
  if (!user.email_verified_at) {
    await issueEmailVerificationToken(user.id, user.email);
    return res.status(202).json({
      success: true,
      requiresVerification: true,
      twoFactorRequired: true,
      userId: user.id,
      email: user.email,
      message: 'Debés ingresar el código de verificación en 2 pasos enviado a tu correo antes de acceder al Campus.',
    });
  }

  // Comprueba si el usuario tiene activado el segundo factor mediante aplicación autenticadora TOTP.
  const [tfRows] = await db.execute<any[]>('SELECT id, enabled_at FROM doble_factor_usuario WHERE user_id = ? AND enabled_at IS NOT NULL', [user.id]);
  if (tfRows.length > 0) {
    return res.status(202).json({
      success: true,
      twoFactorRequired: true,
      userId: user.id,
      email: user.email,
      message: 'Ingresá el código de 6 dígitos de tu aplicación autenticadora o un código de recuperación',
    });
  }

  // Registra el inicio de sesión en auditoría y devuelve los tokens de sesión.
  await logAudit(user.id, 'USER_LOGIN', 'user', user.id, { method: 'password' });
  res.json(await buildSessionResponse(user, req));
});

// Devuelve los datos del perfil del usuario autenticado actualmente.
export const me = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Busca al usuario en la base de datos y lo serializa para el cliente.
  const user = await findById(req.user!.id);
  if (!user) throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  const serialized = publicUser(user);
  res.json({ success: true, data: serialized, ...serialized });
});

// Verifica el código de 6 dígitos enviado al correo electrónico y activa la cuenta del usuario.
export const verifyEmail = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Obtiene el código de verificación y el identificador del usuario.
  const token = String(req.body.token || req.body.code || req.query.token || '').trim();
  const userId = req.body.userId || req.user?.id;
  if (!token || !userId) {
    throw new AppError('Código de verificación y usuario requeridos', 400, 'MISSING_VERIFICATION_DATA');
  }

  // Busca un token válido y no utilizado en la tabla tokens_verificacion_correo.
  const tokenHash = tokens.sha256(`verify:${userId}:${token}`);
  const [rows] = await db.execute<any[]>(
    `SELECT id FROM tokens_verificacion_correo
     WHERE user_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [userId, tokenHash]
  );
  if (!rows.length) {
    throw new AppError('El código de verificación es inválido o ha vencido', 400, 'INVALID_VERIFICATION_TOKEN');
  }

  // Marca el token como utilizado y activa la cuenta del usuario en la tabla usuarios.
  await db.execute('UPDATE tokens_verificacion_correo SET used_at = NOW() WHERE id = ?', [rows[0].id]);
  await db.execute("UPDATE usuarios SET email_verified_at = NOW(), two_factor_enabled = 1, status = 'active' WHERE id = ?", [userId]);
  await logAudit(Number(userId), 'EMAIL_VERIFIED_2FA', 'user', Number(userId));

  // Emite la sesión activa para el usuario recién verificado.
  const updated = await findById(Number(userId));
  const sessionResponse = await buildSessionResponse(updated, req);
  res.json({
    success: true,
    message: '¡Verificación en 2 pasos completada con éxito! Ya tenés acceso completo al Campus.',
    ...sessionResponse,
  });
});

// Reenvía un nuevo código de verificación de 6 dígitos al correo electrónico del usuario.
export const resendVerification = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Localiza al usuario por su ID o dirección de correo electrónico.
  const userId = req.user?.id || req.body.userId;
  const email = req.body.email;
  const user = userId ? await findById(Number(userId)) : email ? await findByEmail(email) : null;

  // Si el usuario existe, genera y envía un nuevo token de verificación por correo.
  if (user) {
    await issueEmailVerificationToken(user.id, user.email);
    return res.json({
      success: true,
      message: 'Enviamos un nuevo código de verificación en 2 pasos a tu correo electrónico',
      userId: user.id,
      email: user.email,
    });
  }

  res.json({
    success: true,
    message: 'Si la cuenta existe, enviamos un nuevo código al correo registrado',
  });
});

// Genera un código temporal de recuperación de contraseña y lo envía por correo electrónico.
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  // Busca al usuario activo por correo electrónico.
  const { email } = req.body;
  const user = await findByEmail(email);

  // Si la cuenta es válida, almacena el hash del código en tokens_recuperacion_clave y envía el correo.
  if (user && user.status !== 'suspended') {
    const rawCode = crypto.randomInt(100000, 1000000).toString();
    const tokenHash = tokens.sha256(`reset:${user.email}:${rawCode}`);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await db.execute('UPDATE tokens_recuperacion_clave SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [user.id]);
    await db.execute(
      'INSERT INTO tokens_recuperacion_clave (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user.id, tokenHash, expiresAt]
    );
    mailer.sendPasswordResetEmail(user.email, rawCode).catch((err: any) => {
      console.error(`[MAILER] Error en segundo plano enviando reset password a ${user.email}:`, err.message);
    });
  }

  res.json({
    success: true,
    message: 'Si el correo está registrado, recibirás un código temporal para restablecer tu contraseña en tu casilla de correo.',
  });
});

// Ejecuta un diagnóstico técnico del servicio de correo electrónico configurado en el servidor.
export const mailDiagnostic = asyncHandler(async (req: Request, res: Response) => {
  // Si se indica un destinatario de prueba, realiza un envío real de diagnóstico.
  const testTo = req.query.to || req.query.test_to;
  if (testTo) {
    const diagnostic = await mailer.testDelivery(String(testTo).trim());
    return res.json({
      success: true,
      diagnostic,
    });
  }

  // Reúne los parámetros de configuración de los proveedores de correo.
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
  let smtpVerifyError: string | null = null;

  // Verifica la conectividad con el servidor SMTP si está configurado.
  if (isConfigured && (process.env.SMTP_USER || process.env.SMTP_HOST)) {
    try {
      const transport = mailer.getTransporter();
      if (transport) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('transporter.verify timeout tras 6 segundos')), 6000);
          transport.verify((err: any, success: any) => {
            clearTimeout(timeout);
            if (err) reject(err);
            else resolve(success);
          });
        });
        smtpVerifyResult = 'verified_ok';
      }
    } catch (err: any) {
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

// Restablece la contraseña del usuario validando el código temporal enviado por correo.
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  // Obtiene los datos del formulario y busca al usuario correspondiente.
  const { email, token, code, newPassword } = req.body;
  const resetCode = String(token || code || '').trim();
  const user = await findByEmail(email);
  if (!user || !resetCode) {
    throw new AppError('Código de recuperación inválido o vencido', 400, 'INVALID_RESET_TOKEN');
  }

  // Comprueba que el código exista, no haya sido usado y no esté vencido en tokens_recuperacion_clave.
  const tokenHash = tokens.sha256(`reset:${user.email}:${resetCode}`);
  const [rows] = await db.execute<any[]>(
    `SELECT id FROM tokens_recuperacion_clave
     WHERE user_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [user.id, tokenHash]
  );
  if (!rows.length) {
    throw new AppError('El código de recuperación es inválido o ha vencido', 400, 'INVALID_RESET_TOKEN');
  }

  // Actualiza la contraseña y revoca las sesiones activas dentro de una transacción.
  const newHash = await bcrypt.hash(newPassword, 10);
  await db.withTransaction(async (conn) => {
    await conn.execute('UPDATE tokens_recuperacion_clave SET used_at = NOW() WHERE id = ?', [rows[0].id]);
    await conn.execute('UPDATE usuarios SET password_hash = ? WHERE id = ?', [newHash, user.id]);
    await conn.execute('UPDATE tokens_renovacion SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [user.id]);
  });

  await logAudit(user.id, 'PASSWORD_RESET', 'user', user.id);
  res.json({
    success: true,
    message: 'Contraseña actualizada correctamente. Ya podés iniciar sesión.',
  });
});

// Inicia la configuración del segundo factor TOTP generando el secreto cifrado y los códigos de recuperación.
export const setupTwoFactor = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Verifica la contraseña actual del usuario si su cuenta posee contraseña.
  const user = await findById(req.user!.id);
  const { currentPassword } = req.body;
  if (user.password_hash && currentPassword) {
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) throw new AppError('La contraseña actual es incorrecta', 401, 'INVALID_PASSWORD');
  }

  // Genera el secreto Base32, lo cifra con AES-256-GCM y crea los códigos de emergencia.
  const secretBase32 = totp.generateTotpSecret();
  const encryptedSecret = totp.encryptSecret(secretBase32);
  const { plainCodes, hashedCodes } = totp.generateRecoveryCodes(6);
  const otpauthUri = totp.buildOtpAuthUri(user.email, secretBase32);

  // Guarda la configuración pendiente de confirmación en la tabla doble_factor_usuario.
  await db.execute(
    `INSERT INTO doble_factor_usuario (user_id, encrypted_secret, recovery_codes_json, attempts, enabled_at)
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

// Verifica el código de segundo factor (por correo, app autenticadora TOTP o código de emergencia).
export const verifyTwoFactor = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Valida que se hayan recibido el usuario y el código de verificación.
  const userId = req.user?.id || Number(req.body.userId);
  const code = String(req.body.code || req.body.token || '').trim();
  if (!userId || !code) {
    throw new AppError('Usuario y código requeridos', 400, 'MISSING_2FA_CODE');
  }

  const user = await findById(userId);
  if (!user || user.status === 'suspended') {
    throw new AppError('Cuenta no disponible', 403, 'ACCOUNT_UNAVAILABLE');
  }

  // Comprueba primero si el código corresponde a un token de verificación por correo electrónico.
  const tokenHash = tokens.sha256(`verify:${user.id}:${code}`);
  const [emRows] = await db.execute<any[]>(
    `SELECT id FROM tokens_verificacion_correo
     WHERE user_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [user.id, tokenHash]
  );
  if (emRows.length) {
    await db.execute('UPDATE tokens_verificacion_correo SET used_at = NOW() WHERE id = ?', [emRows[0].id]);
    await db.execute("UPDATE usuarios SET email_verified_at = NOW(), two_factor_enabled = 1, status = 'active' WHERE id = ?", [user.id]);
    await logAudit(user.id, '2FA_EMAIL_VERIFIED', 'user', user.id);
    const freshUser = await findById(user.id);
    return res.json(await buildSessionResponse(freshUser, req));
  }

  // Si no es un código de correo, verifica contra la configuración TOTP de doble_factor_usuario.
  const [tfRows] = await db.execute<any[]>('SELECT * FROM doble_factor_usuario WHERE user_id = ?', [user.id]);
  const tf = tfRows[0];
  if (!tf) {
    throw new AppError('Código de verificación incorrecto o vencido', 400, 'INVALID_2FA_CODE');
  }
  if (tf.attempts >= 5) {
    throw new AppError('Demasiados intentos fallidos. Reconfigurá o usá un código de recuperación.', 429, 'TOO_MANY_ATTEMPTS');
  }

  // Descifra el secreto TOTP y comprueba el código numérico o los códigos de recuperación.
  const secretBase32 = totp.decryptSecret(tf.encrypted_secret);
  const check = totp.verifyTotpCode(secretBase32, code, tf.last_used_step);

  let verified = check.valid;
  let updatedRecoveryHashes: string | null = null;

  if (!verified && code.includes('-')) {
    const recoveryHashes: string[] = JSON.parse(tf.recovery_codes_json || '[]');
    const candidateHash = totp.hashRecoveryCode(code);
    const idx = recoveryHashes.indexOf(candidateHash);
    if (idx !== -1) {
      verified = true;
      recoveryHashes.splice(idx, 1);
      updatedRecoveryHashes = JSON.stringify(recoveryHashes);
    }
  }

  if (!verified) {
    await db.execute('UPDATE doble_factor_usuario SET attempts = attempts + 1 WHERE user_id = ?', [user.id]);
    throw new AppError('Código de verificación incorrecto o ya utilizado', 401, 'INVALID_2FA_CODE');
  }

  // Actualiza el registro TOTP y habilita el segundo factor en la cuenta del usuario.
  await db.execute(
    `UPDATE doble_factor_usuario
     SET attempts = 0,
         enabled_at = COALESCE(enabled_at, NOW()),
         last_used_step = COALESCE(?, last_used_step),
         recovery_codes_json = COALESCE(?, recovery_codes_json)
     WHERE user_id = ?`,
    [check.step, updatedRecoveryHashes, user.id]
  );

  if (!user.two_factor_enabled) {
    await db.execute("UPDATE usuarios SET two_factor_enabled = 1, email_verified_at = COALESCE(email_verified_at, NOW()), status = 'active' WHERE id = ?", [user.id]);
    await logAudit(user.id, '2FA_ENABLED', 'user', user.id);
  } else {
    await logAudit(user.id, 'USER_LOGIN_2FA', 'user', user.id);
  }

  const freshUser = await findById(user.id);
  res.json(await buildSessionResponse(freshUser, req));
});

// Desactiva el segundo factor de autenticación TOTP tras verificar la contraseña actual del usuario.
export const disableTwoFactor = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Comprueba la contraseña actual del usuario antes de desactivar el segundo factor.
  const user = await findById(req.user!.id);
  const currentPassword = req.body.currentPassword || req.body.password;
  if (user.password_hash && (!currentPassword || !(await bcrypt.compare(currentPassword, user.password_hash)))) {
    throw new AppError('Ingresá tu contraseña actual para desactivar el segundo factor', 401, 'INVALID_PASSWORD');
  }

  // Elimina la configuración de doble_factor_usuario y actualiza el indicador en usuarios.
  await db.withTransaction(async (conn) => {
    await conn.execute('UPDATE usuarios SET two_factor_enabled = 0 WHERE id = ?', [user.id]);
    await conn.execute('DELETE FROM doble_factor_usuario WHERE user_id = ?', [user.id]);
  });

  await logAudit(user.id, '2FA_DISABLED', 'user', user.id);
  const updated = await findById(user.id);
  res.json({
    success: true,
    message: 'Segundo factor desactivado correctamente',
    user: publicUser(updated),
  });
});

// Inicia el flujo de autenticación OAuth 2.0 redirigiendo al usuario hacia el proveedor externo seleccionado.
export const oauthStart = asyncHandler(async (req: Request, res: Response) => {
  // Verifica que el proveedor social solicitado esté soportado.
  const provider = String(req.params.provider || '');
  const supported = ['google', 'github', 'discord', 'facebook'];
  if (!supported.includes(provider)) {
    throw new AppError(`Proveedor social '${provider}' no soportado`, 400, 'UNSUPPORTED_PROVIDER');
  }

  // Codifica el estado de la petición incluyendo el rol, claves y curso escolar si fueron provistos.
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

  // Construye la URL de autorización según el proveedor social elegido.
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

// Procesa la respuesta del proveedor OAuth 2.0, sincroniza la cuenta del usuario y redirige a la aplicación.
export const oauthCallback = asyncHandler(async (req: Request, res: Response) => {
  // Extrae los parámetros devueltos por el proveedor OAuth en la URL de callback.
  const provider = String(req.params.provider || '');
  const { code, state, error, error_description } = req.query as Record<string, string | undefined>;

  // Decodifica el estado original de la petición OAuth.
  let stateData: any = {};
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

  // Genera una página HTML puente para redirigir de vuelta a la aplicación móvil o web.
  const sendRedirectWithBridge = (targetUrl: string, message = 'Completando autenticación...') => {
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

  // Construye la URL de destino adjuntando parámetros en la cadena de consulta.
  const makeTarget = (params: Record<string, string>) => {
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
    // Obtiene el perfil verificado desde el proveedor social y busca si ya está vinculado en identidades_usuario.
    const profile = await social.getProfile(provider, { code, redirectUri: callbackUrl });

    const [identityRows] = await db.execute<any[]>(
      `SELECT u.*, r.name AS role_name
       FROM identidades_usuario ui
       JOIN usuarios u ON u.id = ui.user_id
       JOIN roles r ON r.id = u.role_id
       WHERE ui.provider = ? AND ui.provider_user_id = ? AND u.deleted_at IS NULL`,
      [provider, profile.id]
    );

    let user = identityRows[0];

    // Si la identidad social aún no estaba registrada, busca por correo o crea un nuevo usuario.
    if (!user) {
      if (!profile.email || !profile.emailVerified) {
        return sendRedirectWithBridge(
          makeTarget({ error: 'El proveedor social no devolvió un correo electrónico verificado' }),
          'Correo no verificado...'
        );
      }

      user = await findByEmail(profile.email);
      if (!user) {
        const [[{ totalUsers }]] = await db.execute<any[]>('SELECT COUNT(*) AS totalUsers FROM usuarios WHERE deleted_at IS NULL');
        const isFirstUser = Number(totalUsers) === 0;
        let targetRoleName = isFirstUser ? 'admin' : 'student';

        if (!isFirstUser && String(stateData.role || '').trim().toLowerCase() === 'instructor') {
          const submittedKey = String(stateData.instructorKey || '').trim().toUpperCase();
          const [keyRows] = await db.execute<any[]>(
            "SELECT setting_value FROM ajustes_plataforma WHERE setting_key = 'instructor_registration_key' LIMIT 1"
          );
          const validKey = String(keyRows[0]?.setting_value || '').trim().toUpperCase();
          if (validKey && submittedKey === validKey) {
            targetRoleName = 'instructor';
          }
        } else if (!isFirstUser && String(stateData.role || '').trim().toLowerCase() === 'preceptor') {
          const submittedKey = String(stateData.preceptorKey || '').trim().toUpperCase();
          const [keyRows] = await db.execute<any[]>(
            "SELECT setting_value FROM ajustes_plataforma WHERE setting_key = 'preceptor_registration_key' LIMIT 1"
          );
          const validKey = String(keyRows[0]?.setting_value || 'PRECEPTOR2026').trim().toUpperCase();
          if (validKey && submittedKey === validKey) {
            targetRoleName = 'preceptor';
          }
        }

        const [roleRows] = await db.execute<any[]>('SELECT id FROM roles WHERE name = ? LIMIT 1', [targetRoleName]);
        const roleId = roleRows[0]?.id || (targetRoleName === 'admin' ? 1 : targetRoleName === 'instructor' ? 2 : 3);

        const [ins] = await db.execute<any>(
          `INSERT INTO usuarios (first_name, last_name, email, avatar_url, role_id, status, email_verified_at, preferences)
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
          if (sy >= 1 && cd >= 1) {
            await syncStudentCourseEnrollments(user.id, sy, cd).catch(() => {});
          }
        }
      }

      // Registra el vínculo entre el usuario y el proveedor en identidades_usuario.
      await db.execute(
        'INSERT IGNORE INTO identidades_usuario (user_id, provider, provider_user_id, provider_email) VALUES (?, ?, ?, ?)',
        [user.id, provider, profile.id, profile.email.toLowerCase()]
      );
    }

    if (user.status === 'suspended') {
      return sendRedirectWithBridge(makeTarget({ error: 'Tu cuenta ha sido suspendida' }), 'Cuenta suspendida...');
    }

    // Verifica si el usuario tiene activada una aplicación autenticadora TOTP.
    const [tfRows] = await db.execute<any[]>('SELECT id, enabled_at FROM doble_factor_usuario WHERE user_id = ? AND enabled_at IS NOT NULL', [user.id]);
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

    // Emite los tokens de sesión y redirige de regreso al cliente con las credenciales.
    await logAudit(user.id, 'USER_LOGIN_OAUTH_PROXY', 'user', user.id, { provider });
    const sessionTokens = await tokens.issueSession(user, String(req.headers['user-agent'] || 'Expo Go Client'));

    return sendRedirectWithBridge(
      makeTarget({
        token: sessionTokens.accessToken,
        accessToken: sessionTokens.accessToken,
        refreshToken: sessionTokens.refreshToken,
        success: 'true',
      }),
      '¡Inicio de sesión exitoso! Volviendo a Campus Técnica 5...'
    );
  } catch (err: any) {
    console.error('OAuth Callback Error:', err);
    return sendRedirectWithBridge(
      makeTarget({ error: err.message || 'Error durante la verificación con el proveedor social' }),
      'Error de autenticación...'
    );
  }
});

// Autentica o registra a un usuario mediante token directo de un proveedor OAuth 2.0.
export const socialLogin = asyncHandler(async (req: Request, res: Response) => {
  // Obtiene el perfil del usuario desde el proveedor social correspondiente.
  const provider = String(req.params.provider || '');
  const profile = await social.getProfile(provider, req.body);

  // Busca si la identidad social ya está asociada a un usuario activo.
  const [identityRows] = await db.execute<any[]>(
    `SELECT u.*, r.name AS role_name
     FROM identidades_usuario ui
     JOIN usuarios u ON u.id = ui.user_id
     JOIN roles r ON r.id = u.role_id
     WHERE ui.provider = ? AND ui.provider_user_id = ? AND u.deleted_at IS NULL`,
    [provider, profile.id]
  );

  let user = identityRows[0];

  // Si no existe la identidad, busca por correo electrónico o crea la cuenta validando claves de rol.
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
      const [[{ totalUsers }]] = await db.execute<any[]>('SELECT COUNT(*) AS totalUsers FROM usuarios WHERE deleted_at IS NULL');
      const isFirstUser = Number(totalUsers) === 0;
      let targetRoleName = isFirstUser ? 'admin' : 'student';

      if (!isFirstUser && String(req.body?.role || '').trim().toLowerCase() === 'instructor') {
        const submittedKey = String(req.body?.instructorKey ?? req.body?.instructorCode ?? '').trim().toUpperCase();
        if (!submittedKey) {
          throw new AppError(
            'Debés completar el campo de clave de docente para ingresar como docente.',
            422,
            'INSTRUCTOR_KEY_REQUIRED',
            [{ field: 'instructorKey', message: 'Debés completar este campo con la clave de docente' }]
          );
        }
        const [keyRows] = await db.execute<any[]>(
          "SELECT setting_value FROM ajustes_plataforma WHERE setting_key = 'instructor_registration_key' LIMIT 1"
        );
        const validKey = String(keyRows[0]?.setting_value || '').trim().toUpperCase();
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

      const [roleRows] = await db.execute<any[]>('SELECT id FROM roles WHERE name = ? LIMIT 1', [targetRoleName]);
      const roleId = roleRows[0]?.id || (targetRoleName === 'admin' ? 1 : targetRoleName === 'instructor' ? 2 : 3);
      const [ins] = await db.execute<any>(
        `INSERT INTO usuarios (first_name, last_name, email, avatar_url, role_id, status, email_verified_at, preferences)
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
      'INSERT IGNORE INTO identidades_usuario (user_id, provider, provider_user_id, provider_email) VALUES (?, ?, ?, ?)',
      [user.id, provider, profile.id, profile.email.toLowerCase()]
    );
  }

  if (user.status === 'suspended') {
    throw new AppError('Tu cuenta está suspendida', 403, 'ACCOUNT_SUSPENDED');
  }

  await logAudit(user.id, 'USER_LOGIN_OAUTH', 'user', user.id, { provider });
  res.json(await buildSessionResponse(user, req));
});

// Renueva el par de tokens de sesión utilizando un token de actualización válido.
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  // Consume el token de actualización y verifica que el usuario siga activo.
  const userId = await tokens.consumeRefresh(req.body.refreshToken);
  if (!userId) throw new AppError('Sesión vencida. Iniciá sesión nuevamente.', 401, 'REFRESH_EXPIRED');
  const user = await findById(userId);
  if (!user || user.status === 'suspended') {
    throw new AppError('Cuenta no disponible', 401, 'ACCOUNT_UNAVAILABLE');
  }

  // Emite un nuevo par de tokens JWT y de actualización.
  const sessionTokens = await tokens.issueSession(user, String(req.headers['user-agent'] || 'Campus App'));
  res.json({ success: true, ...sessionTokens, data: sessionTokens });
});

// Cierra la sesión actual revocando el token de actualización enviado.
export const logout = asyncHandler(async (req: Request, res: Response) => {
  // Si se proporcionó un token de actualización, lo marca como revocado en la base de datos.
  if (req.body?.refreshToken) {
    await tokens.revokeRefresh(req.body.refreshToken);
  }
  res.status(204).end();
});

// Lista todas las sesiones activas pertenecientes al usuario autenticado.
export const listSessions = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Consulta las sesiones activas en la tabla tokens_renovacion.
  const sessions = await tokens.listActiveSessions(req.user!.id);
  res.json({ success: true, data: sessions });
});

// Revoca una sesión activa específica del usuario autenticado por su identificador.
export const revokeSession = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Marca la sesión indicada como revocada y verifica que perteneciera al usuario.
  const ok = await tokens.revokeSessionById(req.user!.id, Number(req.params.id));
  if (!ok) throw new AppError('Sesión no encontrada', 404, 'SESSION_NOT_FOUND');
  res.json({ success: true, message: 'Sesión cerrada correctamente' });
});
