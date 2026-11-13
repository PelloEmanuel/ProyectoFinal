import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import * as adm from '../controladores/controladorAdmin';
import * as cc from '../controladores/controladorCursos';
import validate from '../intermediarios/validacion';
import { authenticate, optionalAuth, authorize } from '../intermediarios/autenticacion';

// Inicializa el enrutador de administración, catálogos, notificaciones y cronograma escolar.
const router = Router();

// Define el validador estándar para parámetros numéricos de ruta.
const idParam = param('id').isInt().withMessage('ID inválido');

// Expone los catálogos públicos o autenticados de categorías y habilidades.
router.get('/categories', optionalAuth, cc.listCategories);
router.get('/skills', optionalAuth, cc.listSkills);

// Permite verificar públicamente un certificado por su código o consultarlo por ID.
router.get('/certificates/verify/:code', adm.verifyCertificatePublic);
router.get('/certificates/:id', authenticate, idParam, validate, adm.getCertificate);

// Gestiona la bandeja de notificaciones del usuario autenticado.
router.get('/notifications', authenticate, adm.listNotifications);
router.patch('/notifications/:id/read', authenticate, idParam, validate, adm.markNotificationRead);
router.post('/notifications/read-all', authenticate, adm.markAllNotificationsRead);

// Gestiona la edición, eliminación y creación de lecciones dentro de módulos.
router.patch('/modules/:id', authenticate, authorize('instructor', 'admin'), idParam, validate, cc.updateModule);
router.delete('/modules/:id', authenticate, authorize('instructor', 'admin'), idParam, validate, cc.deleteModule);
router.post(
  '/modules/:id/lessons',
  authenticate,
  authorize('instructor', 'admin'),
  idParam,
  (req: Request, _res: Response, next: NextFunction) => {
    // Completa el contenido por defecto si el docente solo ingresó texto alternativo o título.
    if (!req.body.content && req.body.contentText) {
      req.body.content = req.body.contentText;
    }
    if (!req.body.content || String(req.body.content).trim().length < 5) {
      req.body.content = req.body.title
        ? `Material de estudio y teoría: ${req.body.title}`
        : 'Material de estudio y teoría académica adjunto.';
    }
    next();
  },
  body('title').trim().isLength({ min: 2, max: 150 }).withMessage('El título de la lección o material es obligatorio'),
  body('content').trim().isLength({ min: 5 }).withMessage('El contenido de la lección es obligatorio'),
  validate,
  cc.createLesson
);

// Gestiona la lectura, edición, borrado y progreso de lecciones individuales.
router.get('/lessons/:id', authenticate, idParam, validate, cc.getLesson);
router.patch('/lessons/:id', authenticate, authorize('instructor', 'admin'), idParam, validate, cc.updateLesson);
router.delete('/lessons/:id', authenticate, authorize('instructor', 'admin'), idParam, validate, cc.deleteLesson);
router.post('/lessons/:id/start', authenticate, idParam, validate, cc.startLesson);
router.post('/lessons/:id/complete', authenticate, idParam, validate, cc.completeLesson);

// Consulta detalles y avance de una inscripción específica.
router.get('/enrollments/:id', authenticate, idParam, validate, cc.getEnrollment);
router.get('/enrollments/:id/progress', authenticate, idParam, validate, cc.getEnrollmentProgress);

// Permite a docentes y administradores editar o eliminar anuncios publicados.
router.patch('/announcements/:id', authenticate, authorize('instructor', 'admin'), idParam, validate, cc.updateAnnouncement);
router.delete('/announcements/:id', authenticate, authorize('instructor', 'admin'), idParam, validate, cc.deleteAnnouncement);

// Expone las métricas globales, reportes estadísticos y bitácora de auditoría para administradores.
router.get('/admin/dashboard', authenticate, authorize('admin'), adm.adminDashboard);
router.get('/admin/reports', authenticate, authorize('admin'), adm.reportUnified);
router.get('/admin/reports/users', authenticate, authorize('admin'), adm.reportUsers);
router.get('/admin/reports/courses', authenticate, authorize('admin'), adm.reportCourses);
router.get('/admin/reports/enrollments', authenticate, authorize('admin'), adm.reportEnrollments);
router.get('/admin/reports/completion', authenticate, authorize('admin'), adm.reportCompletion);
router.get('/admin/audit-logs', authenticate, authorize('admin'), adm.listAuditLogs);

// Gestiona el CRUD administrativo de usuarios, roles y estados de cuenta.
router.get('/admin/users', authenticate, authorize('admin'), adm.listUsers);
router.get('/admin/users/:id', authenticate, authorize('admin'), idParam, validate, adm.getUser);
router.post(
  '/admin/users',
  authenticate,
  authorize('admin'),
  body('firstName').trim().isLength({ min: 2 }).withMessage('Nombre obligatorio'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Contraseña obligatoria'),
  body('role').isIn(['admin', 'preceptor', 'instructor', 'student']).withMessage('Rol inválido'),
  validate,
  adm.createUser
);
router.patch('/admin/users/:id', authenticate, authorize('admin'), idParam, validate, adm.updateUser);
router.patch(
  '/admin/users/:id/role',
  authenticate,
  authorize('admin'),
  idParam,
  body('role').isIn(['admin', 'preceptor', 'instructor', 'student']).withMessage('Rol inválido'),
  validate,
  adm.setUserRole
);
router.patch('/admin/users/:id/status', authenticate, authorize('admin'), idParam, validate, adm.setUserStatus);
router.delete('/admin/users/:id', authenticate, authorize('admin'), idParam, validate, adm.deleteUser);

// Gestiona el CRUD administrativo de categorías y habilidades académicas.
router.post(
  '/categories',
  authenticate,
  authorize('admin'),
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Nombre de categoría obligatorio'),
  validate,
  adm.createCategory
);
router.patch('/categories/:id', authenticate, authorize('admin'), idParam, validate, adm.updateCategory);
router.delete('/categories/:id', authenticate, authorize('admin'), idParam, validate, adm.deleteCategory);

router.post(
  '/skills',
  authenticate,
  authorize('admin'),
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Nombre de habilidad obligatorio'),
  validate,
  adm.createSkill
);
router.patch('/skills/:id', authenticate, authorize('admin'), idParam, validate, adm.updateSkill);
router.delete('/skills/:id', authenticate, authorize('admin'), idParam, validate, adm.deleteSkill);

// Consulta y actualiza los parámetros globales de configuración de la plataforma.
router.get('/admin/settings', authenticate, authorize('admin'), adm.getSettings);
router.put('/admin/settings', authenticate, authorize('admin'), adm.updateSettings);

// Gestiona el catálogo oficial de materias escolares en la base de datos.
router.get('/admin/subjects', authenticate, authorize('admin'), adm.listSubjects);
router.post('/admin/subjects', authenticate, authorize('admin'), adm.createSubject);
router.patch('/admin/subjects/:id', authenticate, authorize('admin'), adm.updateSubject);
router.put('/admin/subjects/:id', authenticate, authorize('admin'), adm.updateSubject);
router.delete('/admin/subjects/:id', authenticate, authorize('admin'), adm.deleteSubject);

// Gestiona el cronograma escolar de materias, bloques horarios y asignación de docentes.
router.get('/admin/schedule', authenticate, authorize('admin'), adm.getSchoolSchedule);
router.post('/admin/schedule', authenticate, authorize('admin'), adm.addScheduleEntry);
router.delete('/admin/schedule/:id', authenticate, authorize('admin'), idParam, validate, adm.deleteScheduleEntry);
router.put('/admin/courses/:id/schedule', authenticate, authorize('admin'), idParam, validate, adm.updateCourseScheduleInGroup);
router.patch('/admin/courses/:id/schedule', authenticate, authorize('admin'), idParam, validate, adm.updateCourseScheduleInGroup);
router.delete('/admin/courses/:id/schedule', authenticate, authorize('admin'), idParam, validate, adm.deleteCourseFromSchedule);
router.patch('/admin/courses/:id/instructor', authenticate, authorize('admin'), idParam, validate, adm.assignCourseInstructor);
router.put('/admin/courses/:id/instructor', authenticate, authorize('admin'), idParam, validate, adm.assignCourseInstructor);

// Gestiona la apertura, cierre, código de acceso y eliminación de cursos/divisiones escolares.
router.get('/admin/school-groups', authenticate, authorize('admin'), adm.listSchoolGroups);
router.post('/admin/school-groups', authenticate, authorize('admin'), adm.createSchoolGroup);
router.patch('/admin/school-groups/:id/code', authenticate, authorize('admin'), idParam, validate, adm.updateSchoolGroupAccessCode);
router.put('/admin/school-groups/:id/code', authenticate, authorize('admin'), idParam, validate, adm.updateSchoolGroupAccessCode);
router.patch('/admin/school-groups/:id/toggle', authenticate, authorize('admin'), idParam, validate, adm.toggleSchoolGroupStatus);
router.post('/admin/school-groups/:id/toggle', authenticate, authorize('admin'), idParam, validate, adm.toggleSchoolGroupStatus);
router.delete('/admin/school-groups/:id', authenticate, authorize('admin'), idParam, validate, adm.deleteSchoolGroup);

export default router;
