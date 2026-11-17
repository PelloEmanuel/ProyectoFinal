// Importa el enrutador de Express, el controlador de asistencia y el intermediario de autenticación.
import { Router } from 'express';
import * as attendanceCtrl from '../controladores/controladorAsistencia';
import { authenticate } from '../intermediarios/autenticacion';

// Inicializa el enrutador para las operaciones de asistencia escolar.
const router = Router();

// Exige autenticación mediante token JWT en todas las rutas de asistencia.
router.use(authenticate);

// Lista todos los cursos escolares abiertos para la toma de asistencia.
router.get('/open-courses', attendanceCtrl.listOpenCourses);

// Obtiene la nómina de alumnos inscritos en un año y división determinados.
router.get('/students', attendanceCtrl.getCourseStudents);

// Obtiene la planilla diaria de asistencia y el estado de clases de un curso.
router.get('/sheet', attendanceCtrl.getAttendanceSheet);

// Registra o actualiza el estado de asistencia de los alumnos para una fecha.
router.post('/record', attendanceCtrl.recordAttendance);

// Define si un curso tuvo clases normales o sin actividad en una fecha específica.
router.post('/day-status', attendanceCtrl.setDayAttendanceStatus);

// Lista y procesa las peticiones de ingreso o cambio de curso de alumnos por parte del Preceptor.
router.get('/course-requests', attendanceCtrl.listCourseRequests);
router.post('/course-requests/:id/approve', attendanceCtrl.approveCourseRequest);
router.post('/course-requests/:id/reject', attendanceCtrl.rejectCourseRequest);

export default router;
