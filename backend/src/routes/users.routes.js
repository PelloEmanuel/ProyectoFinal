const router = require('express').Router();
const { body, param } = require('express-validator');
const c = require('../controllers/users.controller');
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');

router.use(authenticate);

router.get('/me', c.me);
router.put('/me',
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  body('twoFactorEnabled').optional().isBoolean().withMessage('twoFactorEnabled debe ser booleano'),
  body('newPassword').optional()
    .isLength({ min: 8 }).withMessage('La nueva contraseña debe tener al menos 8 caracteres')
    .matches(/\d/).withMessage('La nueva contraseña debe incluir un número'),
  validate, c.updateMe);

router.get('/assignable', authorize('admin', 'manager'), c.assignable);

// Gestión de usuarios: solo administrador
router.get('/', authorize('admin'), c.list);
router.patch('/:id/role', authorize('admin'), param('id').isInt(),
  body('role').isIn(['admin', 'manager', 'user']).withMessage('Rol inválido'), validate, c.setRole);
router.patch('/:id/status', authorize('admin'), param('id').isInt(),
  body('isActive').isBoolean().withMessage('isActive debe ser booleano'), validate, c.setStatus);
router.delete('/:id', authorize('admin'), param('id').isInt(), validate, c.remove);

module.exports = router;
