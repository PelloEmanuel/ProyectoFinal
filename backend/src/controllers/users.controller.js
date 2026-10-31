/**
 * Archivo: backend/src/controllers/users.controller.js
 * Descripción: Gestión del perfil del usuario, elección de Año (1° a 6°) y Curso (1° a 3°),
 * cronograma de horarios y materias del alumno, progreso académico, favoritos, estadísticas,
 * calendario de entregas y certificados obtenidos.
 */
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { AppError, asyncHandler } = require('../utils/errors');
const { publicUser } = require('../utils/serializers');
const tokens = require('../utils/tokens');
const { logAudit } = require('../utils/audit');
const { syncStudentCourseEnrollments } = require('../utils/school');

const USER_QUERY = `
  SELECT u.*, r.name AS role_name
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE u.id = ? AND u.deleted_at IS NULL`;

async function findById(id) {
  const [rows] = await db.execute(USER_QUERY, [id]);
  return rows[0] || null;
}

async function getStudentScheduleAndEnsureEnrollments(user) {
  if (!user || !user.school_year || !user.course_division) {
    return [];
  }
  await syncStudentCourseEnrollments(user.id, user.school_year, user.course_division);
  const [scheduleRows] = await db.execute(
    `SELECT cs.id, cs.course_id AS courseId, cs.school_year AS schoolYear,
            cs.course_division AS courseDivision, cs.day_of_week AS dayOfWeek,
            cs.start_time AS startTime, cs.end_time AS endTime, cs.classroom,
            c.title AS courseTitle, c.instructor_id AS instructorId,
            cat.name AS categoryName,
            COALESCE(CONCAT(inst.first_name, ' ', inst.last_name), 'Sin profesor asignado') AS instructorName
     FROM course_schedules cs
     JOIN courses c ON c.id = cs.course_id
     LEFT JOIN categories cat ON cat.id = c.category_id
     LEFT JOIN users inst ON inst.id = c.instructor_id
     WHERE cs.school_year = ? AND cs.course_division = ? AND c.status <> 'archived'
     ORDER BY FIELD(cs.day_of_week, 'Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'), cs.start_time ASC`,
    [user.school_year, user.course_division]
  );
  return scheduleRows;
}

exports.me = asyncHandler(async (req, res) => {
  const user = await findById(req.user.id);
  if (!user) throw new AppError('Usuario no encontrado', 404);
  const serialized = publicUser(user);
  res.json({ success: true, data: serialized, ...serialized });
});

exports.setSchoolGroup = asyncHandler(async (req, res) => {
  const { schoolYear, courseDivision, accessCode } = req.body;
  const sy = parseInt(schoolYear, 10);
  const cd = parseInt(courseDivision, 10);

  if (!sy || !cd || isNaN(sy) || isNaN(cd)) {
    throw new AppError('Año y Curso numéricos son requeridos.', 422, 'INVALID_GROUP');
  }

  // 1. Verificar que el curso escolar exista y esté abierto institucionalmente
  const [groups] = await db.execute(
    'SELECT * FROM school_groups WHERE school_year = ? AND course_division = ?',
    [sy, cd]
  );

  if (!groups.length || groups[0].status !== 'open') {
    throw new AppError(
      `El curso ${sy}° ${cd}ª no se encuentra abierto en la institución.`,
      400,
      'COURSE_NOT_OPEN'
    );
  }

  const group = groups[0];

  // 2. REQUISITO DE SEGURIDAD INSTITUCIONAL:
  // Validar el código de acceso del curso para que únicamente los alumnos autorizados ingresen
  if (group.access_code) {
    const provided = (accessCode || '').trim().toUpperCase();
    const expected = group.access_code.trim().toUpperCase();
    if (!provided || provided !== expected) {
      throw new AppError(
        'Código de acceso del curso incorrecto. Solicitá el código al Administrador o Preceptor para ingresar a este curso.',
        403,
        'INVALID_COURSE_CODE'
      );
    }
  }

  // 3. Si el código es correcto, asignar al alumno y sincronizar materias del curso
  await syncStudentCourseEnrollments(req.user.id, sy, cd);
  await logAudit(req.user.id, 'SCHOOL_GROUP_SELECTED', 'user', req.user.id, {
    schoolYear: sy,
    courseDivision: cd,
  });
  const fresh = await findById(req.user.id);
  const serialized = publicUser(fresh);
  res.json({
    success: true,
    message: `¡Acceso concedido! Te asignaste a ${serialized.schoolGroupLabel}. Se aplicaron las materias y horarios de tu curso.`,
    user: serialized,
    data: serialized,
  });
});

exports.mySchedule = asyncHandler(async (req, res) => {
  const user = await findById(req.user.id);
  const schedule = await getStudentScheduleAndEnsureEnrollments(user);
  res.json({
    success: true,
    data: {
      schoolYear: user?.school_year || null,
      courseDivision: user?.course_division || null,
      schoolGroupLabel:
        user?.school_year && user?.course_division ? `${user.school_year}° Año - ${user.course_division}° Curso` : null,
      schedule,
    },
  });
});

exports.updateMe = asyncHandler(async (req, res) => {
  const user = await findById(req.user.id);
  if (!user) throw new AppError('Usuario no encontrado', 404);

  const { firstName, lastName, name, email, username, bio, avatarUrl, currentPassword, newPassword, schoolYear, courseDivision } = req.body;
  const sets = [];
  const vals = [];

  if (firstName !== undefined) {
    sets.push('first_name = ?');
    vals.push(String(firstName).trim());
  }
  if (lastName !== undefined) {
    sets.push('last_name = ?');
    vals.push(String(lastName).trim());
  }
  if (firstName === undefined && lastName === undefined && name !== undefined) {
    const parts = String(name).trim().split(/\s+/);
    sets.push('first_name = ?', 'last_name = ?');
    vals.push(parts[0] || user.first_name, parts.slice(1).join(' ') || user.last_name);
  }
  if (email !== undefined && String(email).trim()) {
    const cleanEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new AppError('El formato del correo electrónico no es válido', 422, 'INVALID_EMAIL');
    }
    if (cleanEmail !== user.email) {
      const [dup] = await db.execute('SELECT id FROM users WHERE email = ? AND id <> ?', [cleanEmail, user.id]);
      if (dup.length) throw new AppError('El correo electrónico ya está en uso por otra cuenta', 409, 'EMAIL_EXISTS');
      sets.push('email = ?');
      vals.push(cleanEmail);
    }
  }
  if (username !== undefined) {
    const clean = username ? String(username).trim().toLowerCase() : null;
    sets.push('username = ?');
    vals.push(clean);
  }
  if (bio !== undefined) {
    sets.push('bio = ?');
    vals.push(String(bio).trim());
  }
  if (avatarUrl !== undefined) {
    sets.push('avatar_url = ?');
    vals.push(avatarUrl ? String(avatarUrl).trim() : null);
  }
  if (newPassword) {
    if (user.password_hash && !(await bcrypt.compare(currentPassword || '', user.password_hash))) {
      throw new AppError('La contraseña actual es incorrecta', 400, 'INVALID_PASSWORD');
    }
    sets.push('password_hash = ?');
    vals.push(await bcrypt.hash(newPassword, 10));
  }

  if (sets.length) {
    await db.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...vals, user.id]);
  }
  if (schoolYear !== undefined && courseDivision !== undefined) {
    await syncStudentCourseEnrollments(user.id, schoolYear, courseDivision);
  } else if (!sets.length) {
    throw new AppError('No hay cambios para guardar', 400);
  }

  await logAudit(user.id, 'PROFILE_UPDATED', 'user', user.id);
  const updated = publicUser(await findById(user.id));
  res.json({ success: true, data: updated, ...updated });
});

exports.updatePreferences = asyncHandler(async (req, res) => {
  const user = await findById(req.user.id);
  const current = user.preferences
    ? typeof user.preferences === 'object'
      ? user.preferences
      : JSON.parse(user.preferences)
    : { theme: 'light', notifications: true, language: 'es' };

  const updatedPrefs = {
    ...current,
    ...(req.body.theme !== undefined && { theme: req.body.theme === 'dark' ? 'dark' : 'light' }),
    ...(req.body.notifications !== undefined && { notifications: !!req.body.notifications }),
    ...(req.body.language !== undefined && { language: String(req.body.language).slice(0, 10) }),
  };

  await db.execute('UPDATE users SET preferences = ? WHERE id = ?', [JSON.stringify(updatedPrefs), user.id]);
  const updated = publicUser(await findById(user.id));
  res.json({ success: true, data: updated, ...updated });
});

exports.updatePassword = asyncHandler(async (req, res) => {
  const user = await findById(req.user.id);
  const { currentPassword, newPassword } = req.body;
  if (user.password_hash && !(await bcrypt.compare(currentPassword || '', user.password_hash))) {
    throw new AppError('La contraseña actual es incorrecta', 400, 'INVALID_PASSWORD');
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
  await tokens.revokeAllForUser(user.id);
  await logAudit(user.id, 'PASSWORD_CHANGED', 'user', user.id);
  res.json({ success: true, message: 'Contraseña actualizada correctamente' });
});

exports.deleteMe = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  await tokens.revokeAllForUser(userId);
  await db.execute('UPDATE courses SET instructor_id = NULL WHERE instructor_id = ?', [userId]);
  await db.execute('DELETE FROM users WHERE id = ?', [userId]);
  res.status(204).end();
});

/**
 * Inscripciones (Materias) del estudiante actual con sus horarios y profesor asignado.
 */
exports.myEnrollments = asyncHandler(async (req, res) => {
  const user = await findById(req.user.id);
  const schedule = await getStudentScheduleAndEnsureEnrollments(user);

  const [rows] = await db.execute(
    `SELECT e.id AS enrollmentId, e.status AS enrollmentStatus, e.enrolled_at AS enrolledAt,
            e.completed_at AS completedAt, e.last_accessed_at AS lastAccessedAt,
            c.id AS courseId, c.title, c.short_description AS shortDescription, c.cover_image AS coverImage,
            c.level, c.estimated_duration AS estimatedDuration, c.language,
            c.school_year AS schoolYear, c.course_division AS courseDivision,
            c.instructor_id AS instructorId, c.theme_color AS themeColor,
            cat.name AS categoryName,
            COALESCE(CONCAT(inst.first_name, ' ', inst.last_name), 'Sin profesor asignado') AS instructorName,
            (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = c.id AND l.is_required = 1) AS totalLessons,
            (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN modules m ON m.id = l.module_id
             WHERE lp.enrollment_id = e.id AND lp.status = 'completed' AND l.is_required = 1) AS completedLessons,
            (SELECT a.title FROM assignments a WHERE a.course_id = c.id AND a.status = 'published'
             ORDER BY a.due_at ASC LIMIT 1) AS nextAssignmentTitle,
            (SELECT a.due_at FROM assignments a WHERE a.course_id = c.id AND a.status = 'published'
             ORDER BY a.due_at ASC LIMIT 1) AS nextAssignmentDueAt
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN categories cat ON cat.id = c.category_id
     LEFT JOIN users inst ON inst.id = c.instructor_id
     WHERE e.student_id = ?
     ORDER BY c.title ASC`,
    [req.user.id]
  );

  const formatted = rows.map((r) => {
    const total = Number(r.totalLessons) || 0;
    const done = Number(r.completedLessons) || 0;
    const progressPercent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : r.enrollmentStatus === 'completed' ? 100 : 0;
    let tabState = 'in_progress';
    if (r.enrollmentStatus === 'archived') tabState = 'archived';
    else if (r.enrollmentStatus === 'completed' || (total > 0 && progressPercent === 100)) tabState = 'completed';

    const courseSchedules = schedule.filter((s) => Number(s.courseId) === Number(r.courseId));
    return {
      ...r,
      totalLessons: total,
      completedLessons: done,
      progressPercent,
      tabState,
      schedules: courseSchedules,
    };
  });

  res.json({ success: true, data: formatted });
});

/**
 * Resumen principal del Estudiante en el Campus Escolar:
 * - Año y Curso elegido (1° a 6° Año, 1° a 3° Curso)
 * - Todas las materias inscriptas de su curso con su profesor y horarios
 * - Cronograma semanal completo (día, hora inicio, hora fin, materia, profesor)
 * - Próximas actividades y evaluaciones
 */
exports.studentDashboard = asyncHandler(async (req, res) => {
  const studentId = req.user.id;
  const user = await findById(studentId);
  const schedule = await getStudentScheduleAndEnsureEnrollments(user);

  const [enrollments] = await db.execute(
    `SELECT e.id AS enrollmentId, e.status AS enrollmentStatus, e.enrolled_at AS enrolledAt,
            c.id AS courseId, c.title, c.short_description AS shortDescription, c.cover_image AS coverImage,
            c.category_id AS categoryId, c.school_year AS schoolYear, c.course_division AS courseDivision,
            c.instructor_id AS instructorId, c.theme_color AS themeColor,
            cat.name AS categoryName,
            COALESCE(CONCAT(inst.first_name, ' ', inst.last_name), 'Sin profesor asignado') AS instructorName,
            (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = c.id AND l.is_required = 1) AS totalLessons,
            (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
             WHERE lp.enrollment_id = e.id AND lp.status = 'completed' AND l.is_required = 1) AS completedLessons,
            (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id AND a.status = 'published') AS assignmentsCount
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN categories cat ON cat.id = c.category_id
     LEFT JOIN users inst ON inst.id = c.instructor_id
     WHERE e.student_id = ?
     ORDER BY c.title ASC`,
    [studentId]
  );

  const [upcomingAssignments] = await db.execute(
    `SELECT a.id, a.title, a.assignment_type AS assignmentType, a.due_at AS dueAt, a.max_score AS maxScore,
            c.id AS courseId, c.title AS courseTitle,
            COALESCE(CONCAT(inst.first_name, ' ', inst.last_name), 'Sin profesor asignado') AS instructorName,
            (SELECT att.status FROM assignment_attempts att
             WHERE att.assignment_id = a.id AND att.student_id = ?
             ORDER BY att.id DESC LIMIT 1) AS attemptStatus,
            (SELECT att.score FROM assignment_attempts att
             WHERE att.assignment_id = a.id AND att.student_id = ?
             ORDER BY att.id DESC LIMIT 1) AS score,
            (SELECT att.feedback FROM assignment_attempts att
             WHERE att.assignment_id = a.id AND att.student_id = ?
             ORDER BY att.id DESC LIMIT 1) AS feedback
     FROM assignments a
     JOIN enrollments e ON e.course_id = a.course_id AND e.student_id = ?
     JOIN courses c ON c.id = a.course_id
     LEFT JOIN users inst ON inst.id = c.instructor_id
     WHERE a.status = 'published'
     ORDER BY a.due_at ASC, a.id DESC`,
    [studentId, studentId, studentId, studentId]
  );

  const [[{ unreadNotifications }]] = await db.execute(
    'SELECT COUNT(*) AS unreadNotifications FROM notifications WHERE user_id = ? AND read_at IS NULL',
    [studentId]
  );

  const mappedEnrollments = enrollments.map((e) => {
    const total = Number(e.totalLessons) || 0;
    const done = Number(e.completedLessons) || 0;
    const progressPercent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : e.enrollmentStatus === 'completed' ? 100 : 0;
    const courseSchedules = schedule.filter((s) => Number(s.courseId) === Number(e.courseId));
    return {
      ...e,
      totalLessons: total,
      completedLessons: done,
      assignmentsCount: Number(e.assignmentsCount) || 0,
      progressPercent,
      schedules: courseSchedules,
    };
  });

  const pendingAssignments = upcomingAssignments.filter((a) => !a.attemptStatus || a.attemptStatus === 'in_progress');
  const gradedAssignments = upcomingAssignments.filter((a) => a.attemptStatus === 'graded');

  res.json({
    success: true,
    data: {
      schoolGroup: {
        schoolYear: user?.school_year ? Number(user.school_year) : null,
        courseDivision: user?.course_division ? Number(user.course_division) : null,
        label:
          user?.school_year && user?.course_division
            ? `${user.school_year}° Año - ${user.course_division}° Curso`
            : null,
      },
      summary: {
        inProgressCount: mappedEnrollments.length,
        completedCount: gradedAssignments.length,
        pendingAssignmentsCount: pendingAssignments.length,
        nextDueDate: pendingAssignments[0]?.dueAt || null,
        unreadNotifications: Number(unreadNotifications) || 0,
        scheduleBlocksCount: schedule.length,
      },
      subjects: mappedEnrollments,
      continueLearning: mappedEnrollments,
      schedule,
      upcomingActivities: upcomingAssignments,
      recommendations: [],
    },
  });
});

exports.myStatistics = asyncHandler(async (req, res) => {
  const studentId = req.user.id;

  const [[counts]] = await db.execute(
    `SELECT
       (SELECT COUNT(*) FROM enrollments WHERE student_id = ?) AS startedCourses,
       (SELECT COUNT(*) FROM enrollments WHERE student_id = ? AND status = 'completed') AS completedCourses,
       (SELECT COUNT(*) FROM lesson_progress lp JOIN enrollments e ON e.id = lp.enrollment_id
        WHERE e.student_id = ? AND lp.status = 'completed') AS completedLessons,
       (SELECT COUNT(*) FROM assignment_attempts WHERE student_id = ? AND status IN ('submitted','graded')) AS submittedAssignments,
       (SELECT COUNT(*) FROM assignment_attempts WHERE student_id = ? AND status = 'graded' AND score IS NOT NULL) AS gradedAssignments,
       (SELECT AVG(score) FROM assignment_attempts WHERE student_id = ? AND status = 'graded' AND score IS NOT NULL) AS averageScore,
       (SELECT COUNT(*) FROM certificates cert JOIN enrollments e ON e.id = cert.enrollment_id
        WHERE e.student_id = ? AND cert.status = 'valid') AS certificatesCount`,
    [studentId, studentId, studentId, studentId, studentId, studentId, studentId]
  );

  const [skillsAcquired] = await db.execute(
    `SELECT DISTINCT s.id, s.name, s.description, cat.name AS categoryName
     FROM enrollments e
     JOIN course_skills cs ON cs.course_id = e.course_id
     JOIN skills s ON s.id = cs.skill_id
     LEFT JOIN categories cat ON cat.id = s.category_id
     WHERE e.student_id = ?`,
    [studentId]
  );

  const [courseBreakdown] = await db.execute(
    `SELECT c.id AS courseId, c.title, e.status,
            (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = c.id AND l.is_required = 1) AS totalLessons,
            (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
             WHERE lp.enrollment_id = e.id AND lp.status = 'completed' AND l.is_required = 1) AS completedLessons
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE e.student_id = ?`,
    [studentId]
  );

  res.json({
    success: true,
    data: {
      startedCourses: Number(counts.startedCourses) || 0,
      completedCourses: Number(counts.completedCourses) || 0,
      completedLessons: Number(counts.completedLessons) || 0,
      submittedAssignments: Number(counts.submittedAssignments) || 0,
      gradedAssignments: Number(counts.gradedAssignments) || 0,
      averageScore: counts.gradedAssignments > 0 && counts.averageScore !== null ? Number(Number(counts.averageScore).toFixed(1)) : null,
      certificatesCount: Number(counts.certificatesCount) || 0,
      skillsAcquired,
      courseBreakdown: courseBreakdown.map((c) => {
        const total = Number(c.totalLessons) || 0;
        const done = Number(c.completedLessons) || 0;
        return {
          ...c,
          totalLessons: total,
          completedLessons: done,
          progressPercent: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : c.status === 'completed' ? 100 : 0,
        };
      }),
    },
  });
});

exports.myFavorites = asyncHandler(async (req, res) => {
  const [rows] = await db.execute(
    `SELECT c.id, c.title, c.short_description AS shortDescription, c.cover_image AS coverImage,
            c.level, c.estimated_duration AS estimatedDuration, c.language,
            cat.name AS categoryName,
            COALESCE(CONCAT(inst.first_name, ' ', inst.last_name), 'Sin profesor asignado') AS instructorName,
            cf.created_at AS favoritedAt
     FROM course_favorites cf
     JOIN courses c ON c.id = cf.course_id
     LEFT JOIN categories cat ON cat.id = c.category_id
     LEFT JOIN users inst ON inst.id = c.instructor_id
     WHERE cf.student_id = ?
     ORDER BY cf.created_at DESC`,
    [req.user.id]
  );
  res.json({ success: true, data: rows });
});

exports.myCertificates = asyncHandler(async (req, res) => {
  const [rows] = await db.execute(
    `SELECT cert.id, cert.verification_code AS verificationCode, cert.issued_at AS issuedAt, cert.status,
            c.id AS courseId, c.title AS courseTitle, c.estimated_duration AS estimatedDuration, c.level,
            CONCAT(stu.first_name, ' ', stu.last_name) AS studentName,
            COALESCE(CONCAT(inst.first_name, ' ', inst.last_name), 'Dirección Académica') AS instructorName
     FROM certificates cert
     JOIN enrollments e ON e.id = cert.enrollment_id
     JOIN courses c ON c.id = e.course_id
     JOIN users stu ON stu.id = e.student_id
     LEFT JOIN users inst ON inst.id = c.instructor_id
     WHERE e.student_id = ?
     ORDER BY cert.issued_at DESC`,
    [req.user.id]
  );
  res.json({ success: true, data: rows });
});

exports.myCalendar = asyncHandler(async (req, res) => {
  const studentId = req.user.id;
  const [assignmentEvents] = await db.execute(
    `SELECT a.id, a.title, a.due_at AS eventDate, a.assignment_type AS subtype,
            c.id AS courseId, c.title AS courseTitle, 'assignment_due' AS eventType,
            (SELECT att.status FROM assignment_attempts att WHERE att.assignment_id = a.id AND att.student_id = ? ORDER BY att.id DESC LIMIT 1) AS status
     FROM assignments a
     JOIN enrollments e ON e.course_id = a.course_id AND e.student_id = ?
     JOIN courses c ON c.id = a.course_id
     WHERE a.status = 'published' AND a.due_at IS NOT NULL
     ORDER BY a.due_at ASC`,
    [studentId, studentId]
  );

  const [announcementEvents] = await db.execute(
    `SELECT an.id, an.title, an.published_at AS eventDate, 'announcement' AS subtype,
            c.id AS courseId, c.title AS courseTitle, 'course_event' AS eventType, 'published' AS status
     FROM announcements an
     JOIN enrollments e ON e.course_id = an.course_id AND e.student_id = ?
     JOIN courses c ON c.id = an.course_id
     WHERE an.status = 'published'
     ORDER BY an.published_at DESC
     LIMIT 10`,
    [studentId]
  );

  res.json({
    success: true,
    data: [...assignmentEvents, ...announcementEvents].sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate)),
  });
});
