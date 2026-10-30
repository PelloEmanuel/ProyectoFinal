/**
 * Archivo: backend/src/routes/users.routes.js
 * Descripción: Rutas del perfil de usuario, preferencias, progreso, favoritos, calendario y certificados.
 */
const router = require('express').Router();
const { body } = require('express-validator');
const c = require('../controllers/users.controller');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');

router.use(authenticate);

router.get('/me', c.me);
router.put(
  '/me',
  body('firstName').optional().trim().isLength({ min: 2, max: 80 }).withMessage('El nombre debe tener entre 2 y 80 caracteres'),
  body('lastName').optional().trim().isLength({ min: 2, max: 80 }).withMessage('El apellido debe tener entre 2 y 80 caracteres'),
  body('name').optional().trim().isLength({ min: 2, max: 160 }).withMessage('El nombre debe tener entre 2 y 160 caracteres'),
  body('newPassword')
    .optional()
    .isLength({ min: 8 }).withMessage('La nueva contraseña debe tener al menos 8 caracteres')
    .matches(/\d/).withMessage('Debe incluir al menos un número'),
  validate,
  c.updateMe
);
router.patch(
  '/me',
  body('firstName').optional().trim().isLength({ min: 2, max: 80 }).withMessage('El nombre debe tener entre 2 y 80 caracteres'),
  body('lastName').optional().trim().isLength({ min: 2, max: 80 }).withMessage('El apellido debe tener entre 2 y 80 caracteres'),
  validate,
  c.updateMe
);

router.patch('/me/preferences', c.updatePreferences);
router.patch(
  '/me/password',
  body('newPassword')
    .isLength({ min: 8 }).withMessage('La nueva contraseña debe tener al menos 8 caracteres')
    .matches(/[A-Za-z]/).withMessage('Debe incluir letras')
    .matches(/\d/).withMessage('Debe incluir un número'),
  validate,
  c.updatePassword
);
router.delete('/me', c.deleteMe);

router.patch('/me/school-group', c.setSchoolGroup);
router.put('/me/school-group', c.setSchoolGroup);
router.get('/me/schedule', c.mySchedule);
router.get('/me/dashboard', c.studentDashboard);
router.get('/me/enrollments', c.myEnrollments);
router.get('/me/statistics', c.myStatistics);
router.get('/me/favorites', c.myFavorites);
router.get('/me/certificates', c.myCertificates);
router.get('/me/calendar', c.myCalendar);

module.exports = router;
