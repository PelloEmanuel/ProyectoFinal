/**
 * Archivo: backend/src/routes/assignments.routes.js
 * Descripción: Rutas para actividades, intentos, entregas, autocorrección y corrección del instructor.
 */
const router = require('express').Router();
const { body, param } = require('express-validator');
const ac = require('../controllers/assignments.controller');
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');

const idParam = param('id').isInt().withMessage('ID inválido');

// Actividades del estudiante e instructor
router.get('/assignments', authenticate, ac.listMyAssignments);
router.post('/assignments', authenticate, authorize('instructor', 'admin'), ac.createAssignment);
router.get('/assignments/:id', authenticate, idParam, validate, ac.getAssignment);
router.patch('/assignments/:id', authenticate, authorize('instructor', 'admin'), idParam, validate, ac.updateAssignment);
router.delete('/assignments/:id', authenticate, authorize('instructor', 'admin'), idParam, validate, ac.deleteAssignment);

// Intentos y entregas
router.post('/assignments/:id/attempts', authenticate, idParam, validate, ac.startAttempt);
router.get('/attempts/:id', authenticate, idParam, validate, ac.getAttempt);
router.put('/attempts/:id/answers', authenticate, idParam, validate, ac.saveAttemptAnswers);
router.post('/attempts/:id/submit', authenticate, idParam, validate, ac.submitAttempt);

// Panel y corrección del instructor
router.get('/instructor/dashboard', authenticate, authorize('instructor', 'admin'), ac.instructorDashboard);
router.get('/instructor/courses', authenticate, authorize('instructor', 'admin', 'preceptor'), ac.listInstructorCourses);
router.get('/instructor/students', authenticate, authorize('instructor', 'admin', 'preceptor'), ac.listInstructorStudents);
router.get('/instructor/assignments/pending', authenticate, authorize('instructor', 'admin'), (req, res, next) => {
  req.query.status = 'submitted';
  return ac.listInstructorAttempts(req, res, next);
});
router.get('/instructor/attempts', authenticate, authorize('instructor', 'admin'), ac.listInstructorAttempts);

router.post(
  '/attempts/:id/grade',
  authenticate,
  authorize('instructor', 'admin'),
  idParam,
  body('score').isNumeric().withMessage('La calificación numérica es obligatoria'),
  validate,
  ac.gradeAttempt
);
router.patch(
  '/attempts/:id/grade',
  authenticate,
  authorize('instructor', 'admin'),
  idParam,
  body('score').isNumeric().withMessage('La calificación numérica es obligatoria'),
  validate,
  ac.gradeAttempt
);

module.exports = router;
