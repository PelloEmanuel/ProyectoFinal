// Importa la conexión a la base de datos, las utilidades de error, auditoría y los tipos de solicitud.
import { Response } from 'express';
import db from '../configuracion/baseDatos';
import { AppError, asyncHandler } from '../utilidades/errores';
import { logAudit } from '../utilidades/auditoria';
import { SolicitudAutenticada } from '../tipos';

// Define los estados de asistencia válidos admitidos por la institución escolar.
const VALID_STATUSES: string[] = ['presente', 'falta_completa', 'media_falta', 'cuarto_falta', 'justificada', 'nulo'];

// Define las abreviaturas de los días de la semana para el encabezado de la planilla mensual.
const DAY_NAMES: string[] = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Define los nombres de los meses del calendario escolar en español.
const MONTH_NAMES: string[] = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Lista todos los cursos escolares abiertos junto con su cantidad de alumnos y materias.
export const listOpenCourses = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  const isInstructor = req.user && (req.user.role === 'instructor' || req.user.roleId === 2);
  let sql = `
    SELECT sg.id, sg.school_year AS schoolYear, sg.course_division AS courseDivision, sg.status,
           (SELECT COUNT(*) FROM usuarios u WHERE u.school_year = sg.school_year AND u.course_division = sg.course_division AND u.role_id = 3 AND u.deleted_at IS NULL) AS studentsCount,
           (SELECT COUNT(*) FROM cursos c WHERE c.school_year = sg.school_year AND c.course_division = sg.course_division) AS subjectsCount
    FROM grupos_escolares sg
    WHERE sg.status = 'open'
  `;
  const params: unknown[] = [];

  if (isInstructor && req.user) {
    sql += ` AND EXISTS (SELECT 1 FROM cursos c WHERE c.school_year = sg.school_year AND c.course_division = sg.course_division AND c.instructor_id = ?)`;
    params.push(req.user.id);
  }

  sql += ` ORDER BY sg.school_year ASC, sg.course_division ASC`;

  const [groups] = await db.execute(sql, params);

  res.json({
    success: true,
    data: groups.map((g: any) => ({
      ...g,
      label: `${g.schoolYear}° ${g.courseDivision}ª`,
      fullLabel: `${g.schoolYear}° Año - ${g.courseDivision}° Curso`,
    })),
  });
});

// Obtiene la nómina alfabética de estudiantes pertenecientes a un Año y División escolar.
export const getCourseStudents = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  const sy = parseInt(String(req.query.schoolYear || req.params.schoolYear || ''), 10);
  const cd = parseInt(String(req.query.courseDivision || req.params.courseDivision || ''), 10);

  if (!sy || !cd) {
    throw new AppError('Año y división escolar requeridos', 422);
  }

  const isInstructor = req.user && (req.user.role === 'instructor' || req.user.roleId === 2);
  if (isInstructor && req.user) {
    const [assigned] = await db.execute(
      'SELECT id FROM cursos WHERE instructor_id = ? AND school_year = ? AND course_division = ? LIMIT 1',
      [req.user.id, sy, cd]
    );
    if (assigned.length === 0) {
      throw new AppError('Solo podés consultar la nómina de los cursos escolares a tu cargo.', 403, 'COURSE_NOT_ASSIGNED');
    }
  }

  const [students] = await db.execute(
    `SELECT id, first_name AS firstName, last_name AS lastName, email, avatar_url AS avatarUrl,
            created_at AS enrolledAt
     FROM usuarios
     WHERE role_id = 3 AND school_year = ? AND course_division = ? AND deleted_at IS NULL
     ORDER BY last_name ASC, first_name ASC`,
    [sy, cd]
  );

  res.json({
    success: true,
    schoolYear: sy,
    courseDivision: cd,
    total: students.length,
    data: students.map((s: any) => ({
      ...s,
      fullName: `${s.lastName}, ${s.firstName}`.trim(),
    })),
  });
});

// Genera y devuelve la planilla mensual de asistencia de lunes a viernes para un curso escolar.
export const getAttendanceSheet = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  const sy = parseInt(String(req.query.schoolYear || ''), 10) || 1;
  const cd = parseInt(String(req.query.courseDivision || ''), 10) || 1;
  const now = new Date();
  const year = parseInt(String(req.query.year || ''), 10) || now.getFullYear();
  const month = parseInt(String(req.query.month || ''), 10) || now.getMonth() + 1;

  if (month < 1 || month > 12) {
    throw new AppError('El mes debe estar entre 1 (Enero) y 12 (Diciembre).', 422);
  }

  const isInstructor = req.user && (req.user.role === 'instructor' || req.user.roleId === 2);
  if (isInstructor && req.user) {
    const [assigned] = await db.execute(
      'SELECT id FROM cursos WHERE instructor_id = ? AND school_year = ? AND course_division = ? LIMIT 1',
      [req.user.id, sy, cd]
    );
    if (assigned.length === 0) {
      throw new AppError('Solo podés consultar la asistencia de los cursos escolares a tu cargo.', 403, 'COURSE_NOT_ASSIGNED');
    }
  }

  // Calcula los días hábiles de lunes a viernes correspondientes al mes consultado.
  const days: Array<{ date: string; dayNumber: number; dayName: string; dayOfWeek: number }> = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dObj = new Date(year, month - 1, d);
    const dayOfWeek = dObj.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({
      date: dateStr,
      dayNumber: d,
      dayName: DAY_NAMES[dayOfWeek],
      dayOfWeek,
    });
  }

  // Obtiene los alumnos del curso ordenados alfabéticamente por apellido y nombre.
  const [students] = await db.execute(
    `SELECT id, first_name AS firstName, last_name AS lastName, email, avatar_url AS avatarUrl
     FROM usuarios
     WHERE role_id = 3 AND school_year = ? AND course_division = ? AND deleted_at IS NULL
     ORDER BY last_name ASC, first_name ASC`,
    [sy, cd]
  );

  // Consulta los registros de asistencia guardados en la tabla registros_asistencia para ese mes.
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const [records] = await db.execute(
    `SELECT student_id AS studentId, DATE_FORMAT(date, '%Y-%m-%d') AS date, status, notes
     FROM registros_asistencia
     WHERE school_year = ? AND course_division = ?
       AND date >= ? AND date <= ?`,
    [sy, cd, startDate, endDate]
  );

  const recordMap = new Map<string, { status: string; notes: string | null }>();
  for (const r of records) {
    recordMap.set(`${r.studentId}_${r.date}`, { status: r.status, notes: r.notes || null });
  }

  // Construye las filas de asistencia y estadísticas acumuladas por cada estudiante.
  const studentRows = students.map((s: any) => {
    const attendance: Record<string, string> = {};
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
        attendance[day.date] = 'nulo';
        nuloCount++;
      }
    }

    const totalFaltas = faltaCompletaCount * 1 + mediaFaltaCount * 0.5 + cuartoFaltaCount * 0.25;

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

  const canEdit = Boolean(req.user && req.user.role === 'preceptor');

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

// Registra o actualiza la asistencia de uno o varios estudiantes (exclusivo para el rol preceptor).
export const recordAttendance = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  if (!req.user || req.user.role !== 'preceptor') {
    throw new AppError('Solo el preceptor/a tiene autorización para registrar o modificar la asistencia.', 403, 'PRECEPTOR_ONLY');
  }

  const sy = parseInt(String(req.body.schoolYear || ''), 10);
  const cd = parseInt(String(req.body.courseDivision || ''), 10);

  if (!sy || !cd) {
    throw new AppError('Año escolar y división requeridos.', 422);
  }

  const updates =
    Array.isArray(req.body.updates) && req.body.updates.length > 0
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

    await db.execute(
      `INSERT INTO registros_asistencia (school_year, course_division, student_id, date, status, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), notes = VALUES(notes), recorded_by = VALUES(recorded_by)`,
      [sy, cd, sId, date, status, notes, req.user.id]
    );
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

// Asigna un estado de asistencia masivo para todos los alumnos de un curso en una fecha dada.
export const setDayAttendanceStatus = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  if (!req.user || req.user.role !== 'preceptor') {
    throw new AppError('Solo el preceptor/a tiene autorización para suspender clases o fijar estados globales.', 403, 'PRECEPTOR_ONLY');
  }

  const sy = parseInt(String(req.body.schoolYear || ''), 10);
  const cd = parseInt(String(req.body.courseDivision || ''), 10);
  const date = String(req.body.date || '').trim();
  const status = String(req.body.status || 'nulo').trim();
  const notes = req.body.notes ? String(req.body.notes).trim() : 'Suspensión de clases / Actividad suspendida';

  if (!sy || !cd || !date) {
    throw new AppError('Año, división y fecha son obligatorios.', 422);
  }
  if (!VALID_STATUSES.includes(status)) {
    throw new AppError(`Estado de asistencia inválido: "${status}".`, 422);
  }

  const [students] = await db.execute(
    `SELECT id FROM usuarios
     WHERE role_id = 3 AND school_year = ? AND course_division = ? AND deleted_at IS NULL`,
    [sy, cd]
  );

  for (const s of students) {
    await db.execute(
      `INSERT INTO registros_asistencia (school_year, course_division, student_id, date, status, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), notes = VALUES(notes), recorded_by = VALUES(recorded_by)`,
      [sy, cd, s.id, date, status, notes, req.user.id]
    );
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
