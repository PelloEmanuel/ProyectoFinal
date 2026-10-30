/**
 * Archivo: backend/src/routes/courses.routes.js
 * Descripción: Rutas de cursos, módulos, lecciones, inscripciones, progreso, favoritos y anuncios.
 */
const router = require('express').Router();
const { body, param } = require('express-validator');
const c = require('../controllers/courses.controller');
const ac = require('../controllers/assignments.controller');
const comm = require('../controllers/comments.controller');
const validate = require('../middlewares/validate');
const { authenticate, optionalAuth, authorize } = require('../middlewares/auth');

const idParam = param('id').isInt().withMessage('ID inválido');

router.get('/', optionalAuth, c.listCourses);
router.get('/school-group/:schoolYear/:courseDivision', optionalAuth, c.getSchoolGroupSchedule);
router.get('/:id', idParam, validate, optionalAuth, c.getCourse);

router.post(
  '/',
  authenticate,
  authorize('instructor', 'admin'),
  (req, _res, next) => {
    const sy = Number(req.body.schoolYear) || 1;
    const cd = Number(req.body.courseDivision) || 1;
    if (!req.body.shortDescription && req.body.summary) {
      req.body.shortDescription = req.body.summary;
    }
    if (!req.body.shortDescription || String(req.body.shortDescription).trim().length < 10) {
      req.body.shortDescription = `Materia ${req.body.title || 'Académica'} correspondiente a ${sy}° Año - ${cd}° Curso`;
    }
    if (!req.body.description || String(req.body.description).trim().length < 10) {
      req.body.description = req.body.shortDescription;
    }
    if (!req.body.estimatedDuration && req.body.estimatedHours) {
      req.body.estimatedDuration = req.body.estimatedHours;
    }
    next();
  },
  body('title').trim().isLength({ min: 2, max: 160 }).withMessage('El nombre de la materia debe tener entre 2 y 160 caracteres'),
  body('shortDescription').trim().isLength({ min: 10, max: 300 }).withMessage('La descripción corta debe tener entre 10 y 300 caracteres'),
  body('description').trim().isLength({ min: 10 }).withMessage('La descripción completa debe tener al menos 10 caracteres'),
  validate,
  c.createCourse
);

router.patch('/:id', authenticate, authorize('instructor', 'admin'), idParam, validate, c.updateCourse);
router.put('/:id', authenticate, authorize('instructor', 'admin'), idParam, validate, c.updateCourse);
router.delete('/:id', authenticate, authorize('instructor', 'admin'), idParam, validate, c.deleteCourse);
router.post('/:id/publish', authenticate, authorize('instructor', 'admin'), idParam, validate, c.publishCourse);
router.post('/:id/archive', authenticate, authorize('instructor', 'admin'), idParam, validate, c.archiveCourse);

// Módulos del curso
router.get('/:id/modules', idParam, validate, optionalAuth, c.listModules);
router.post(
  '/:id/modules',
  authenticate,
  authorize('instructor', 'admin'),
  idParam,
  body('title').trim().isLength({ min: 3, max: 150 }).withMessage('El título del módulo debe tener entre 3 y 150 caracteres'),
  validate,
  c.createModule
);

// Inscripciones y favoritos
router.post('/:id/enroll', authenticate, idParam, validate, c.enrollCourse);
router.delete('/:id/enroll', authenticate, idParam, validate, c.unenrollCourse);
router.post('/:id/favorite', authenticate, idParam, validate, c.addFavorite);
router.delete('/:id/favorite', authenticate, idParam, validate, c.removeFavorite);

// Actividades del curso
router.get('/:id/assignments', authenticate, idParam, validate, ac.listCourseAssignments);
router.post(
  '/:id/assignments',
  authenticate,
  authorize('instructor', 'admin'),
  idParam,
  (req, _res, next) => {
    if (!req.body.description && req.body.instructions) {
      req.body.description = req.body.instructions;
    }
    if (!req.body.description || String(req.body.description).trim().length < 2) {
      req.body.description = req.body.title ? `Consigna de ${req.body.title}` : 'Actividad práctica';
    }
    next();
  },
  body('title').trim().isLength({ min: 2, max: 160 }).withMessage('El título de la actividad es obligatorio'),
  body('description').trim().isLength({ min: 2 }).withMessage('La consigna de la actividad es obligatoria'),
  validate,
  ac.createAssignment
);

// Anuncios del curso
router.get('/:id/announcements', authenticate, idParam, validate, c.listAnnouncements);
router.post(
  '/:id/announcements',
  authenticate,
  authorize('instructor', 'admin'),
  idParam,
  body('title').optional().trim(),
  body('content').trim().isLength({ min: 2 }).withMessage('El mensaje del aviso es obligatorio'),
  validate,
  c.createAnnouncement
);

// Comentarios públicos y chat privado del Tablón (avisos, material teórico, actividades)
router.get('/:id/feed-comments', authenticate, idParam, validate, comm.listFeedComments);
router.post('/:id/feed-comments', authenticate, idParam, validate, comm.createFeedComment);
router.get(
  '/:id/feed-comments/students',
  authenticate,
  authorize('instructor', 'admin'),
  idParam,
  validate,
  comm.listPrivateCommentStudents
);

module.exports = router;
