import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import * as c from '../controladores/controladorCursos';
import * as ac from '../controladores/controladorTareas';
import * as comm from '../controladores/controladorComentarios';
import validate from '../intermediarios/validacion';
import { authenticate, optionalAuth, authorize } from '../intermediarios/autenticacion';

// Inicializa el enrutador para la gestión de cursos, módulos, inscripciones, anuncios y comentarios.
const router = Router();

// Define la regla de validación para identificadores numéricos de curso.
const idParam = param('id').isInt().withMessage('ID inválido');

// Expone el catálogo de cursos, los grupos escolares abiertos y el horario por año y división.
router.get('/', optionalAuth, c.listCourses);
router.get('/available-school-groups', optionalAuth, c.getAvailableSchoolGroups);
router.get('/school-group/:schoolYear/:courseDivision', optionalAuth, c.getSchoolGroupSchedule);
router.get('/:id', idParam, validate, optionalAuth, c.getCourse);

// Permite a docentes y administradores crear un nuevo curso o materia escolar.
router.post(
  '/',
  authenticate,
  authorize('instructor', 'admin'),
  (req: Request, _res: Response, next: NextFunction) => {
    // Normaliza las descripciones y duración estimada si no fueron especificadas explícitamente.
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

// Gestiona la edición, eliminación, publicación y archivado de cursos.
router.patch('/:id', authenticate, authorize('instructor', 'admin'), idParam, validate, c.updateCourse);
router.put('/:id', authenticate, authorize('instructor', 'admin'), idParam, validate, c.updateCourse);
router.delete('/:id', authenticate, authorize('instructor', 'admin'), idParam, validate, c.deleteCourse);
router.post('/:id/publish', authenticate, authorize('instructor', 'admin'), idParam, validate, c.publishCourse);
router.post('/:id/archive', authenticate, authorize('instructor', 'admin'), idParam, validate, c.archiveCourse);

// Lista y crea módulos temáticos dentro de un curso.
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

// Gestiona la inscripción, baja de inscripción y marcado de cursos favoritos.
router.post('/:id/enroll', authenticate, idParam, validate, c.enrollCourse);
router.delete('/:id/enroll', authenticate, idParam, validate, c.unenrollCourse);
router.post('/:id/favorite', authenticate, idParam, validate, c.addFavorite);
router.delete('/:id/favorite', authenticate, idParam, validate, c.removeFavorite);

// Lista y crea actividades evaluables asociadas a un curso.
router.get('/:id/assignments', authenticate, idParam, validate, ac.listCourseAssignments);
router.post(
  '/:id/assignments',
  authenticate,
  authorize('instructor', 'admin'),
  idParam,
  (req: Request, _res: Response, next: NextFunction) => {
    // Completa la descripción de la consigna si se envió como instructions o quedó breve.
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

// Lista y publica avisos oficiales en el tablón del curso.
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

// Gestiona los comentarios públicos y mensajes privados en las publicaciones del tablón.
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

export default router;
