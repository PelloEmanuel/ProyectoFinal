import { Router } from 'express';
import { body } from 'express-validator';
import * as c from '../controladores/controladorUsuarios';
import validate from '../intermediarios/validacion';
import { authenticate } from '../intermediarios/autenticacion';

// Inicializa el enrutador para las operaciones del perfil de usuario autenticado.
const router = Router();

// Exige autenticación JWT en todas las rutas del perfil de usuario.
router.use(authenticate);

// Obtiene y actualiza los datos personales del perfil del usuario actual.
router.get('/me', c.me);
router.put(
  '/me',
  body('firstName').optional().trim().isLength({ min: 2, max: 80 }).withMessage('El nombre debe tener entre 2 y 80 caracteres'),
  body('lastName').optional().trim().isLength({ min: 2, max: 80 }).withMessage('El apellido debe tener entre 2 y 80 caracteres'),
  body('name').optional().trim().isLength({ min: 2, max: 160 }).withMessage('El nombre debe tener entre 2 y 160 caracteres'),
  body('newPassword')
    .optional()
    .notEmpty().withMessage('Ingresá la nueva contraseña'),
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

// Permite actualizar preferencias de interfaz, cambiar contraseña o dar de baja la propia cuenta.
router.patch('/me/preferences', c.updatePreferences);
router.patch(
  '/me/password',
  body('newPassword').notEmpty().withMessage('Ingresá la nueva contraseña'),
  validate,
  c.updatePassword
);
router.delete('/me', c.deleteMe);

// Gestiona el curso escolar del alumno, horario, panel, inscripciones, estadísticas, favoritos, certificados y calendario.
router.patch('/me/school-group', c.setSchoolGroup);
router.put('/me/school-group', c.setSchoolGroup);
router.get('/me/schedule', c.mySchedule);
router.get('/me/dashboard', c.studentDashboard);
router.get('/me/enrollments', c.myEnrollments);
router.get('/me/statistics', c.myStatistics);
router.get('/me/favorites', c.myFavorites);
router.get('/me/certificates', c.myCertificates);
router.get('/me/calendar', c.myCalendar);

export default router;
