// Importa la conexión a la base de datos, la clase de error de aplicación y el emisor en tiempo real.
import db from '../configuracion/baseDatos';
import { AppError } from './errores';
import { notificarCambioTiempoReal } from './tiempoReal';

// Define los días hábiles escolares válidos para el armado de horarios.
export const VALID_DAYS: string[] = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Define la estructura de un bloque horario enviado al crear o actualizar horarios de materias.
export interface EntradaHorario {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  classroom?: string | null;
}

// Define los parámetros requeridos para validar que un bloque horario no tenga superposiciones.
export interface OpcionesValidacionHorario {
  schoolYear: number | string;
  courseDivision: number | string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  instructorId?: number | null;
  excludeScheduleId?: number | null;
  excludeCourseId?: number | null;
}

// Normaliza una hora en formato HH:MM verificando que se encuentre entre las 00:00 y las 23:59.
export function normalizeTime(raw: unknown): string {
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

// Valida que el año escolar y la división sean números enteros dentro del rango permitido por la institución.
export function validateYearAndDivision(
  schoolYear: unknown,
  courseDivision: unknown
): { schoolYear: number; courseDivision: number } {
  const y = Number(schoolYear);
  const d = Number(courseDivision);
  if (!Number.isInteger(y) || y < 1 || y > 10) {
    throw new AppError('El año escolar debe ser un número válido entre 1° y 10°.', 422, 'INVALID_SCHOOL_YEAR');
  }
  if (!Number.isInteger(d) || d < 1 || d > 30) {
    throw new AppError('El curso/división debe ser un número válido.', 422, 'INVALID_COURSE_DIVISION');
  }
  return { schoolYear: y, courseDivision: d };
}

// Sincroniza las inscripciones de un alumno para que curse todas las materias activas de su Año y División.
export async function syncStudentCourseEnrollments(
  studentId: number,
  schoolYear: unknown,
  courseDivision: unknown
): Promise<{ schoolYear: number; courseDivision: number; enrolledCoursesCount: number }> {
  const { schoolYear: y, courseDivision: d } = validateYearAndDivision(schoolYear, courseDivision);

  // Actualiza el año y división asignados al perfil del estudiante en la tabla usuarios.
  await db.execute('UPDATE usuarios SET school_year = ?, course_division = ? WHERE id = ?', [y, d, studentId]);

  // Elimina inscripciones previas de otros años o divisiones si el alumno cambió de curso escolar.
  await db.execute(
    `DELETE e FROM inscripciones e
     JOIN cursos c ON c.id = e.course_id
     WHERE e.student_id = ? AND (c.school_year <> ? OR c.course_division <> ?)`,
    [studentId, y, d]
  );

  // Obtiene todas las materias activas correspondientes al año y división del estudiante.
  const [groupCourses] = await db.execute(
    "SELECT id FROM cursos WHERE school_year = ? AND course_division = ? AND status <> 'archived'",
    [y, d]
  );

  // Inscribe automáticamente al estudiante en cada materia de su curso escolar.
  for (const c of groupCourses) {
    await db.execute(
      `INSERT IGNORE INTO inscripciones (student_id, course_id, status, enrolled_at, last_accessed_at)
       VALUES (?, ?, 'active', NOW(), NOW())`,
      [studentId, c.id]
    );
  }

  return { schoolYear: y, courseDivision: d, enrolledCoursesCount: groupCourses.length };
}

// Inscribe automáticamente a todos los alumnos de un Año y División cuando se crea o asigna una materia.
export async function syncCourseGroupEnrollments(
  courseId: number,
  schoolYear: unknown,
  courseDivision: unknown
): Promise<void> {
  const { schoolYear: y, courseDivision: d } = validateYearAndDivision(schoolYear, courseDivision);
  const [students] = await db.execute(
    `SELECT u.id
     FROM usuarios u
     JOIN roles r ON r.id = u.role_id
     WHERE r.name = 'student' AND u.school_year = ? AND u.course_division = ? AND u.deleted_at IS NULL`,
    [y, d]
  );

  for (const s of students) {
    await db.execute(
      `INSERT IGNORE INTO inscripciones (student_id, course_id, status, enrolled_at, last_accessed_at)
       VALUES (?, ?, 'active', NOW(), NOW())`,
      [s.id, courseId]
    );
  }
}

// Verifica que un bloque horario no se superponga con otra materia del mismo curso ni con otro curso del mismo docente.
export async function validateScheduleBlock({
  schoolYear,
  courseDivision,
  dayOfWeek,
  startTime,
  endTime,
  instructorId = null,
  excludeScheduleId = null,
  excludeCourseId = null,
}: OpcionesValidacionHorario): Promise<{
  schoolYear: number;
  courseDivision: number;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}> {
  const { schoolYear: y, courseDivision: d } = validateYearAndDivision(schoolYear, courseDivision);
  if (!VALID_DAYS.includes(dayOfWeek)) {
    throw new AppError(`Día inválido ("${dayOfWeek}"). Usá Lunes a Sábado.`, 422, 'INVALID_DAY');
  }
  const start = normalizeTime(startTime);
  const end = normalizeTime(endTime);
  if (start >= end) {
    throw new AppError(
      'La hora de finalización debe ser posterior a la hora de inicio (ej. 07:30 a 09:30).',
      422,
      'INVALID_TIME_ORDER'
    );
  }

  // Comprueba que no exista otra materia en el mismo horario dentro de la misma división escolar.
  const groupParams: unknown[] = [y, d, dayOfWeek, end, start];
  const groupExcludes: string[] = [];
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
     FROM horarios_curso cs
     JOIN cursos c ON c.id = cs.course_id
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

  // Comprueba que el docente asignado no esté dictando otra materia en el mismo horario en otro curso.
  if (instructorId) {
    const profParams: unknown[] = [Number(instructorId), dayOfWeek, end, start];
    const profExcludes: string[] = [];
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
       FROM horarios_curso cs
       JOIN cursos c ON c.id = cs.course_id
       JOIN usuarios u ON u.id = c.instructor_id
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
        `Superposición de docente: ${p.instructorName} ya dicta "${p.courseTitle}" en ${p.school_year}° Año - ${p.course_division}° Curso el ${dayOfWeek} de ${p.start_time} a ${p.end_time}. Un mismo docente no puede estar en dos cursos en el mismo horario.`,
        409,
        'PROFESSOR_SCHEDULE_CONFLICT'
      );
    }
  }

  return { schoolYear: y, courseDivision: d, dayOfWeek, startTime: start, endTime: end };
}

// Valida que los bloques horarios enviados en una misma solicitud no se pisen entre sí.
export function validateMultipleSlotsInternal(rawSlots: EntradaHorario[] = []): EntradaHorario[] {
  if (!Array.isArray(rawSlots) || rawSlots.length === 0) {
    throw new AppError('Debés seleccionar al menos un día y horario para la materia.', 422, 'SLOTS_REQUIRED');
  }
  const normalized: EntradaHorario[] = rawSlots.map((slot) => {
    const dayOfWeek = String(slot.dayOfWeek || '').trim();
    if (!VALID_DAYS.includes(dayOfWeek)) {
      throw new AppError(`Día inválido ("${dayOfWeek}"). Usá Lunes a Sábado.`, 422, 'INVALID_DAY');
    }
    const startTime = normalizeTime(slot.startTime);
    const endTime = normalizeTime(slot.endTime);
    if (startTime >= endTime) {
      throw new AppError(
        `En el día ${dayOfWeek}, la hora de fin (${endTime}) debe ser posterior a la de inicio (${startTime}).`,
        422,
        'INVALID_TIME_ORDER'
      );
    }
    return {
      dayOfWeek,
      startTime,
      endTime,
      classroom: slot.classroom ? String(slot.classroom).trim() : null,
    };
  });

  // Verifica pares de bloques dentro del mismo envío para evitar colisiones internas.
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

// Verifica que el nuevo profesor asignado a una materia no tenga superposición en los horarios ya existentes de esa materia.
export async function validateInstructorForExistingCourseSchedules(
  courseId: number,
  instructorId: number | null
): Promise<void> {
  if (!instructorId) return;

  const [schedules] = await db.execute(
    'SELECT id, day_of_week, start_time, end_time FROM horarios_curso WHERE course_id = ?',
    [courseId]
  );

  for (const s of schedules) {
    const [conflicts] = await db.execute(
      `SELECT cs.id, cs.start_time, cs.end_time, cs.school_year, cs.course_division,
              c.title AS courseTitle,
              CONCAT(u.first_name, ' ', u.last_name) AS instructorName
       FROM horarios_curso cs
       JOIN cursos c ON c.id = cs.course_id
       JOIN usuarios u ON u.id = c.instructor_id
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

// Recupera o crea una categoría cuyo nombre coincida exactamente con el nombre de la materia escolar.
export async function getOrCreateCategoryForSubject(subjectName: string, conn: any = null): Promise<number> {
  const runner = conn || db;
  const clean = String(subjectName || '').trim();
  if (!clean) return 1;

  const [existing] = await runner.execute(
    'SELECT id, name FROM categorias WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1',
    [clean]
  );
  if (existing.length > 0) {
    return Number(existing[0].id);
  }

  try {
    const [ins] = await runner.execute(
      'INSERT INTO categorias (name, description, status) VALUES (?, ?, ?)',
      [clean.slice(0, 80), `Categoría de ${clean}`.slice(0, 255), 'active']
    );
    return Number(ins.insertId);
  } catch {
    // Si concurre una inserción duplicada por colación insensible a acentos, recupera la categoría existente.
    const [fallback] = await runner.execute(
      'SELECT id FROM categorias WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1',
      [clean.slice(0, 80)]
    );
    if (fallback.length > 0) {
      return Number(fallback[0].id);
    }
    const [firstCat] = await runner.execute('SELECT id FROM categorias ORDER BY id ASC LIMIT 1');
    return firstCat.length > 0 ? Number(firstCat[0].id) : 1;
  }
}

// Elimina un curso junto con todos sus registros dependientes en cascada controlada.
export async function deleteCourseAndDependencies(courseId: number, conn: any = null): Promise<void> {
  const runner = conn || db;
  const cId = Number(courseId);
  if (!cId) return;

  await runner.execute('SET FOREIGN_KEY_CHECKS = 0');
  try {
    await runner.execute('DELETE FROM horarios_curso WHERE course_id = ?', [cId]);
    await runner.execute('DELETE FROM inscripciones WHERE course_id = ?', [cId]);
    await runner.execute('DELETE FROM cursos_favoritos WHERE course_id = ?', [cId]);
    await runner.execute('DELETE FROM habilidades_curso WHERE course_id = ?', [cId]);
    await runner.execute('DELETE FROM prerrequisitos_curso WHERE course_id = ? OR prerequisite_course_id = ?', [cId, cId]);
    await runner.execute('DELETE FROM comentarios_tablon WHERE course_id = ?', [cId]);
    await runner.execute('DELETE FROM anuncios WHERE course_id = ?', [cId]);
    await runner.execute(
      'DELETE FROM progreso_lecciones WHERE lesson_id IN (SELECT id FROM lecciones WHERE module_id IN (SELECT id FROM modulos WHERE course_id = ?))',
      [cId]
    );
    await runner.execute(
      'DELETE FROM recursos_lecciones WHERE lesson_id IN (SELECT id FROM lecciones WHERE module_id IN (SELECT id FROM modulos WHERE course_id = ?))',
      [cId]
    );
    await runner.execute('DELETE FROM lecciones WHERE module_id IN (SELECT id FROM modulos WHERE course_id = ?)', [cId]);
    await runner.execute('DELETE FROM modulos WHERE course_id = ?', [cId]);
    await runner.execute(
      'DELETE FROM historial_calificaciones WHERE attempt_id IN (SELECT id FROM entregas_tareas WHERE assignment_id IN (SELECT id FROM tareas WHERE course_id = ?))',
      [cId]
    );
    await runner.execute(
      'DELETE FROM archivos_tareas WHERE attempt_id IN (SELECT id FROM entregas_tareas WHERE assignment_id IN (SELECT id FROM tareas WHERE course_id = ?))',
      [cId]
    );
    await runner.execute(
      'DELETE FROM respuestas_intentos WHERE attempt_id IN (SELECT id FROM entregas_tareas WHERE assignment_id IN (SELECT id FROM tareas WHERE course_id = ?))',
      [cId]
    );
    await runner.execute('DELETE FROM entregas_tareas WHERE assignment_id IN (SELECT id FROM tareas WHERE course_id = ?)', [cId]);
    await runner.execute('DELETE FROM tareas WHERE course_id = ?', [cId]);
    await runner.execute('DELETE FROM cursos WHERE id = ?', [cId]);
  } finally {
    await runner.execute('SET FOREIGN_KEY_CHECKS = 1');
  }
}

// Registra una petición de inscripción o cambio de curso escolar pendiente de autorización por el Preceptor.
export async function createStudentCourseRequest(
  studentId: number,
  requestedSchoolYear: unknown,
  requestedCourseDivision: unknown,
  currentSchoolYear: unknown = null,
  currentCourseDivision: unknown = null
): Promise<{
  id: number;
  studentId: number;
  requestedSchoolYear: number;
  requestedCourseDivision: number;
  requestType: 'inscription' | 'change';
  status: 'pending';
}> {
  const { schoolYear: reqYear, courseDivision: reqDiv } = validateYearAndDivision(
    requestedSchoolYear,
    requestedCourseDivision
  );
  const curYear = currentSchoolYear ? Number(currentSchoolYear) : null;
  const curDiv = currentCourseDivision ? Number(currentCourseDivision) : null;
  const requestType: 'inscription' | 'change' = curYear && curDiv ? 'change' : 'inscription';

  // Asegura la existencia de la tabla solicitudes_curso antes de insertar.
  await db.execute(
    `CREATE TABLE IF NOT EXISTS solicitudes_curso (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      student_id INT UNSIGNED NOT NULL,
      current_school_year TINYINT UNSIGNED NULL DEFAULT NULL,
      current_course_division TINYINT UNSIGNED NULL DEFAULT NULL,
      requested_school_year TINYINT UNSIGNED NOT NULL,
      requested_course_division TINYINT UNSIGNED NOT NULL,
      request_type ENUM('inscription', 'change') NOT NULL DEFAULT 'inscription',
      status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      reviewed_by INT UNSIGNED NULL DEFAULT NULL,
      reviewed_at DATETIME NULL DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_solicitudes_curso_status (status, requested_school_year, requested_course_division),
      INDEX idx_solicitudes_curso_student (student_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  // Si el alumno ya tenía una petición pendiente, la reemplaza por la nueva solicitud.
  await db.execute("DELETE FROM solicitudes_curso WHERE student_id = ? AND status = 'pending'", [studentId]);

  const [ins]: any = await db.execute(
    `INSERT INTO solicitudes_curso
       (student_id, current_school_year, current_course_division, requested_school_year, requested_course_division, request_type, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [studentId, curYear, curDiv, reqYear, reqDiv, requestType]
  );

  // Envía una notificación a todos los preceptores activos sobre la nueva petición de curso.
  try {
    const [stuRows] = await db.execute<any[]>('SELECT first_name, last_name FROM usuarios WHERE id = ? LIMIT 1', [
      studentId,
    ]);
    const studentName = stuRows[0] ? `${stuRows[0].first_name} ${stuRows[0].last_name}`.trim() : 'Un alumno';
    const [preceptors] = await db.execute<any[]>(
      `SELECT u.id
       FROM usuarios u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'preceptor' AND u.deleted_at IS NULL`
    );
    const title =
      requestType === 'change'
        ? `Petición de cambio de curso a ${reqYear}° ${reqDiv}ª`
        : `Petición de ingreso a ${reqYear}° ${reqDiv}ª`;
    const body =
      requestType === 'change'
        ? `${studentName} solicitó cambiar de ${curYear}° ${curDiv}ª al curso ${reqYear}° Año - ${reqDiv}° Curso.`
        : `${studentName} solicitó inscribirse al curso ${reqYear}° Año - ${reqDiv}° Curso.`;

    for (const p of preceptors) {
      await db.execute(
        `INSERT INTO notificaciones (user_id, type, title, body, resource_type, resource_id)
         VALUES (?, 'course_request', ?, ?, 'course_request', ?)`,
        [p.id, title, body, ins.insertId]
      );
    }
  } catch {}

  notificarCambioTiempoReal('POST', '/api/v1/attendance/course-requests');

  return {
    id: Number(ins.insertId),
    studentId,
    requestedSchoolYear: reqYear,
    requestedCourseDivision: reqDiv,
    requestType,
    status: 'pending',
  };
}
