/**
 * Archivo: backend/src/utils/school.js
 * Descripción: Lógica de negocio para el Campus Escolar (1° a 6° Año, 1° a 3° Curso):
 * - Sincronización automática de inscripciones por Año y Curso.
 * - Validación de horarios (formato HH:MM y rango válido).
 * - Reglas de superposición:
 *   1) Las materias de distintos cursos PUEDEN superponerse en el mismo día y horario.
 *   2) Dentro de un mismo curso (Año + División), dos materias no pueden pisarse en el mismo horario.
 *   3) Un mismo profesor NO puede superponerse en el mismo día y horario en dos cursos distintos.
 */
const db = require('../config/db');
const { AppError } = require('./errors');

const VALID_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function normalizeTime(raw) {
  const s = String(raw || '').trim();
  const match = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new AppError(`Formato de hora inválido ("${raw}"). Usá HH:MM (ej. 07:30 o 09:30).`, 422, 'INVALID_TIME_FORMAT');
  }
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    throw new AppError(`Hora fuera de rango ("${raw}"). Usá entre 00:00 y 23:59.`, 422, 'INVALID_TIME_RANGE');
  }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function validateYearAndDivision(schoolYear, courseDivision) {
  const y = Number(schoolYear);
  const d = Number(courseDivision);
  if (!Number.isInteger(y) || y < 1 || y > 6) {
    throw new AppError('El año escolar debe estar entre 1° y 6°.', 422, 'INVALID_SCHOOL_YEAR');
  }
  if (!Number.isInteger(d) || d < 1 || d > 3) {
    throw new AppError('El curso/división debe estar entre 1° y 3°.', 422, 'INVALID_COURSE_DIVISION');
  }
  return { schoolYear: y, courseDivision: d };
}

/**
 * Sincroniza las inscripciones de un alumno para que quede inscripto automáticamente
 * en todas las materias del Año (1° a 6°) y Curso (1° a 3°) al que pertenece.
 */
async function syncStudentCourseEnrollments(studentId, schoolYear, courseDivision) {
  const { schoolYear: y, courseDivision: d } = validateYearAndDivision(schoolYear, courseDivision);

  await db.execute('UPDATE users SET school_year = ?, course_division = ? WHERE id = ?', [y, d, studentId]);

  // Quitar inscripciones activas de otros años/divisiones si el alumno cambió de curso
  await db.execute(
    `DELETE e FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE e.student_id = ? AND (c.school_year <> ? OR c.course_division <> ?)`,
    [studentId, y, d]
  );

  // Inscribir automáticamente en todas las materias de su Año y Curso
  const [groupCourses] = await db.execute(
    "SELECT id FROM courses WHERE school_year = ? AND course_division = ? AND status <> 'archived'",
    [y, d]
  );

  for (const c of groupCourses) {
    await db.execute(
      `INSERT IGNORE INTO enrollments (student_id, course_id, status, enrolled_at, last_accessed_at)
       VALUES (?, ?, 'active', NOW(), NOW())`,
      [studentId, c.id]
    );
  }

  return { schoolYear: y, courseDivision: d, enrolledCoursesCount: groupCourses.length };
}

/**
 * Cuando el Administrador crea o actualiza una materia para un (Año, Curso),
 * inscribe automáticamente a todos los alumnos de ese (Año, Curso).
 */
async function syncCourseGroupEnrollments(courseId, schoolYear, courseDivision) {
  const { schoolYear: y, courseDivision: d } = validateYearAndDivision(schoolYear, courseDivision);
  const [students] = await db.execute(
    `SELECT u.id
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.name = 'student' AND u.school_year = ? AND u.course_division = ? AND u.deleted_at IS NULL`,
    [y, d]
  );

  for (const s of students) {
    await db.execute(
      `INSERT IGNORE INTO enrollments (student_id, course_id, status, enrolled_at, last_accessed_at)
       VALUES (?, ?, 'active', NOW(), NOW())`,
      [s.id, courseId]
    );
  }
}

/**
 * Verifica que:
 * 1) En el mismo curso (Año + División) no haya otra materia superpuesta en el mismo día y rango horario.
 * 2) Si hay un profesor asignado (instructorId != null), ese profesor NO esté asignado en el mismo día y
 *    rango horario en ningún otro curso o materia.
 */
async function validateScheduleBlock({
  schoolYear,
  courseDivision,
  dayOfWeek,
  startTime,
  endTime,
  instructorId = null,
  excludeScheduleId = null,
  excludeCourseId = null,
}) {
  const { schoolYear: y, courseDivision: d } = validateYearAndDivision(schoolYear, courseDivision);
  if (!VALID_DAYS.includes(dayOfWeek)) {
    throw new AppError(`Día inválido ("${dayOfWeek}"). Usá Lunes a Sábado.`, 422, 'INVALID_DAY');
  }
  const start = normalizeTime(startTime);
  const end = normalizeTime(endTime);
  if (start >= end) {
    throw new AppError('La hora de finalización debe ser posterior a la hora de inicio (ej. 07:30 a 09:30).', 422, 'INVALID_TIME_ORDER');
  }

  // 1. Verificar superposición dentro del MISMO curso escolar (Año + División)
  const groupParams = [y, d, dayOfWeek, end, start];
  const groupExcludes = [];
  if (excludeScheduleId) {
    groupExcludes.push('AND cs.id <> ?');
    groupParams.push(Number(excludeScheduleId));
  }
  if (excludeCourseId) {
    groupExcludes.push('AND cs.course_id <> ?');
    groupParams.push(Number(excludeCourseId));
  }
  const groupExcludeSql = groupExcludes.join(' ');

  const [sameCourseConflicts] = await db.execute(
    `SELECT cs.id, cs.start_time, cs.end_time, c.title AS courseTitle
     FROM course_schedules cs
     JOIN courses c ON c.id = cs.course_id
     WHERE cs.school_year = ? AND cs.course_division = ?
       AND cs.day_of_week = ?
       AND cs.start_time < ? AND cs.end_time > ?
       ${groupExcludeSql}
     LIMIT 1`,
    groupParams
  );

  if (sameCourseConflicts.length > 0) {
    const conf = sameCourseConflicts[0];
    throw new AppError(
      `El curso ${y}° Año - ${d}° Curso ya tiene la materia "${conf.courseTitle}" asignada el ${dayOfWeek} de ${conf.start_time} a ${conf.end_time}.`,
      409,
      'COURSE_SCHEDULE_CONFLICT'
    );
  }

  // 2. Verificar que el MISMO profesor no esté superpuesto en otro curso en el mismo día y horario
  if (instructorId) {
    const profParams = [Number(instructorId), dayOfWeek, end, start];
    const profExcludes = [];
    if (excludeScheduleId) {
      profExcludes.push('AND cs.id <> ?');
      profParams.push(Number(excludeScheduleId));
    }
    if (excludeCourseId) {
      profExcludes.push('AND cs.course_id <> ?');
      profParams.push(Number(excludeCourseId));
    }
    const profExcludeSql = profExcludes.join(' ');

    const [profConflicts] = await db.execute(
      `SELECT cs.id, cs.start_time, cs.end_time, cs.school_year, cs.course_division,
              c.title AS courseTitle,
              CONCAT(u.first_name, ' ', u.last_name) AS instructorName
       FROM course_schedules cs
       JOIN courses c ON c.id = cs.course_id
       JOIN users u ON u.id = c.instructor_id
       WHERE c.instructor_id = ?
         AND cs.day_of_week = ?
         AND cs.start_time < ? AND cs.end_time > ?
         ${profExcludeSql}
       LIMIT 1`,
      profParams
    );

    if (profConflicts.length > 0) {
      const p = profConflicts[0];
      throw new AppError(
        `Superposición de profesor: ${p.instructorName} ya dicta "${p.courseTitle}" en ${p.school_year}° Año - ${p.course_division}° Curso el ${dayOfWeek} de ${p.start_time} a ${p.end_time}. Un mismo profesor no puede estar en dos cursos en el mismo horario.`,
        409,
        'PROFESSOR_SCHEDULE_CONFLICT'
      );
    }
  }

  return { schoolYear: y, courseDivision: d, dayOfWeek, startTime: start, endTime: end };
}

/**
 * Valida una lista de bloques horarios enviados juntos (por ejemplo Lunes y Miércoles 07:30-09:30)
 * verificando que no haya superposición entre dos bloques del mismo envío en el mismo día.
 */
function validateMultipleSlotsInternal(rawSlots = []) {
  if (!Array.isArray(rawSlots) || rawSlots.length === 0) {
    throw new AppError('Debés seleccionar al menos un día y horario para la materia.', 422, 'SLOTS_REQUIRED');
  }
  const normalized = rawSlots.map((slot) => {
    const dayOfWeek = String(slot.dayOfWeek || '').trim();
    if (!VALID_DAYS.includes(dayOfWeek)) {
      throw new AppError(`Día inválido ("${dayOfWeek}"). Usá Lunes a Sábado.`, 422, 'INVALID_DAY');
    }
    const startTime = normalizeTime(slot.startTime);
    const endTime = normalizeTime(slot.endTime);
    if (startTime >= endTime) {
      throw new AppError(`En el día ${dayOfWeek}, la hora de fin (${endTime}) debe ser posterior a la de inicio (${startTime}).`, 422, 'INVALID_TIME_ORDER');
    }
    return {
      dayOfWeek,
      startTime,
      endTime,
      classroom: slot.classroom ? String(slot.classroom).trim() : null,
    };
  });

  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      const a = normalized[i];
      const b = normalized[j];
      if (a.dayOfWeek === b.dayOfWeek && a.startTime < b.endTime && a.endTime > b.startTime) {
        throw new AppError(
          `Cargaste dos horarios que se pisan entre sí el día ${a.dayOfWeek} (${a.startTime}-${a.endTime} y ${b.startTime}-${b.endTime}).`,
          422,
          'DUPLICATE_INTERNAL_SLOT'
        );
      }
    }
  }

  return normalized;
}

/**
 * Cuando el Administrador asigna o cambia el profesor de una materia que ya tiene horarios cargados,
 * comprueba que el nuevo profesor no tenga superposición horaria con ninguno de los bloques de esa materia.
 */
async function validateInstructorForExistingCourseSchedules(courseId, instructorId) {
  if (!instructorId) return; // Si queda sin profesor asignado (vacante), siempre es válido

  const [schedules] = await db.execute(
    'SELECT id, day_of_week, start_time, end_time FROM course_schedules WHERE course_id = ?',
    [courseId]
  );

  for (const s of schedules) {
    const [conflicts] = await db.execute(
      `SELECT cs.id, cs.start_time, cs.end_time, cs.school_year, cs.course_division,
              c.title AS courseTitle,
              CONCAT(u.first_name, ' ', u.last_name) AS instructorName
       FROM course_schedules cs
       JOIN courses c ON c.id = cs.course_id
       JOIN users u ON u.id = c.instructor_id
       WHERE c.instructor_id = ?
         AND c.id <> ?
         AND cs.day_of_week = ?
         AND cs.start_time < ? AND cs.end_time > ?
       LIMIT 1`,
      [Number(instructorId), Number(courseId), s.day_of_week, s.end_time, s.start_time]
    );

    if (conflicts.length > 0) {
      const p = conflicts[0];
      throw new AppError(
        `No se puede asignar a ${p.instructorName}: ya dicta "${p.courseTitle}" en ${p.school_year}° Año - ${p.course_division}° Curso el ${s.day_of_week} de ${p.start_time} a ${p.end_time} (se superpone con el horario ${s.start_time}-${s.end_time} de esta materia).`,
        409,
        'PROFESSOR_SCHEDULE_CONFLICT'
      );
    }
  }
}

/**
 * Crea o recupera una categoría que tenga exactamente el mismo nombre que la materia.
 * Garantiza que la categoría de la materia sea el nombre de la materia y nada más.
 */
async function getOrCreateCategoryForSubject(subjectName, conn = null) {
  const runner = conn || db;
  const clean = String(subjectName || '').trim();
  if (!clean) return 1;

  const [existing] = await runner.execute(
    'SELECT id, name FROM categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1',
    [clean]
  );
  if (existing.length > 0) {
    return existing[0].id;
  }

  const [ins] = await runner.execute(
    'INSERT INTO categories (name, description, status) VALUES (?, ?, ?)',
    [clean.slice(0, 80), `Categoría de ${clean}`.slice(0, 255), 'active']
  );
  return ins.insertId;
}

/**
 * Elimina un curso y absolutamente todas sus tablas secundarias / dependientes
 * sin errores de foreign keys ni restricciones residuales.
 */
async function deleteCourseAndDependencies(courseId, conn = null) {
  const runner = conn || db;
  const cId = Number(courseId);
  if (!cId) return;

  await runner.execute('SET FOREIGN_KEY_CHECKS = 0');
  try {
    await runner.execute('DELETE FROM course_schedules WHERE course_id = ?', [cId]);
    await runner.execute('DELETE FROM enrollments WHERE course_id = ?', [cId]);
    await runner.execute('DELETE FROM course_favorites WHERE course_id = ?', [cId]);
    await runner.execute('DELETE FROM course_skills WHERE course_id = ?', [cId]);
    await runner.execute('DELETE FROM course_prerequisites WHERE course_id = ? OR prerequisite_course_id = ?', [cId, cId]);
    await runner.execute('DELETE FROM feed_comments WHERE course_id = ?', [cId]);
    await runner.execute('DELETE FROM announcements WHERE course_id = ?', [cId]);
    await runner.execute('DELETE FROM lesson_progress WHERE lesson_id IN (SELECT id FROM lessons WHERE module_id IN (SELECT id FROM modules WHERE course_id = ?))', [cId]);
    await runner.execute('DELETE FROM lesson_resources WHERE lesson_id IN (SELECT id FROM lessons WHERE module_id IN (SELECT id FROM modules WHERE course_id = ?))', [cId]);
    await runner.execute('DELETE FROM lessons WHERE module_id IN (SELECT id FROM modules WHERE course_id = ?)', [cId]);
    await runner.execute('DELETE FROM modules WHERE course_id = ?', [cId]);
    await runner.execute('DELETE FROM grading_history WHERE assignment_id IN (SELECT id FROM assignments WHERE course_id = ?)', [cId]);
    await runner.execute('DELETE FROM assignment_files WHERE attempt_id IN (SELECT id FROM assignment_attempts WHERE assignment_id IN (SELECT id FROM assignments WHERE course_id = ?))', [cId]);
    await runner.execute('DELETE FROM attempt_answers WHERE attempt_id IN (SELECT id FROM assignment_attempts WHERE assignment_id IN (SELECT id FROM assignments WHERE course_id = ?))', [cId]);
    await runner.execute('DELETE FROM assignment_attempts WHERE assignment_id IN (SELECT id FROM assignments WHERE course_id = ?)', [cId]);
    await runner.execute('DELETE FROM assignments WHERE course_id = ?', [cId]);
    await runner.execute('DELETE FROM courses WHERE id = ?', [cId]);
  } finally {
    await runner.execute('SET FOREIGN_KEY_CHECKS = 1');
  }
}

module.exports = {
  VALID_DAYS,
  normalizeTime,
  validateYearAndDivision,
  syncStudentCourseEnrollments,
  syncCourseGroupEnrollments,
  validateScheduleBlock,
  validateMultipleSlotsInternal,
  validateInstructorForExistingCourseSchedules,
  getOrCreateCategoryForSubject,
  deleteCourseAndDependencies,
};
