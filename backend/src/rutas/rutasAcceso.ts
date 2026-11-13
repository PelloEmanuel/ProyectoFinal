import { Router } from 'express';
import { body, param } from 'express-validator';
import rateLimit from 'express-rate-limit';
import * as c from '../controladores/controladorAcceso';
import validate from '../intermediarios/validacion';
import { authenticate, optionalAuth } from '../intermediarios/autenticacion';

// Inicializa el enrutador de Express para los endpoints de acceso y seguridad.
const router = Router();

// Configura un limitador de tasa de peticiones para proteger las rutas de autenticación frente a ataques de fuerza bruta.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados intentos. Probá de nuevo en unos minutos.' },
});
router.use(limiter);

// Define las reglas de validación comunes para correo electrónico y contraseña.
const emailRule = body('email').isEmail().withMessage('Ingresá un correo electrónico válido');
const passwordRule = body('password').notEmpty().withMessage('Ingresá tu contraseña');

// Consulta el estado inicial de registro y los cursos escolares abiertos.
router.get('/registration-status', c.registrationStatus);

// Registra una nueva cuenta de usuario validando los campos requeridos.
router.post(
  '/register',
  body('firstName').optional().trim().isLength({ min: 2, max: 80 }).withMessage('El nombre debe tener entre 2 y 80 caracteres'),
  body('lastName').optional().trim().isLength({ min: 2, max: 80 }).withMessage('El apellido debe tener entre 2 y 80 caracteres'),
  emailRule,
  passwordRule,
  validate,
  c.register
);

// Inicia sesión con correo electrónico y contraseña.
router.post(
  '/login',
  emailRule,
  body('password').notEmpty().withMessage('Ingresá tu contraseña'),
  validate,
  c.login
);

// Gestiona el perfil actual, cierre de sesión y renovación de tokens JWT.
router.get('/me', authenticate, c.me);
router.post('/logout', c.logout);
router.post('/refresh', body('refreshToken').notEmpty().withMessage('refreshToken requerido'), validate, c.refresh);

// Verifica la cuenta por correo electrónico y permite reenviar el código de verificación.
router.get('/verify-email', c.verifyEmail);
router.post('/verify-email', optionalAuth, c.verifyEmail);
router.post('/resend-verification', optionalAuth, c.resendVerification);

// Gestiona el diagnóstico de correo y la recuperación de contraseña olvidada.
router.get('/mail-diagnostic', c.mailDiagnostic);
router.post('/forgot-password', emailRule, validate, c.forgotPassword);
router.post(
  '/reset-password',
  emailRule,
  body('newPassword').notEmpty().withMessage('Ingresá la nueva contraseña'),
  validate,
  c.resetPassword
);

// Define las rutas de inicio, callback e ingreso con proveedores OAuth 2.0.
router.get('/oauth/:provider/start', c.oauthStart);
router.get('/oauth/:provider/callback', c.oauthCallback);
router.post('/oauth/:provider', c.socialLogin);
router.post('/social/:provider', c.socialLogin);

// Configura, verifica y desactiva el segundo factor de autenticación (2FA).
router.post('/2fa/setup', authenticate, c.setupTwoFactor);
router.post('/2fa/verify', optionalAuth, c.verifyTwoFactor);
router.post('/2fa/confirm', optionalAuth, c.verifyTwoFactor);
router.post('/2fa/disable', authenticate, c.disableTwoFactor);
router.post('/2fa/resend', optionalAuth, c.resendVerification);

// Lista y revoca las sesiones activas del usuario.
router.get('/sessions', authenticate, c.listSessions);
router.delete('/sessions/:id', authenticate, param('id').isInt(), validate, c.revokeSession);

export default router;
