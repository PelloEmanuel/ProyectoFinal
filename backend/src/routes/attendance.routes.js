const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const attendanceCtrl = require('../controllers/attendance.controller');

// Todas las rutas requieren estar autenticado
router.use(authenticate);

// Listar cursos escolares abiertos y sus alumnos (Preceptor, Docente, Admin)
router.get('/open-courses', attendanceCtrl.listOpenCourses);
router.get('/students', attendanceCtrl.getCourseStudents);

// Planilla mensual de asistencia (Lectura: Preceptor, Docente, Admin)
router.get('/sheet', attendanceCtrl.getAttendanceSheet);

// Registro de asistencia (Escritura estricta: Únicamente Preceptor)
router.post('/record', attendanceCtrl.recordAttendance);
router.post('/day-status', attendanceCtrl.setDayAttendanceStatus);

module.exports = router;
