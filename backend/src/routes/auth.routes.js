/**
 * Archivo: backend/src/routes/auth.routes.js
 * Descripción: Rutas de autenticación, verificación de correo, recuperación, OAuth, 2FA y sesiones.
 */
const router = require('express').Router();
const { body, param } = require('express-validator');
const rateLimit = require('express-rate-limit');
const c = require('../controllers/auth.controller');
const validate = require('../middlewares/validate');
const { authenticate, optionalAuth } = require('../middlewares/auth');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados intentos. Probá de nuevo en unos minutos.' },
});
router.use(limiter);

const emailRule = body('email').isEmail().withMessage('Ingresá un correo electrónico válido');
const passwordRule = body('password')
  .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
  .matches(/[A-Za-z]/).withMessage('La contraseña debe incluir letras')
  .matches(/\d/).withMessage('La contraseña debe incluir al menos un número');

router.get('/registration-status', c.registrationStatus);

router.post(
  '/register',
  body('firstName').optional().trim().isLength({ min: 2, max: 80 }).withMessage('El nombre debe tener entre 2 y 80 caracteres'),
  body('lastName').optional().trim().isLength({ min: 2, max: 80 }).withMessage('El apellido debe tener entre 2 y 80 caracteres'),
  emailRule,
  passwordRule,
  validate,
  c.register
);

router.post(
  '/login',
  emailRule,
  body('password').notEmpty().withMessage('Ingresá tu contraseña'),
  validate,
  c.login
);

router.get('/me', authenticate, c.me);
router.post('/logout', c.logout);
router.post('/refresh', body('refreshToken').notEmpty().withMessage('refreshToken requerido'), validate, c.refresh);

router.get('/verify-email', c.verifyEmail);
router.post('/verify-email', optionalAuth, c.verifyEmail);
router.post('/resend-verification', optionalAuth, c.resendVerification);

router.get('/mail-diagnostic', c.mailDiagnostic);
router.post('/forgot-password', emailRule, validate, c.forgotPassword);
router.post(
  '/reset-password',
  emailRule,
  body('newPassword')
    .isLength({ min: 8 }).withMessage('La nueva contraseña debe tener al menos 8 caracteres')
    .matches(/[A-Za-z]/).withMessage('Debe incluir letras')
    .matches(/\d/).withMessage('Debe incluir al menos un número'),
  validate,
  c.resetPassword
);

// Proveedores OAuth 2.0 (Google, GitHub, Discord, Facebook)
router.get('/oauth/:provider/start', c.oauthStart);
router.get('/oauth/:provider/callback', c.oauthCallback);
router.post('/oauth/:provider', c.socialLogin);
router.post('/social/:provider', c.socialLogin);

// Segundo factor TOTP
router.post('/2fa/setup', authenticate, c.setupTwoFactor);
router.post('/2fa/verify', optionalAuth, c.verifyTwoFactor);
router.post('/2fa/confirm', optionalAuth, c.verifyTwoFactor);
router.post('/2fa/disable', authenticate, c.disableTwoFactor);
router.post('/2fa/resend', optionalAuth, c.resendVerification);

// Gestión de sesiones
router.get('/sessions', authenticate, c.listSessions);
router.delete('/sessions/:id', authenticate, param('id').isInt(), validate, c.revokeSession);

module.exports = router;
