const router = require('express').Router();
const { body, param, query } = require('express-validator');
const c = require('../controllers/tasks.controller');
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');

router.use(authenticate);

const STATUS = ['pending', 'in_progress', 'done'];
const PRIORITY = ['low', 'medium', 'high'];
const id = param('id').isInt().withMessage('ID inválido');
const fields = (required) => [
  required
    ? body('title').trim().isLength({ min: 3, max: 150 }).withMessage('El título debe tener entre 3 y 150 caracteres')
    : body('title').optional().trim().isLength({ min: 3, max: 150 }).withMessage('El título debe tener entre 3 y 150 caracteres'),
  body('description').optional({ nullable: true }).isString().isLength({ max: 2000 }).withMessage('Descripción demasiado larga'),
  body('status').optional().isIn(STATUS).withMessage('Estado inválido'),
  body('priority').optional().isIn(PRIORITY).withMessage('Prioridad inválida'),
  body('dueDate').optional({ nullable: true, checkFalsy: true }).isISO8601({ strict: true }).withMessage('Fecha inválida (AAAA-MM-DD)'),
  body('assignedTo').optional({ nullable: true, checkFalsy: true }).isInt().withMessage('Usuario asignado inválido'),
];

router.get('/stats', authorize('admin', 'manager'), c.stats);
router.get('/',
  query('status').optional().isIn(STATUS).withMessage('Estado inválido'),
  query('priority').optional().isIn(PRIORITY).withMessage('Prioridad inválida'),
  validate, c.list);
router.get('/:id', id, validate, c.get);
router.post('/', fields(true), validate, c.create);
router.put('/:id', id, fields(false), validate, c.update);
router.delete('/:id', id, validate, c.remove);

module.exports = router;
