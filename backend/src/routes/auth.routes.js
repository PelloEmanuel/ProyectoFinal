const router = require('express').Router();
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const c = require('../controllers/auth.controller');
const validate = require('../middlewares/validate');

// Protección básica contra fuerza bruta
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados intentos. Probá de nuevo en unos minutos.' },
});
router.use(limiter);

const email = body('email').isEmail().withMessage('Email inválido').normalizeEmail();
const password = body('password')
  .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
  .matches(/[A-Za-z]/).withMessage('La contraseña debe incluir letras')
  .matches(/\d/).withMessage('La contraseña debe incluir un número');

router.post('/register',
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  email, password,
  body('twoFactorEnabled').optional().isBoolean().withMessage('twoFactorEnabled debe ser booleano'),
  validate, c.register);

router.post('/login', email, body('password').notEmpty().withMessage('Ingresá tu contraseña'), validate, c.login);

router.post('/2fa/verify',
  body('userId').isInt().withMessage('userId inválido'),
  body('code').isLength({ min: 6, max: 6 }).isNumeric().withMessage('El código tiene 6 dígitos'),
  validate, c.verifyTwoFactor);

router.post('/2fa/resend', body('userId').isInt().withMessage('userId inválido'), validate, c.resendTwoFactor);

router.post('/social/:provider', c.socialLogin);
router.post('/refresh', body('refreshToken').notEmpty().withMessage('refreshToken requerido'), validate, c.refresh);
router.post('/logout', c.logout);

module.exports = router;
