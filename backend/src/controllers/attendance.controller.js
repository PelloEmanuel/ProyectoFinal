/**
 * Archivo: backend/src/controllers/attendance.controller.js
 * Descripción: Módulo escolar de control y registro de Asistencia de alumnos:
 * - El PRECEPTOR/A es el único con permisos de escritura/modificación.
 * - Los DOCENTES y el ADMINISTRADOR tienen permisos de lectura para observar.
 * - Soporta estados: presente, falta completa (1), media falta (0.5), cuarto de falta (0.25),
 *   falta justificada y nulo (suspensión de clases).
 * - Cuadrícula calendario de Lunes a Viernes por mes (Enero a Diciembre).
 */
const db = require('../config/db');
const { AppError, asyncHandler } = require('../utils/errors');
const { logAudit } = require('../utils/audit');

const VALID_STATUSES = ['presente', 'falta_completa', 'media_falta', 'cuarto_falta', 'justificada', 'nulo'];
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

/**
 * Retorna todos los cursos escolares abiertos con la cantidad de alumnos matriculados.
 */
exports.listOpenCourses = asyncHandler(async (_req, res) => {
  const [groups] = await db.execute(`
    SELECT sg.id, sg.school_year AS schoolYear, sg.course_division AS courseDivision, sg.status,
           (SELECT COUNT(*) FROM users u WHERE u.school_year = sg.school_year AND u.course_division = sg.course_division AND u.role_id = 3 AND u.deleted_at IS NULL) AS studentsCount,
           (SELECT COUNT(*) FROM courses c WHERE c.school_year = sg.school_year AND c.course_division = sg.course_division) AS subjectsCount
    FROM school_groups sg
    WHERE sg.status = 'open'
    ORDER BY sg.school_year ASC, sg.course_division ASC
  `);

  res.json({
    success: true,
    data: groups.map((g) => ({
      ...g,
      label: `${g.schoolYear}° ${g.courseDivision}ª`,
      fullLabel: `${g.schoolYear}° Año - ${g.courseDivision}° Curso`,
    })),
  });
});

/**
 * Retorna la nómina alfabética de alumnos de un curso escolar.
 */
exports.getCourseStudents = asyncHandler(async (req, res) => {
  const sy = parseInt(req.query.schoolYear || req.params.schoolYear, 10);
  const cd = parseInt(req.query.courseDivision || req.params.courseDivision, 10);

  if (!sy || !cd) {
    throw new AppError('Año y división escolar requeridos', 422);
  }

  const [students] = await db.execute(`
    SELECT id, first_name AS firstName, last_name AS lastName, email, avatar_url AS avatarUrl,
           created_at AS enrolledAt
    FROM users
    WHERE role_id = 3 AND school_year = ? AND course_division = ? AND deleted_at IS NULL
    ORDER BY last_name ASC, first_name ASC
  `, [sy, cd]);

  res.json({
    success: true,
    schoolYear: sy,
    courseDivision: cd,
    total: students.length,
    data: students.map((s) => ({
      ...s,
      fullName: `${s.lastName}, ${s.firstName}`.trim(),
    })),
  });
});

/**
 * Retorna la planilla mensual de asistencia con calendario Lun-Vie y nómina alfabética.
 */
exports.getAttendanceSheet = asyncHandler(async (req, res) => {
  const sy = parseInt(req.query.schoolYear, 10) || 1;
  const cd = parseInt(req.query.courseDivision, 10) || 1;
  const now = new Date();
  const year = parseInt(req.query.year, 10) || now.getFullYear();
  const month = parseInt(req.query.month, 10) || (now.getMonth() + 1);

  if (month < 1 || month > 12) {
    throw new AppError('El mes debe estar entre 1 (Enero) y 12 (Diciembre).', 422);
  }

  // 1. Calcular días del mes (concordancia exacta con el calendario escolar: Lunes a Viernes únicamente)
  const days = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dObj = new Date(year, month - 1, d);
    const dayOfWeek = dObj.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      continue; // Sábados y domingos no hay clases escolares
    }
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({
      date: dateStr,
      dayNumber: d,
      dayName: DAY_NAMES[dayOfWeek],
      dayOfWeek,
    });
  }

  // 2. Obtener alumnos del curso ordenados alfabéticamente
  const [students] = await db.execute(`
    SELECT id, first_name AS firstName, last_name AS lastName, email, avatar_url AS avatarUrl
    FROM users
    WHERE role_id = 3 AND school_year = ? AND course_division = ? AND deleted_at IS NULL
    ORDER BY last_name ASC, first_name ASC
  `, [sy, cd]);

  // 3. Obtener registros de asistencia para este curso y mes
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const [records] = await db.execute(`
    SELECT student_id AS studentId, DATE_FORMAT(date, '%Y-%m-%d') AS date, status, notes
    FROM attendance_records
    WHERE school_year = ? AND course_division = ?
      AND date >= ? AND date <= ?
  `, [sy, cd, startDate, endDate]);

  const recordMap = new Map();
  for (const r of records) {
    recordMap.set(`${r.studentId}_${r.date}`, { status: r.status, notes: r.notes || null });
  }

  // 4. Armar la cuadrícula por alumno
  const studentRows = students.map((s) => {
    const attendance = {};
    let presenteCount = 0;
    let faltaCompletaCount = 0;
    let mediaFaltaCount = 0;
    let cuartoFaltaCount = 0;
    let justificadaCount = 0;
    let nuloCount = 0;

    for (const day of days) {
      const rec = recordMap.get(`${s.id}_${day.date}`);
      if (rec) {
        attendance[day.date] = rec.status;
        if (rec.status === 'presente') presenteCount++;
        else if (rec.status === 'falta_completa') faltaCompletaCount++;
        else if (rec.status === 'media_falta') mediaFaltaCount++;
        else if (rec.status === 'cuarto_falta') cuartoFaltaCount++;
        else if (rec.status === 'justificada') justificadaCount++;
        else if (rec.status === 'nulo') nuloCount++;
      } else {
        // Los días que no esté puesto nada cuentan por defecto como días nulos,
        // para que el preceptor complete si es realmente un día nulo, falta, presente o lo que fuera.
        attendance[day.date] = 'nulo';
        nuloCount++;
      }
    }

    const totalFaltas = (faltaCompletaCount * 1) + (mediaFaltaCount * 0.5) + (cuartoFaltaCount * 0.25);

    return {
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      fullName: `${s.lastName}, ${s.firstName}`.trim(),
      email: s.email,
      attendance,
      stats: {
        presente: presenteCount,
        faltaCompleta: faltaCompletaCount,
        mediaFalta: mediaFaltaCount,
        cuartoFalta: cuartoFaltaCount,
        justificada: justificadaCount,
        nulo: nuloCount,
        totalFaltas: Number(totalFaltas.toFixed(2)),
      },
    };
  });

  // Requerimiento estricto: solo el preceptor puede modificar asistencias
  const canEdit = req.user && req.user.role === 'preceptor';

  res.json({
    success: true,
    schoolYear: sy,
    courseDivision: cd,
    year,
    month,
    monthName: MONTH_NAMES[month - 1],
    canEdit,
    days,
    students: studentRows,
  });
});

/**
 * Guarda o actualiza la asistencia de uno o varios alumnos (SOLO PRECEPTOR).
 */
exports.recordAttendance = asyncHandler(async (req, res) => {
  if (!req.user || req.user.role !== 'preceptor') {
    throw new AppError('Solo el preceptor/a tiene autorización para registrar o modificar la asistencia.', 403, 'PRECEPTOR_ONLY');
  }

  const sy = parseInt(req.body.schoolYear, 10);
  const cd = parseInt(req.body.courseDivision, 10);

  if (!sy || !cd) {
    throw new AppError('Año escolar y división requeridos.', 422);
  }

  const updates = Array.isArray(req.body.updates) && req.body.updates.length > 0
    ? req.body.updates
    : [
        {
          studentId: req.body.studentId,
          date: req.body.date,
          status: req.body.status,
          notes: req.body.notes || null,
        },
      ];

  for (const item of updates) {
    const sId = Number(item.studentId);
    const date = String(item.date || '').trim();
    const status = String(item.status || '').trim();
    const notes = item.notes ? String(item.notes).trim() : null;

    if (!sId || !date || !status) continue;
    if (!VALID_STATUSES.includes(status)) {
      throw new AppError(`Estado de asistencia inválido: "${status}".`, 422, 'INVALID_STATUS');
    }

    await db.execute(`
      INSERT INTO attendance_records (school_year, course_division, student_id, date, status, notes, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE status = VALUES(status), notes = VALUES(notes), recorded_by = VALUES(recorded_by)
    `, [sy, cd, sId, date, status, notes, req.user.id]);
  }

  await logAudit(req.user.id, 'ATTENDANCE_RECORDED', 'attendance', sy, {
    schoolYear: sy,
    courseDivision: cd,
    recordsCount: updates.length,
  });

  res.json({
    success: true,
    message: 'Asistencia guardada correctamente.',
  });
});

/**
 * Declara el estado para TODO el curso en una fecha determinada (ej. Nulo por suspensión de clases).
 * SOLO PRECEPTOR.
 */
exports.setDayAttendanceStatus = asyncHandler(async (req, res) => {
  if (!req.user || req.user.role !== 'preceptor') {
    throw new AppError('Solo el preceptor/a tiene autorización para suspender clases o fijar estados globales.', 403, 'PRECEPTOR_ONLY');
  }

  const sy = parseInt(req.body.schoolYear, 10);
  const cd = parseInt(req.body.courseDivision, 10);
  const date = String(req.body.date || '').trim();
  const status = String(req.body.status || 'nulo').trim();
  const notes = req.body.notes ? String(req.body.notes).trim() : 'Suspensión de clases / Actividad suspendida';

  if (!sy || !cd || !date) {
    throw new AppError('Año, división y fecha son obligatorios.', 422);
  }
  if (!VALID_STATUSES.includes(status)) {
    throw new AppError(`Estado de asistencia inválido: "${status}".`, 422);
  }

  // Obtener alumnos matriculados
  const [students] = await db.execute(`
    SELECT id FROM users
    WHERE role_id = 3 AND school_year = ? AND course_division = ? AND deleted_at IS NULL
  `, [sy, cd]);

  for (const s of students) {
    await db.execute(`
      INSERT INTO attendance_records (school_year, course_division, student_id, date, status, notes, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE status = VALUES(status), notes = VALUES(notes), recorded_by = VALUES(recorded_by)
    `, [sy, cd, s.id, date, status, notes, req.user.id]);
  }

  await logAudit(req.user.id, 'ATTENDANCE_DAY_STATUS_SET', 'attendance', sy, {
    schoolYear: sy,
    courseDivision: cd,
    date,
    status,
    notes,
    affectedStudents: students.length,
  });

  res.json({
    success: true,
    message: `Día ${date} configurado como "${status}" para los ${students.length} alumnos de ${sy}° ${cd}ª.`,
  });
});
