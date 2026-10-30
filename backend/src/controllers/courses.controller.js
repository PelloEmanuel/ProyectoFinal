/**
 * Archivo: backend/src/controllers/courses.controller.js
 * Descripción: Controlador integral de cursos, categorías, habilidades, módulos,
 * lecciones, inscripciones, progreso académico, emisión de certificados, favoritos y anuncios.
 * Verifica autorización por rol y propiedad del recurso en cada operación.
 */
const crypto = require('crypto');
const db = require('../config/db');
const { AppError, asyncHandler } = require('../utils/errors');
const { logAudit } = require('../utils/audit');
const {
  syncCourseGroupEnrollments,
  validateScheduleBlock,
  validateInstructorForExistingCourseSchedules,
  getOrCreateCategoryForSubject,
  deleteCourseAndDependencies,
} = require('../utils/school');

function slugify(text) {
  return (
    String(text || 'curso')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 140) +
    '-' +
    crypto.randomBytes(2).toString('hex')
  );
}

async function getCourseOrFail(courseId) {
  const [rows] = await db.execute(
    `SELECT c.*, cat.name AS category_name,
            COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Sin profesor asignado') AS instructor_name,
            u.bio AS instructor_bio, u.avatar_url AS instructor_avatar
     FROM courses c
     LEFT JOIN categories cat ON cat.id = c.category_id
     LEFT JOIN users u ON u.id = c.instructor_id
     WHERE c.id = ?`,
    [courseId]
  );
  if (!rows.length) throw new AppError('Curso no encontrado', 404, 'COURSE_NOT_FOUND');
  return rows[0];
}

function assertCourseOwnerOrAdmin(user, course) {
  if (!user) throw new AppError('Autenticación requerida', 401);
  if (user.role === 'admin') return;
  if (user.role === 'instructor' && Number(course.instructor_id) === Number(user.id)) return;
  throw new AppError('No tenés permisos para administrar este curso', 403, 'FORBIDDEN_COURSE_OWNER');
}

/**
 * Comprueba si un estudiante completó todas las lecciones obligatorias del curso y,
 * si corresponde, marca la inscripción como completada y emite el certificado único.
 */
async function checkAndCompleteEnrollment(enrollmentId, courseId, studentId) {
  const [[{ totalReq }]] = await db.execute(
    `SELECT COUNT(*) AS totalReq
     FROM lessons l
     JOIN modules m ON m.id = l.module_id
     WHERE m.course_id = ? AND l.is_required = 1`,
    [courseId]
  );

  const [[{ doneReq }]] = await db.execute(
    `SELECT COUNT(*) AS doneReq
     FROM lesson_progress lp
     JOIN lessons l ON l.id = lp.lesson_id
     JOIN modules m ON m.id = l.module_id
     WHERE lp.enrollment_id = ? AND m.course_id = ? AND l.is_required = 1 AND lp.status = 'completed'`,
    [enrollmentId, courseId]
  );

  const total = Number(totalReq) || 0;
  const done = Number(doneReq) || 0;
  const progressPercent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  let certificateIssued = null;
  if (total > 0 && done >= total) {
    await db.execute(
      "UPDATE enrollments SET status = 'completed', completed_at = COALESCE(completed_at, NOW()), last_accessed_at = NOW() WHERE id = ?",
      [enrollmentId]
    );

    const [[course]] = await db.execute('SELECT title, certificate_enabled FROM courses WHERE id = ?', [courseId]);
    if (course && course.certificate_enabled) {
      const [existingCert] = await db.execute('SELECT * FROM certificates WHERE enrollment_id = ?', [enrollmentId]);
      if (!existingCert.length) {
        const code = `SKT-${new Date().getFullYear()}-${courseId}-${enrollmentId}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const [ins] = await db.execute(
          "INSERT INTO certificates (enrollment_id, verification_code, status) VALUES (?, ?, 'valid')",
          [enrollmentId, code]
        );
        await db.execute(
          `INSERT INTO notifications (user_id, type, title, body, resource_type, resource_id)
           VALUES (?, 'certificate_issued', '¡Certificado emitido!', ?, 'certificate', ?)`,
          [studentId, `Completaste el curso "${course.title}". Tu código de verificación es ${code}.`, ins.insertId]
        );
        certificateIssued = { id: ins.insertId, verificationCode: code, certificateCode: code };
      } else {
        certificateIssued = {
          id: existingCert[0].id,
          verificationCode: existingCert[0].verification_code,
          certificateCode: existingCert[0].verification_code,
        };
      }
    }
  } else {
    await db.execute('UPDATE enrollments SET last_accessed_at = NOW() WHERE id = ?', [enrollmentId]);
  }

  return { totalLessons: total, completedLessons: done, progressPercent, certificate: certificateIssued };
}

exports.checkAndCompleteEnrollment = checkAndCompleteEnrollment;

exports.listCategories = asyncHandler(async (req, res) => {
  const [rows] = await db.execute(
    `SELECT c.id, c.name, c.description, c.status,
            (SELECT COUNT(*) FROM courses co WHERE co.category_id = c.id AND co.status = 'published') AS coursesCount
     FROM categories c
     WHERE c.status = 'active' OR ? = 'admin'
     ORDER BY c.name ASC`,
    [req.user?.role || 'student']
  );
  res.json({ success: true, data: rows });
});

exports.listSkills = asyncHandler(async (req, res) => {
  const [rows] = await db.execute(
    `SELECT s.id, s.name, s.description, s.category_id AS categoryId, c.name AS categoryName
     FROM skills s
     LEFT JOIN categories c ON c.id = s.category_id
     ORDER BY s.name ASC`
  );
  res.json({ success: true, data: rows });
});

exports.listCourses = asyncHandler(async (req, res) => {
  const { q, categoryId, level, language, maxDuration, status, sort = 'recent', mine } = req.query;
  const where = [];
  const params = [];

  const isAdmin = req.user?.role === 'admin';
  const isInstructor = req.user?.role === 'instructor';

  if (mine === 'true' && isInstructor) {
    where.push('c.instructor_id = ?');
    params.push(req.user.id);
    if (status && status !== 'all') {
      where.push('c.status = ?');
      params.push(status);
    }
  } else if (isAdmin) {
    if (status && status !== 'all') {
      where.push('c.status = ?');
      params.push(status);
    }
  } else if (isInstructor) {
    where.push("(c.status = 'published' OR c.instructor_id = ?)");
    params.push(req.user.id);
  } else {
    where.push("c.status = 'published' AND c.visibility = 'public'");
  }

  if (req.query.schoolYear) {
    where.push('c.school_year = ?');
    params.push(Number(req.query.schoolYear));
  }
  if (req.query.courseDivision) {
    where.push('c.course_division = ?');
    params.push(Number(req.query.courseDivision));
  }

  if (categoryId) {
    where.push('c.category_id = ?');
    params.push(Number(categoryId));
  }
  if (level) {
    where.push('c.level = ?');
    params.push(level);
  }
  if (language) {
    where.push('c.language = ?');
    params.push(language);
  }
  if (maxDuration) {
    where.push('c.estimated_duration <= ?');
    params.push(Number(maxDuration));
  }
  if (q) {
    where.push('(c.title LIKE ? OR c.short_description LIKE ? OR c.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const offset = (page - 1) * limit;
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';

  const orderBy =
    sort === 'popular'
      ? 'studentsCount DESC, c.created_at DESC'
      : sort === 'duration'
      ? 'c.estimated_duration ASC'
      : 'c.created_at DESC';

  const sql = `
    SELECT c.id, c.instructor_id AS instructorId, c.category_id AS categoryId,
           c.school_year AS schoolYear, c.course_division AS courseDivision,
           c.title, c.slug, c.short_description AS shortDescription, c.cover_image AS coverImage,
           c.level, c.language, c.estimated_duration AS estimatedDuration,
           c.status, c.visibility, c.certificate_enabled AS certificateEnabled,
           c.published_at AS publishedAt, c.created_at AS createdAt,
           cat.name AS categoryName,
           COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Sin profesor asignado') AS instructorName,
           (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentsCount,
           (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) AS modulesCount,
           (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = c.id) AS lessonsCount
    FROM courses c
    LEFT JOIN categories cat ON cat.id = c.category_id
    LEFT JOIN users u ON u.id = c.instructor_id
    ${clause}
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}`;

  const [rows] = await db.query(sql, params);
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM courses c${clause}`, params);

  const courseIds = rows.map((r) => r.id);
  let schedulesByCourse = {};
  if (courseIds.length > 0) {
    const [schedRows] = await db.query(
      `SELECT id, course_id AS courseId, school_year AS schoolYear, course_division AS courseDivision,
              day_of_week AS dayOfWeek, start_time AS startTime, end_time AS endTime, classroom
       FROM course_schedules
       WHERE course_id IN (${courseIds.map(() => '?').join(',')})
       ORDER BY FIELD(day_of_week, 'Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'), start_time ASC`,
      courseIds
    );
    for (const s of schedRows) {
      if (!schedulesByCourse[s.courseId]) schedulesByCourse[s.courseId] = [];
      schedulesByCourse[s.courseId].push(s);
    }
  }

  res.json({
    success: true,
    data: rows.map((r) => ({
      ...r,
      schoolYear: Number(r.schoolYear) || 1,
      courseDivision: Number(r.courseDivision) || 1,
      schoolGroupLabel: `${Number(r.schoolYear) || 1}° Año - ${Number(r.courseDivision) || 1}° Curso`,
      summary: r.shortDescription,
      enrolledCount: Number(r.studentsCount) || 0,
      studentsCount: Number(r.studentsCount) || 0,
      modulesCount: Number(r.modulesCount) || 0,
      lessonsCount: Number(r.lessonsCount) || 0,
      estimatedHours: Number(r.estimatedDuration) || 0,
      certificateEnabled: !!r.certificateEnabled,
      schedules: schedulesByCourse[r.id] || [],
    })),
    page,
    limit,
    total: Number(total) || 0,
  });
});

exports.getCourse = asyncHandler(async (req, res) => {
  const course = await getCourseOrFail(req.params.id);
  const user = req.user;

  const isOwnerOrAdmin = user && (user.role === 'admin' || (user.role === 'instructor' && Number(course.instructor_id) === Number(user.id)));
  if ((course.status !== 'published' || course.visibility === 'private') && !isOwnerOrAdmin) {
    // Verificar si el estudiante ya estaba inscrito
    if (!user) throw new AppError('No tenés acceso a este curso privado o en borrador', 403, 'FORBIDDEN_COURSE');
    const [enr] = await db.execute('SELECT id FROM enrollments WHERE course_id = ? AND student_id = ?', [course.id, user.id]);
    if (!enr.length) throw new AppError('No tenés acceso a este curso privado o en borrador', 403, 'FORBIDDEN_COURSE');
  }

  const [skills] = await db.execute(
    `SELECT s.id, s.name, s.description
     FROM course_skills cs
     JOIN skills s ON s.id = cs.skill_id
     WHERE cs.course_id = ?`,
    [course.id]
  );

  const [prerequisites] = await db.execute(
    `SELECT p.id, p.title, p.level
     FROM course_prerequisites cp
     JOIN courses p ON p.id = cp.prerequisite_course_id
     WHERE cp.course_id = ?`,
    [course.id]
  );

  const [modules] = await db.execute(
    'SELECT id, course_id AS courseId, title, description, position FROM modules WHERE course_id = ? ORDER BY position ASC, id ASC',
    [course.id]
  );

  const [lessons] = await db.execute(
    `SELECT l.id, l.module_id AS moduleId, l.title, l.content_type AS contentType, l.content,
            l.attachments AS attachments,
            l.created_at AS createdAt,
            l.position, l.estimated_duration AS estimatedDuration, l.is_required AS isRequired
     FROM lessons l
     JOIN modules m ON m.id = l.module_id
     WHERE m.course_id = ?
     ORDER BY m.position ASC, l.position ASC, l.id ASC`,
    [course.id]
  );

  const [resources] = await db.execute(
    `SELECT lr.id, lr.lesson_id AS lessonId, lr.title, lr.resource_type AS resourceType, lr.resource_url AS resourceUrl
     FROM lesson_resources lr
     JOIN lessons l ON l.id = lr.lesson_id
     JOIN modules m ON m.id = l.module_id
     WHERE m.course_id = ?`,
    [course.id]
  );

  const [assignments] = await db.execute(
    `SELECT id, course_id AS courseId, module_id AS moduleId, title, description,
            attachments,
            assignment_type AS assignmentType, max_score AS maxScore, passing_score AS passingScore,
            due_at AS dueAt, max_attempts AS maxAttempts, status
     FROM assignments
     WHERE course_id = ? AND (? = 1 OR status = 'published')
     ORDER BY due_at ASC, id ASC`,
    [course.id, isOwnerOrAdmin ? 1 : 0]
  );

  const [announcements] = await db.execute(
    `SELECT a.id, a.title, a.content, a.attachments, a.published_at AS publishedAt,
            CONCAT(u.first_name, ' ', u.last_name) AS authorName
     FROM announcements a
     JOIN users u ON u.id = a.instructor_id
     WHERE a.course_id = ? AND a.status = 'published'
     ORDER BY a.published_at DESC`,
    [course.id]
  );

  const [[{ studentsCount }]] = await db.execute('SELECT COUNT(*) AS studentsCount FROM enrollments WHERE course_id = ?', [course.id]);

  let enrollment = null;
  let completedLessonIds = [];
  let isFavorite = false;

  if (user) {
    const [enrRows] = await db.execute('SELECT * FROM enrollments WHERE course_id = ? AND student_id = ?', [course.id, user.id]);
    if (enrRows.length) {
      const e = enrRows[0];
      const [progRows] = await db.execute(
        "SELECT lesson_id FROM lesson_progress WHERE enrollment_id = ? AND status = 'completed'",
        [e.id]
      );
      completedLessonIds = progRows.map((p) => p.lesson_id);
      const reqLessons = lessons.filter((l) => l.isRequired);
      const doneReq = reqLessons.filter((l) => completedLessonIds.includes(l.id)).length;
      const progressPercent = reqLessons.length > 0 ? Math.min(100, Math.round((doneReq / reqLessons.length) * 100)) : 0;
      enrollment = {
        id: e.id,
        status: e.status,
        enrolledAt: e.enrolled_at,
        completedAt: e.completed_at,
        progressPercent,
        completedLessonIds,
      };
    }
    const [favRows] = await db.execute('SELECT id FROM course_favorites WHERE course_id = ? AND student_id = ?', [course.id, user.id]);
    isFavorite = favRows.length > 0;
  }

  const [schedules] = await db.execute(
    `SELECT id, course_id AS courseId, school_year AS schoolYear, course_division AS courseDivision,
            day_of_week AS dayOfWeek, start_time AS startTime, end_time AS endTime, classroom
     FROM course_schedules
     WHERE course_id = ?
     ORDER BY FIELD(day_of_week, 'Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'), start_time ASC`,
    [course.id]
  );

  const structuredModules = modules.map((m) => ({
    ...m,
    lessons: lessons
      .filter((l) => l.moduleId === m.id)
      .map((l) => ({
        ...l,
        isRequired: !!l.isRequired,
        completed: completedLessonIds.includes(l.id),
        resources: resources.filter((r) => r.lessonId === l.id),
        attachments: l.attachments ? (typeof l.attachments === 'string' ? JSON.parse(l.attachments) : l.attachments) : [],
      })),
  }));

  const sy = Number(course.school_year) || 1;
  const cd = Number(course.course_division) || 1;

  const [groupSchedule] = await db.execute(
    `SELECT cs.id, cs.course_id AS courseId, cs.school_year AS schoolYear,
            cs.course_division AS courseDivision, cs.day_of_week AS dayOfWeek,
            cs.start_time AS startTime, cs.end_time AS endTime, cs.classroom,
            c.title AS courseTitle, c.instructor_id AS instructorId,
            COALESCE(CONCAT(inst.first_name, ' ', inst.last_name), 'Sin profesor asignado') AS instructorName
     FROM course_schedules cs
     JOIN courses c ON c.id = cs.course_id
     LEFT JOIN users inst ON inst.id = c.instructor_id
     WHERE cs.school_year = ? AND cs.course_division = ?
     ORDER BY FIELD(cs.day_of_week, 'Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'),
              cs.start_time ASC`,
    [sy, cd]
  );

  const detail = {
    id: course.id,
    instructorId: course.instructor_id,
    instructorName: course.instructor_name || 'Sin profesor asignado',
    instructorBio: course.instructor_bio || '',
    instructorAvatar: course.instructor_avatar || null,
    categoryId: course.category_id,
    categoryName: course.category_name,
    schoolYear: sy,
    courseDivision: cd,
    schoolGroupLabel: `${sy}° Año - ${cd}° Curso`,
    themeColor: course.theme_color || null,
    title: course.title,
    slug: course.slug,
    shortDescription: course.short_description,
    summary: course.short_description,
    description: course.description,
    coverImage: course.cover_image,
    level: course.level,
    language: course.language,
    estimatedDuration: course.estimated_duration,
    estimatedHours: course.estimated_duration,
    objectives: course.objectives ? course.objectives.split('|').filter(Boolean) : [],
    requirements: course.requirements || '',
    status: course.status,
    visibility: course.visibility,
    certificateEnabled: !!course.certificate_enabled,
    publishedAt: course.published_at,
    studentsCount: Number(studentsCount) || 0,
    enrolledCount: Number(studentsCount) || 0,
    schedules,
    groupSchedule,
    skills,
    prerequisites,
    modules: structuredModules,
    assignments: assignments.map((a) => ({
      ...a,
      attachments: a.attachments ? (typeof a.attachments === 'string' ? JSON.parse(a.attachments) : a.attachments) : [],
    })),
    announcements: announcements.map((ann) => ({
      ...ann,
      attachments: ann.attachments ? (typeof ann.attachments === 'string' ? JSON.parse(ann.attachments) : ann.attachments) : [],
    })),
    enrollment,
    isFavorite,
  };

  res.json({ success: true, data: detail, ...detail });
});

exports.createCourse = asyncHandler(async (req, res) => {
  const {
    title,
    shortDescription,
    description,
    categoryId,
    coverImage,
    level = 'beginner',
    language = 'Español',
    estimatedDuration = 10,
    objectives,
    requirements,
    visibility = 'public',
    certificateEnabled = true,
    skillIds = [],
    prerequisiteIds = [],
    schoolYear = 1,
    courseDivision = 1,
    schedules = [],
    dayOfWeek,
    startTime,
    endTime,
    classroom,
  } = req.body;

  const sy = Math.min(Math.max(Number(schoolYear) || 1, 1), 6);
  const cd = Math.min(Math.max(Number(courseDivision) || 1, 1), 3);

  let instructorId = req.user.id;
  if (req.user.role === 'admin') {
    if (req.body.instructorId === null || req.body.instructorId === '' || req.body.instructorId === 'null' || req.body.instructorId === 0 || req.body.instructorId === undefined) {
      instructorId = null;
    } else {
      instructorId = Number(req.body.instructorId);
    }
  }

  const rawBlocks = Array.isArray(schedules) && schedules.length > 0
    ? schedules
    : dayOfWeek && startTime && endTime
    ? [{ dayOfWeek, startTime, endTime, classroom }]
    : [];

  const validatedBlocks = [];
  for (const b of rawBlocks) {
    const valid = await validateScheduleBlock({
      schoolYear: sy,
      courseDivision: cd,
      dayOfWeek: b.dayOfWeek,
      startTime: b.startTime,
      endTime: b.endTime,
      instructorId,
    });
    validatedBlocks.push({ ...valid, classroom: b.classroom ? String(b.classroom).trim() : null });
  }

  const cleanTitle = title.trim();
  const effectiveCategoryId = await getOrCreateCategoryForSubject(cleanTitle);

  const slug = slugify(`${cleanTitle}-${sy}-${cd}`);
  const objectivesText = Array.isArray(objectives) ? objectives.join('|') : objectives || '';
  const initialStatus = ['published', 'draft', 'archived'].includes(req.body.status) ? req.body.status : 'published';
  const finalShort = (shortDescription || `${cleanTitle} - ${sy}° Año ${cd}° Curso`).trim();
  const finalDesc = (description || finalShort).trim();

  const createdId = await db.withTransaction(async (conn) => {
    const [ins] = await conn.execute(
      `INSERT INTO courses (instructor_id, category_id, school_year, course_division, title, slug, short_description, description, cover_image,
                            level, language, estimated_duration, objectives, requirements, status, visibility, certificate_enabled, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        instructorId,
        effectiveCategoryId,
        sy,
        cd,
        cleanTitle,
        slug,
        finalShort,
        finalDesc,
        coverImage || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
        level,
        language,
        Number(estimatedDuration) || 10,
        objectivesText,
        requirements || '',
        initialStatus,
        visibility,
        certificateEnabled ? 1 : 0,
        initialStatus === 'published' ? new Date() : null,
      ]
    );

    for (const blk of validatedBlocks) {
      await conn.execute(
        `INSERT INTO course_schedules (course_id, school_year, course_division, day_of_week, start_time, end_time, classroom)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ins.insertId, sy, cd, blk.dayOfWeek, blk.startTime, blk.endTime, blk.classroom]
      );
    }

    if (Array.isArray(skillIds)) {
      for (const sid of skillIds) {
        await conn.execute('INSERT IGNORE INTO course_skills (course_id, skill_id) VALUES (?, ?)', [ins.insertId, Number(sid)]);
      }
    }
    if (Array.isArray(prerequisiteIds)) {
      for (const pid of prerequisiteIds) {
        if (Number(pid) !== ins.insertId) {
          await conn.execute('INSERT IGNORE INTO course_prerequisites (course_id, prerequisite_course_id) VALUES (?, ?)', [
            ins.insertId,
            Number(pid),
          ]);
        }
      }
    }
    return ins.insertId;
  });

  await syncCourseGroupEnrollments(createdId, sy, cd);
  await logAudit(req.user.id, 'COURSE_CREATED', 'course', createdId, { title, schoolYear: sy, courseDivision: cd, instructorId });
  req.params.id = createdId;
  res.status(201);
  return exports.getCourse(req, res);
});

exports.updateCourse = asyncHandler(async (req, res) => {
  const course = await getCourseOrFail(req.params.id);
  assertCourseOwnerOrAdmin(req.user, course);

  const map = {
    title: 'title',
    shortDescription: 'short_description',
    summary: 'short_description',
    description: 'description',
    categoryId: 'category_id',
    coverImage: 'cover_image',
    level: 'level',
    language: 'language',
    estimatedDuration: 'estimated_duration',
    estimatedHours: 'estimated_duration',
    requirements: 'requirements',
    visibility: 'visibility',
    status: 'status',
    schoolYear: 'school_year',
    courseDivision: 'course_division',
    themeColor: 'theme_color',
    color: 'theme_color',
  };

  const sets = [];
  const vals = [];
  for (const [key, col] of Object.entries(map)) {
    if (req.body[key] !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(req.body[key]);
    }
  }

  if (req.body.title !== undefined) {
    const cleanTitle = String(req.body.title).trim();
    const newCatId = await getOrCreateCategoryForSubject(cleanTitle);
    const catIdx = sets.findIndex((s) => s.startsWith('category_id'));
    if (catIdx !== -1) {
      vals[catIdx] = newCatId;
    } else {
      sets.push('category_id = ?');
      vals.push(newCatId);
    }
  }

  if (req.user.role === 'admin' && req.body.instructorId !== undefined) {
    const nextInstId =
      req.body.instructorId === null || req.body.instructorId === '' || req.body.instructorId === 'null' || req.body.instructorId === 0
        ? null
        : Number(req.body.instructorId);
    await validateInstructorForExistingCourseSchedules(course.id, nextInstId);
    sets.push('instructor_id = ?');
    vals.push(nextInstId);
  }

  if (req.body.objectives !== undefined) {
    sets.push('objectives = ?');
    vals.push(Array.isArray(req.body.objectives) ? req.body.objectives.join('|') : req.body.objectives);
  }
  if (req.body.certificateEnabled !== undefined) {
    sets.push('certificate_enabled = ?');
    vals.push(req.body.certificateEnabled ? 1 : 0);
  }

  const nextSy = req.body.schoolYear !== undefined ? Number(req.body.schoolYear) : Number(course.school_year) || 1;
  const nextCd = req.body.courseDivision !== undefined ? Number(req.body.courseDivision) : Number(course.course_division) || 1;

  await db.withTransaction(async (conn) => {
    if (sets.length) {
      await conn.execute(`UPDATE courses SET ${sets.join(', ')} WHERE id = ?`, [...vals, course.id]);
    }
    if (req.body.schoolYear !== undefined || req.body.courseDivision !== undefined) {
      await conn.execute('UPDATE course_schedules SET school_year = ?, course_division = ? WHERE course_id = ?', [
        nextSy,
        nextCd,
        course.id,
      ]);
    }
    if (Array.isArray(req.body.skillIds)) {
      await conn.execute('DELETE FROM course_skills WHERE course_id = ?', [course.id]);
      for (const sid of req.body.skillIds) {
        await conn.execute('INSERT IGNORE INTO course_skills (course_id, skill_id) VALUES (?, ?)', [course.id, Number(sid)]);
      }
    }
  });

  await syncCourseGroupEnrollments(course.id, nextSy, nextCd);
  await logAudit(req.user.id, 'COURSE_UPDATED', 'course', course.id);
  return exports.getCourse(req, res);
});

exports.publishCourse = asyncHandler(async (req, res) => {
  const course = await getCourseOrFail(req.params.id);
  assertCourseOwnerOrAdmin(req.user, course);

  const [[{ modulesCount }]] = await db.execute('SELECT COUNT(*) AS modulesCount FROM modules WHERE course_id = ?', [course.id]);
  const [[{ lessonsCount }]] = await db.execute(
    'SELECT COUNT(*) AS lessonsCount FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = ?',
    [course.id]
  );

  if (Number(modulesCount) < 1 || Number(lessonsCount) < 1) {
    throw new AppError(
      'Para publicar un curso debe contar al menos con 1 módulo y 1 lección cargada',
      400,
      'INCOMPLETE_COURSE'
    );
  }

  await db.execute("UPDATE courses SET status = 'published', published_at = COALESCE(published_at, NOW()) WHERE id = ?", [course.id]);
  await logAudit(req.user.id, 'COURSE_PUBLISHED', 'course', course.id, { title: course.title });
  return exports.getCourse(req, res);
});

exports.archiveCourse = asyncHandler(async (req, res) => {
  const course = await getCourseOrFail(req.params.id);
  assertCourseOwnerOrAdmin(req.user, course);
  await db.execute("UPDATE courses SET status = 'archived' WHERE id = ?", [course.id]);
  await logAudit(req.user.id, 'COURSE_ARCHIVED', 'course', course.id, { title: course.title });
  return exports.getCourse(req, res);
});

exports.deleteCourse = asyncHandler(async (req, res) => {
  const course = await getCourseOrFail(req.params.id);
  assertCourseOwnerOrAdmin(req.user, course);

  await deleteCourseAndDependencies(course.id);
  await logAudit(req.user.id, 'COURSE_DELETED', 'course', course.id, { title: course.title });
  res.status(204).end();
});

// ----------------------------------------------------------------------------
// Módulos y Lecciones
// ----------------------------------------------------------------------------

exports.listModules = asyncHandler(async (req, res) => {
  const course = await getCourseOrFail(req.params.id);
  const [modules] = await db.execute(
    'SELECT id, course_id AS courseId, title, description, position FROM modules WHERE course_id = ? ORDER BY position ASC, id ASC',
    [course.id]
  );
  const [lessons] = await db.execute(
    `SELECT l.id, l.module_id AS moduleId, l.title, l.content_type AS contentType, l.content,
            l.attachments AS attachments,
            l.created_at AS createdAt,
            l.position, l.estimated_duration AS estimatedDuration, l.is_required AS isRequired
     FROM lessons l
     JOIN modules m ON m.id = l.module_id
     WHERE m.course_id = ?
     ORDER BY m.position ASC, l.position ASC`,
    [course.id]
  );
  res.json({
    success: true,
    data: modules.map((m) => ({
      ...m,
      lessons: lessons.filter((l) => l.moduleId === m.id),
    })),
  });
});

exports.createModule = asyncHandler(async (req, res) => {
  const course = await getCourseOrFail(req.params.id);
  assertCourseOwnerOrAdmin(req.user, course);

  const { title, description = '', position } = req.body;
  let pos = Number(position);
  if (!pos) {
    const [[{ maxPos }]] = await db.execute('SELECT COALESCE(MAX(position), 0) AS maxPos FROM modules WHERE course_id = ?', [course.id]);
    pos = Number(maxPos) + 1;
  }

  const [ins] = await db.execute(
    'INSERT INTO modules (course_id, title, description, position) VALUES (?, ?, ?, ?)',
    [course.id, title.trim(), description.trim(), pos]
  );
  res.status(201).json({
    success: true,
    data: { id: ins.insertId, courseId: course.id, title: title.trim(), description: description.trim(), position: pos, lessons: [] },
  });
});

exports.updateModule = asyncHandler(async (req, res) => {
  const [rows] = await db.execute('SELECT * FROM modules WHERE id = ?', [req.params.id]);
  if (!rows.length) throw new AppError('Módulo no encontrado', 404);
  const mod = rows[0];
  const course = await getCourseOrFail(mod.course_id);
  assertCourseOwnerOrAdmin(req.user, course);

  const title = req.body.title !== undefined ? req.body.title.trim() : mod.title;
  const description = req.body.description !== undefined ? req.body.description.trim() : mod.description;
  const position = req.body.position !== undefined ? Number(req.body.position) : mod.position;

  await db.execute('UPDATE modules SET title = ?, description = ?, position = ? WHERE id = ?', [title, description, position, mod.id]);
  res.json({ success: true, data: { id: mod.id, courseId: mod.course_id, title, description, position } });
});

exports.deleteModule = asyncHandler(async (req, res) => {
  const [rows] = await db.execute('SELECT * FROM modules WHERE id = ?', [req.params.id]);
  if (!rows.length) throw new AppError('Módulo no encontrado', 404);
  const course = await getCourseOrFail(rows[0].course_id);
  assertCourseOwnerOrAdmin(req.user, course);

  await db.execute('DELETE FROM modules WHERE id = ?', [rows[0].id]);
  res.status(204).end();
});

exports.createLesson = asyncHandler(async (req, res) => {
  const [mRows] = await db.execute('SELECT * FROM modules WHERE id = ?', [req.params.id]);
  if (!mRows.length) throw new AppError('Módulo no encontrado', 404);
  const mod = mRows[0];
  const course = await getCourseOrFail(mod.course_id);
  assertCourseOwnerOrAdmin(req.user, course);

  const {
    title,
    position,
    isRequired = true,
    resources = [],
    attachments = [],
  } = req.body;

  const rawType = req.body.contentType || req.body.lessonType || 'text';
  const contentType = ['text', 'video', 'document', 'link'].includes(rawType) ? rawType : 'text';
  const content = req.body.content || req.body.contentText || `Contenido de la lección ${title}`;
  const estimatedDuration = req.body.estimatedDuration || req.body.estimatedMinutes || 15;

  let pos = Number(position);
  if (!pos) {
    const [[{ maxPos }]] = await db.execute('SELECT COALESCE(MAX(position), 0) AS maxPos FROM lessons WHERE module_id = ?', [mod.id]);
    pos = Number(maxPos) + 1;
  }

  const attachmentsJson = Array.isArray(attachments) ? JSON.stringify(attachments) : null;

  const [ins] = await db.execute(
    `INSERT INTO lessons (module_id, title, content_type, content, attachments, position, estimated_duration, is_required)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [mod.id, title.trim(), contentType, content.trim(), attachmentsJson, pos, Number(estimatedDuration) || 15, isRequired ? 1 : 0]
  );

  const allResources = [...resources];
  if (Array.isArray(attachments)) {
    for (const a of attachments) {
      if (a && (a.url || a.fileUrl)) {
        allResources.push({
          title: a.name || a.fileName || 'Adjunto',
          resourceType: a.type === 'link' || a.kind === 'link' ? 'link' : 'doc',
          resourceUrl: a.url || a.fileUrl,
        });
      }
    }
  }

  for (const r of allResources) {
    if (r.title && r.resourceUrl) {
      await db.execute(
        'INSERT INTO lesson_resources (lesson_id, title, resource_type, resource_url) VALUES (?, ?, ?, ?)',
        [ins.insertId, String(r.title).trim(), r.resourceType || 'link', String(r.resourceUrl).trim()]
      );
    }
  }

  res.status(201).json({
    success: true,
    data: {
      id: ins.insertId,
      moduleId: mod.id,
      title: title.trim(),
      contentType,
      content: content.trim(),
      attachments: Array.isArray(attachments) ? attachments : [],
      createdAt: new Date().toISOString(),
      position: pos,
      estimatedDuration: Number(estimatedDuration) || 15,
      isRequired: !!isRequired,
    },
  });
});

exports.getLesson = asyncHandler(async (req, res) => {
  const [rows] = await db.execute(
    `SELECT l.id, l.module_id AS moduleId, l.title, l.content_type AS contentType, l.content,
            l.attachments AS attachments,
            l.created_at AS createdAt,
            l.position, l.estimated_duration AS estimatedDuration, l.is_required AS isRequired,
            m.title AS moduleTitle, m.course_id AS courseId, c.title AS courseTitle
     FROM lessons l
     JOIN modules m ON m.id = l.module_id
     JOIN courses c ON c.id = m.course_id
     WHERE l.id = ?`,
    [req.params.id]
  );
  if (!rows.length) throw new AppError('Lección no encontrada', 404);
  const lesson = rows[0];

  const [resources] = await db.execute(
    'SELECT id, title, resource_type AS resourceType, resource_url AS resourceUrl FROM lesson_resources WHERE lesson_id = ?',
    [lesson.id]
  );

  const [siblingLessons] = await db.execute(
    'SELECT id, title, position FROM lessons WHERE module_id = ? ORDER BY position ASC, id ASC',
    [lesson.moduleId]
  );

  let completed = false;
  if (req.user) {
    const [prog] = await db.execute(
      `SELECT lp.status FROM lesson_progress lp
       JOIN enrollments e ON e.id = lp.enrollment_id
       WHERE e.student_id = ? AND e.course_id = ? AND lp.lesson_id = ?`,
      [req.user.id, lesson.courseId, lesson.id]
    );
    completed = prog[0]?.status === 'completed';
  }

  const attachments = lesson.attachments
    ? typeof lesson.attachments === 'string'
      ? JSON.parse(lesson.attachments)
      : lesson.attachments
    : [];

  res.json({
    success: true,
    data: {
      ...lesson,
      attachments,
      isRequired: !!lesson.isRequired,
      completed,
      resources,
      moduleLessons: siblingLessons,
    },
  });
});

exports.updateLesson = asyncHandler(async (req, res) => {
  const [rows] = await db.execute('SELECT l.*, m.course_id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ?', [
    req.params.id,
  ]);
  if (!rows.length) throw new AppError('Lección no encontrada', 404);
  const lesson = rows[0];
  const course = await getCourseOrFail(lesson.course_id);
  assertCourseOwnerOrAdmin(req.user, course);

  const title = req.body.title !== undefined ? req.body.title.trim() : lesson.title;
  const content = req.body.content !== undefined ? req.body.content.trim() : lesson.content;
  const contentType = req.body.contentType || lesson.content_type;
  const position = req.body.position !== undefined ? Number(req.body.position) : lesson.position;
  const estimatedDuration = req.body.estimatedDuration !== undefined ? Number(req.body.estimatedDuration) : lesson.estimated_duration;
  const isRequired = req.body.isRequired !== undefined ? (req.body.isRequired ? 1 : 0) : lesson.is_required;
  const attachments = req.body.attachments !== undefined
    ? (Array.isArray(req.body.attachments) ? JSON.stringify(req.body.attachments) : null)
    : lesson.attachments;

  await db.execute(
    'UPDATE lessons SET title = ?, content = ?, content_type = ?, attachments = ?, position = ?, estimated_duration = ?, is_required = ? WHERE id = ?',
    [title, content, contentType, attachments, position, estimatedDuration, isRequired, lesson.id]
  );

  res.json({
    success: true,
    data: {
      id: lesson.id,
      moduleId: lesson.module_id,
      title,
      content,
      contentType,
      attachments: attachments ? (typeof attachments === 'string' ? JSON.parse(attachments) : attachments) : [],
      position,
      estimatedDuration,
      isRequired: !!isRequired,
    },
  });
});

exports.deleteLesson = asyncHandler(async (req, res) => {
  const [rows] = await db.execute('SELECT l.*, m.course_id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ?', [
    req.params.id,
  ]);
  if (!rows.length) throw new AppError('Lección no encontrada', 404);
  const course = await getCourseOrFail(rows[0].course_id);
  assertCourseOwnerOrAdmin(req.user, course);

  await db.execute('DELETE FROM lessons WHERE id = ?', [rows[0].id]);
  res.status(204).end();
});

// ----------------------------------------------------------------------------
// Inscripciones y Progreso
// ----------------------------------------------------------------------------

exports.enrollCourse = asyncHandler(async (req, res) => {
  const course = await getCourseOrFail(req.params.id);
  if (course.status !== 'published') {
    throw new AppError('Solo podés inscribirte en cursos publicados', 400, 'COURSE_NOT_PUBLISHED');
  }

  const [existing] = await db.execute('SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?', [req.user.id, course.id]);
  if (existing.length) {
    throw new AppError('Ya estás inscrito en este curso', 409, 'ALREADY_ENROLLED');
  }

  const [ins] = await db.execute(
    "INSERT INTO enrollments (student_id, course_id, status, enrolled_at, last_accessed_at) VALUES (?, ?, 'active', NOW(), NOW())",
    [req.user.id, course.id]
  );

  await db.execute(
    `INSERT INTO notifications (user_id, type, title, body, resource_type, resource_id)
     VALUES (?, 'enrollment', 'Inscripción confirmada', ?, 'course', ?)`,
    [req.user.id, `Te inscribiste en el curso "${course.title}". ¡Comenzá tu primera lección!`, course.id]
  );
  await logAudit(req.user.id, 'COURSE_ENROLLED', 'course', course.id);

  res.status(201).json({
    success: true,
    message: 'Inscripción realizada con éxito',
    data: { enrollmentId: ins.insertId, courseId: course.id, status: 'active' },
  });
});

exports.unenrollCourse = asyncHandler(async (req, res) => {
  await db.execute('DELETE FROM enrollments WHERE student_id = ? AND course_id = ?', [req.user.id, req.params.id]);
  res.status(204).end();
});

exports.getEnrollment = asyncHandler(async (req, res) => {
  const [rows] = await db.execute(
    `SELECT e.*, c.title AS courseTitle, c.instructor_id AS instructorId
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE e.id = ?`,
    [req.params.id]
  );
  if (!rows.length) throw new AppError('Inscripción no encontrada', 404);
  const enr = rows[0];

  const isAllowed =
    req.user.role === 'admin' ||
    Number(enr.student_id) === Number(req.user.id) ||
    (req.user.role === 'instructor' && Number(enr.instructorId) === Number(req.user.id));

  if (!isAllowed) throw new AppError('No tenés autorización para consultar el progreso de otro estudiante', 403);
  res.json({ success: true, data: enr });
});

exports.getEnrollmentProgress = asyncHandler(async (req, res) => {
  const [rows] = await db.execute(
    `SELECT e.*, c.instructor_id AS instructorId
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE e.id = ?`,
    [req.params.id]
  );
  if (!rows.length) throw new AppError('Inscripción no encontrada', 404);
  const enr = rows[0];

  const isAllowed =
    req.user.role === 'admin' ||
    Number(enr.student_id) === Number(req.user.id) ||
    (req.user.role === 'instructor' && Number(enr.instructorId) === Number(req.user.id));

  if (!isAllowed) throw new AppError('No tenés autorización para consultar el progreso de otro estudiante', 403);

  const [progress] = await db.execute(
    `SELECT lp.lesson_id AS lessonId, lp.status, lp.started_at AS startedAt, lp.completed_at AS completedAt, l.title
     FROM lesson_progress lp
     JOIN lessons l ON l.id = lp.lesson_id
     WHERE lp.enrollment_id = ?`,
    [enr.id]
  );

  res.json({ success: true, data: { enrollmentId: enr.id, status: enr.status, lessons: progress } });
});

exports.startLesson = asyncHandler(async (req, res) => {
  const [lRows] = await db.execute('SELECT l.id, m.course_id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ?', [
    req.params.id,
  ]);
  if (!lRows.length) throw new AppError('Lección no encontrada', 404);
  const { id: lessonId, course_id: courseId } = lRows[0];

  const [enr] = await db.execute('SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?', [req.user.id, courseId]);
  if (!enr.length) throw new AppError('Debés inscribirte en el curso para registrar tu avance', 403);

  await db.execute(
    `INSERT INTO lesson_progress (enrollment_id, lesson_id, status, started_at)
     VALUES (?, ?, 'in_progress', NOW())
     ON DUPLICATE KEY UPDATE updated_at = NOW()`,
    [enr[0].id, lessonId]
  );
  await db.execute('UPDATE enrollments SET last_accessed_at = NOW() WHERE id = ?', [enr[0].id]);

  res.json({ success: true, message: 'Progreso iniciado' });
});

exports.completeLesson = asyncHandler(async (req, res) => {
  const [lRows] = await db.execute('SELECT l.id, m.course_id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ?', [
    req.params.id,
  ]);
  if (!lRows.length) throw new AppError('Lección no encontrada', 404);
  const { id: lessonId, course_id: courseId } = lRows[0];

  const [enr] = await db.execute('SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?', [req.user.id, courseId]);
  if (!enr.length) throw new AppError('Debés estar inscrito en el curso para completar lecciones', 403);

  await db.execute(
    `INSERT INTO lesson_progress (enrollment_id, lesson_id, status, started_at, completed_at)
     VALUES (?, ?, 'completed', NOW(), NOW())
     ON DUPLICATE KEY UPDATE status = 'completed', completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()`,
    [enr[0].id, lessonId]
  );

  const summary = await checkAndCompleteEnrollment(enr[0].id, courseId, req.user.id);
  res.json({
    success: true,
    message: summary.certificate ? '¡Lección y curso completados! Se emitió tu certificado.' : 'Lección marcada como completada',
    data: summary,
  });
});

// ----------------------------------------------------------------------------
// Favoritos y Anuncios
// ----------------------------------------------------------------------------

exports.addFavorite = asyncHandler(async (req, res) => {
  const course = await getCourseOrFail(req.params.id);
  await db.execute('INSERT IGNORE INTO course_favorites (student_id, course_id) VALUES (?, ?)', [req.user.id, course.id]);
  res.status(201).json({ success: true, message: 'Curso guardado en favoritos', isFavorite: true });
});

exports.removeFavorite = asyncHandler(async (req, res) => {
  await db.execute('DELETE FROM course_favorites WHERE student_id = ? AND course_id = ?', [req.user.id, req.params.id]);
  res.json({ success: true, message: 'Curso quitado de favoritos', isFavorite: false });
});

exports.listAnnouncements = asyncHandler(async (req, res) => {
  const course = await getCourseOrFail(req.params.id);
  const [rows] = await db.execute(
    `SELECT a.id, a.course_id AS courseId, a.title, a.content, a.published_at AS publishedAt, a.status,
            CONCAT(u.first_name, ' ', u.last_name) AS authorName
     FROM announcements a
     JOIN users u ON u.id = a.instructor_id
     WHERE a.course_id = ? AND a.status = 'published'
     ORDER BY a.published_at DESC`,
    [course.id]
  );
  res.json({
    success: true,
    data: rows.map((a) => ({
      ...a,
      attachments: a.attachments ? (typeof a.attachments === 'string' ? JSON.parse(a.attachments) : a.attachments) : [],
    })),
  });
});

exports.createAnnouncement = asyncHandler(async (req, res) => {
  const course = await getCourseOrFail(req.params.id);
  assertCourseOwnerOrAdmin(req.user, course);

  const { title, content, attachments = [] } = req.body;
  const attachmentsJson = Array.isArray(attachments) ? JSON.stringify(attachments) : null;
  const finalTitle = (title && String(title).trim()) ? String(title).trim() : (String(content || '').trim().slice(0, 50) || 'Aviso');

  const [ins] = await db.execute(
    "INSERT INTO announcements (course_id, instructor_id, title, content, attachments, status) VALUES (?, ?, ?, ?, ?, 'published')",
    [course.id, req.user.id, finalTitle, content.trim(), attachmentsJson]
  );

  // Notificar a todos los estudiantes inscritos en este curso
  const [enrolledStudents] = await db.execute('SELECT student_id FROM enrollments WHERE course_id = ?', [course.id]);
  for (const s of enrolledStudents) {
    await db.execute(
      `INSERT INTO notifications (user_id, type, title, body, resource_type, resource_id)
       VALUES (?, 'announcement', ?, ?, 'course', ?)`,
      [s.student_id, `Nuevo anuncio en ${course.title}`, title.trim(), course.id]
    );
  }

  res.status(201).json({
    success: true,
    data: {
      id: ins.insertId,
      courseId: course.id,
      title: title.trim(),
      content: content.trim(),
      attachments: Array.isArray(attachments) ? attachments : [],
      authorName: req.user.name,
      publishedAt: new Date().toISOString(),
    },
  });
});

exports.updateAnnouncement = asyncHandler(async (req, res) => {
  const [rows] = await db.execute('SELECT * FROM announcements WHERE id = ?', [req.params.id]);
  if (!rows.length) throw new AppError('Anuncio no encontrado', 404);
  const ann = rows[0];
  const course = await getCourseOrFail(ann.course_id);
  assertCourseOwnerOrAdmin(req.user, course);

  const title = req.body.title !== undefined ? req.body.title.trim() : ann.title;
  const content = req.body.content !== undefined ? req.body.content.trim() : ann.content;
  const attachmentsJson =
    req.body.attachments !== undefined
      ? Array.isArray(req.body.attachments)
        ? JSON.stringify(req.body.attachments)
        : null
      : ann.attachments;

  await db.execute('UPDATE announcements SET title = ?, content = ?, attachments = ? WHERE id = ?', [
    title,
    content,
    attachmentsJson,
    ann.id,
  ]);
  res.json({
    success: true,
    data: {
      id: ann.id,
      title,
      content,
      attachments: attachmentsJson
        ? typeof attachmentsJson === 'string'
          ? JSON.parse(attachmentsJson)
          : attachmentsJson
        : [],
    },
  });
});

exports.deleteAnnouncement = asyncHandler(async (req, res) => {
  const [rows] = await db.execute('SELECT * FROM announcements WHERE id = ?', [req.params.id]);
  if (!rows.length) throw new AppError('Anuncio no encontrado', 404);
  const course = await getCourseOrFail(rows[0].course_id);
  assertCourseOwnerOrAdmin(req.user, course);

  await db.execute('DELETE FROM announcements WHERE id = ?', [rows[0].id]);
  res.status(204).end();
});

const YEAR_SHORT = { 1: '1ro', 2: '2do', 3: '3ro', 4: '4to', 5: '5to', 6: '6to' };
const DIV_SHORT = { 1: '1ra', 2: '2da', 3: '3ra' };

exports.getSchoolGroupSchedule = asyncHandler(async (req, res) => {
  const sy = Number(req.params.schoolYear || req.query.schoolYear || 1);
  const cd = Number(req.params.courseDivision || req.query.courseDivision || 1);
  if (sy < 1 || cd < 1) {
    throw new AppError('Curso inválido. Ingresá un Año y División válidos.', 422);
  }

  const [courses] = await db.execute(
    `SELECT c.id, c.subject_id AS subjectId, c.title, c.short_description AS summary, c.description,
            c.category_id AS categoryId, c.school_year AS schoolYear, c.course_division AS courseDivision,
            c.instructor_id AS instructorId, c.status, c.theme_color AS themeColor,
            cat.name AS categoryName,
            COALESCE(CONCAT(inst.first_name, ' ', inst.last_name), 'Sin profesor asignado') AS instructorName,
            (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentsCount,
            (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) AS modulesCount,
            (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignmentsCount
     FROM courses c
     LEFT JOIN categories cat ON cat.id = c.category_id
     LEFT JOIN users inst ON inst.id = c.instructor_id
     WHERE c.school_year = ? AND c.course_division = ? AND c.status <> 'archived'
     ORDER BY c.title ASC`,
    [sy, cd]
  );

  // Seguridad estricta: un docente solo puede acceder a los cursos donde se encuentra asignado
  if (req.user && req.user.role === 'instructor') {
    const isAssigned = courses.some((c) => Number(c.instructorId) === Number(req.user.id));
    if (!isAssigned) {
      throw new AppError('No estás asignado como docente a este curso.', 403, 'FORBIDDEN_COURSE_GROUP');
    }
  }

  const [schedule] = await db.execute(
    `SELECT cs.id, cs.course_id AS courseId, cs.school_year AS schoolYear,
            cs.course_division AS courseDivision, cs.day_of_week AS dayOfWeek,
            cs.start_time AS startTime, cs.end_time AS endTime, cs.classroom,
            c.subject_id AS subjectId, c.title AS courseTitle, c.instructor_id AS instructorId,
            cat.name AS categoryName,
            COALESCE(CONCAT(inst.first_name, ' ', inst.last_name), 'Sin profesor asignado') AS instructorName
     FROM course_schedules cs
     JOIN courses c ON c.id = cs.course_id
     LEFT JOIN categories cat ON cat.id = c.category_id
     LEFT JOIN users inst ON inst.id = c.instructor_id
     WHERE cs.school_year = ? AND cs.course_division = ?
     ORDER BY FIELD(cs.day_of_week, 'Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'),
              cs.start_time ASC`,
    [sy, cd]
  );

  const shortLabel = `${YEAR_SHORT[sy] || `${sy}°`} ${DIV_SHORT[cd] || `${cd}°`}`;
  const fullLabel = `${sy}° Año - ${cd}° Curso (${shortLabel})`;

  res.json({
    success: true,
    data: {
      schoolGroup: {
        schoolYear: sy,
        courseDivision: cd,
        shortLabel,
        label: fullLabel,
      },
      courses: courses.map((c) => ({
        ...c,
        schedules: schedule.filter((s) => Number(s.courseId) === Number(c.id)),
      })),
      schedule,
    },
  });
});
