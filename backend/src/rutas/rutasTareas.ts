import { Router } from 'express';
import { body, param } from 'express-validator';
import * as ac from '../controladores/controladorTareas';
import validate from '../intermediarios/validacion';
import { authenticate, authorize } from '../intermediarios/autenticacion';
import { SolicitudAutenticada } from '../tipos';

// Inicializa el enrutador de tareas, entregas y panel de evaluación docente.
const router = Router();

// Define el validador para identificadores numéricos en las rutas.
const idParam = param('id').isInt().withMessage('ID inválido');

// Gestiona la consulta, creación, edición y borrado de actividades académicas.
router.get('/assignments', authenticate, ac.listMyAssignments);
router.post('/assignments', authenticate, authorize('instructor', 'admin'), ac.createAssignment);
router.get('/assignments/:id', authenticate, idParam, validate, ac.getAssignment);
router.patch('/assignments/:id', authenticate, authorize('instructor', 'admin'), idParam, validate, ac.updateAssignment);
router.delete('/assignments/:id', authenticate, authorize('instructor', 'admin'), idParam, validate, ac.deleteAssignment);

// Gestiona el inicio de intentos, guardado de respuestas y envío de entregas por parte de los alumnos.
router.post('/assignments/:id/attempts', authenticate, idParam, validate, ac.startAttempt);
router.get('/attempts/:id', authenticate, idParam, validate, ac.getAttempt);
router.put('/attempts/:id/answers', authenticate, idParam, validate, ac.saveAttemptAnswers);
router.post('/attempts/:id/submit', authenticate, idParam, validate, ac.submitAttempt);

// Expone los endpoints del panel docente para consultar cursos, alumnos y entregas pendientes.
router.get('/instructor/dashboard', authenticate, authorize('instructor', 'admin'), ac.instructorDashboard);
router.get('/instructor/courses', authenticate, authorize('instructor', 'admin', 'preceptor'), ac.listInstructorCourses);
router.get('/instructor/students', authenticate, authorize('instructor', 'admin', 'preceptor'), ac.listInstructorStudents);
router.get('/instructor/assignments/pending', authenticate, authorize('instructor', 'admin'), (req: SolicitudAutenticada, res, next) => {
  // Filtra automáticamente las entregas que están pendientes de calificación.
  req.query.status = 'submitted';
  return ac.listInstructorAttempts(req, res, next);
});
router.get('/instructor/attempts', authenticate, authorize('instructor', 'admin'), ac.listInstructorAttempts);

// Permite a docentes y administradores calificar una entrega y registrar su devolución.
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

export default router;
