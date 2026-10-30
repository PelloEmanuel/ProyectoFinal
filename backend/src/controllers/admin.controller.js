/**
 * Archivo: backend/src/controllers/admin.controller.js
 * Descripción: Controlador de administración global, reportes verificables, auditoría,
 * gestión de cuentas y roles, CRUD de categorías y habilidades, configuración general,
 * bandeja de notificaciones y verificación pública de certificados.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { AppError, asyncHandler } = require('../utils/errors');
const { publicUser } = require('../utils/serializers');
const tokens = require('../utils/tokens');
const { logAudit } = require('../utils/audit');
const {
  validateYearAndDivision,
  syncCourseGroupEnrollments,
  validateScheduleBlock,
  validateMultipleSlotsInternal,
  validateInstructorForExistingCourseSchedules,
  getOrCreateCategoryForSubject,
  deleteCourseAndDependencies,
} = require('../utils/school');

const USER_SQL = `
  SELECT u.*, r.name AS role_name
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE u.deleted_at IS NULL`;

async function getUserByIdOrFail(id) {
  const [rows] = await db.execute(`${USER_SQL} AND u.id = ?`, [id]);
  if (!rows.length) throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  return rows[0];
}

// ----------------------------------------------------------------------------
// Panel del Administrador y Reportes
// ----------------------------------------------------------------------------

exports.adminDashboard = asyncHandler(async (req, res) => {
  const [[metrics]] = await db.execute(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS totalUsers,
      (SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'student' AND u.status = 'active' AND u.deleted_at IS NULL) AS activeStudents,
      (SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'instructor' AND u.deleted_at IS NULL) AS totalInstructors,
      (SELECT COUNT(*) FROM courses WHERE status = 'published') AS publishedCourses,
      (SELECT COUNT(*) FROM courses WHERE status = 'draft') AS draftCourses,
      (SELECT COUNT(*) FROM courses WHERE status = 'archived') AS archivedCourses,
      (SELECT COUNT(*) FROM enrollments) AS totalEnrollments,
      (SELECT COUNT(*) FROM enrollments WHERE status = 'completed') AS completedEnrollments,
      (SELECT COUNT(*) FROM assignments) AS totalAssignments,
      (SELECT COUNT(*) FROM assignment_attempts WHERE status = 'submitted') AS pendingSubmissions,
      (SELECT COUNT(*) FROM certificates WHERE status = 'valid') AS issuedCertificates
  `);

  const [byRole] = await db.execute(`
    SELECT r.name AS role, COUNT(u.id) AS count
    FROM roles r
    LEFT JOIN users u ON u.role_id = r.id AND u.deleted_at IS NULL
    GROUP BY r.id, r.name
  `);

  const [topCourses] = await db.execute(`
    SELECT c.id, c.title, c.status, c.school_year AS schoolYear, c.course_division AS courseDivision,
           cat.name AS categoryName,
           COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Sin profesor asignado') AS instructorName,
           COUNT(e.id) AS enrollmentsCount,
           SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) AS completedCount
    FROM courses c
    LEFT JOIN categories cat ON cat.id = c.category_id
    LEFT JOIN users u ON u.id = c.instructor_id
    LEFT JOIN enrollments e ON e.course_id = c.id
    GROUP BY c.id, c.title, c.status, c.school_year, c.course_division, cat.name, u.first_name, u.last_name
    ORDER BY enrollmentsCount DESC, c.id ASC
    LIMIT 6
  `);

  const [recentAudit] = await db.execute(`
    SELECT al.id, al.action, al.entity_type AS entityType, al.entity_id AS entityId, al.created_at AS createdAt,
           CONCAT(u.first_name, ' ', u.last_name) AS actorName
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.actor_user_id
    ORDER BY al.created_at DESC
    LIMIT 10
  `);

  const [keyRows] = await db.execute(
    "SELECT setting_value FROM platform_settings WHERE setting_key = 'instructor_registration_key' LIMIT 1"
  );
  const instructorRegistrationKey = keyRows[0]?.setting_value || 'DOCENTE2026';

  const totalEnr = Number(metrics.totalEnrollments) || 0;
  const compEnr = Number(metrics.completedEnrollments) || 0;
  const pubCourses = Number(metrics.publishedCourses) || 0;
  const drfCourses = Number(metrics.draftCourses) || 0;
  const arcCourses = Number(metrics.archivedCourses) || 0;
  const mappedRoles = byRole.map((r) => ({ role: r.role, count: Number(r.count) || 0 }));
  const mappedTopCourses = topCourses.map((c) => ({
    ...c,
    enrolledCount: Number(c.enrollmentsCount) || 0,
    enrollmentsCount: Number(c.enrollmentsCount) || 0,
    completedCount: Number(c.completedCount) || 0,
  }));

  res.json({
    success: true,
    data: {
      instructorRegistrationKey,
      metrics: {
        totalUsers: Number(metrics.totalUsers) || 0,
        activeUsers: Number(metrics.totalUsers) || 0,
        activeStudents: Number(metrics.activeStudents) || 0,
        totalInstructors: Number(metrics.totalInstructors) || 0,
        totalCourses: pubCourses + drfCourses + arcCourses,
        publishedCourses: pubCourses,
        draftCourses: drfCourses,
        archivedCourses: arcCourses,
        totalEnrollments: totalEnr,
        completedEnrollments: compEnr,
        completionRate: totalEnr > 0 ? Math.round((compEnr / totalEnr) * 100) : 0,
        totalAssignments: Number(metrics.totalAssignments) || 0,
        pendingSubmissions: Number(metrics.pendingSubmissions) || 0,
        issuedCertificates: Number(metrics.issuedCertificates) || 0,
        totalCertificates: Number(metrics.issuedCertificates) || 0,
      },
      byRole: mappedRoles,
      roleDistribution: mappedRoles,
      topCourses: mappedTopCourses,
      recentAudit,
      recentAuditLogs: recentAudit,
    },
  });
});

exports.reportUnified = asyncHandler(async (req, res) => {
  const type = req.query.type || 'completion';
  if (type === 'users') {
    const [rows] = await db.execute(`
      SELECT r.name AS role, u.status, COUNT(u.id) AS totalUsers,
             SUM(CASE WHEN u.email_verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verifiedUsers,
             SUM(CASE WHEN u.two_factor_enabled = 1 THEN 1 ELSE 0 END) AS twoFactorUsers
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.deleted_at IS NULL
      GROUP BY r.name, u.status
    `);
    return res.json({ success: true, data: { type, rows } });
  }
  if (type === 'enrollments') {
    const [rows] = await db.execute(`
      SELECT e.id AS enrollmentId, e.status, e.enrolled_at AS enrolledAt,
             c.title AS courseTitle,
             CONCAT(u.first_name, ' ', u.last_name) AS studentName,
             u.email AS studentEmail,
             (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = c.id AND l.is_required = 1) AS totalReq,
             (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id WHERE lp.enrollment_id = e.id AND lp.status = 'completed' AND l.is_required = 1) AS doneReq
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      JOIN users u ON u.id = e.student_id
      ORDER BY e.enrolled_at DESC
    `);
    return res.json({
      success: true,
      data: {
        type,
        rows: rows.map((r) => ({
          ...r,
          progressPercent: Number(r.totalReq) > 0 ? Math.min(100, Math.round((Number(r.doneReq) / Number(r.totalReq)) * 100)) : 0,
        })),
      },
    });
  }
  // default: completion
  const [rows] = await db.execute(`
    SELECT c.id AS courseId, c.title AS courseTitle, cat.name AS categoryName,
           COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Sin profesor asignado') AS instructorName,
           COUNT(e.id) AS totalEnrolled,
           SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) AS completedCount,
           (SELECT AVG(att.score) FROM assignment_attempts att JOIN assignments a ON a.id = att.assignment_id
            WHERE a.course_id = c.id AND att.status = 'graded') AS averageGrade
    FROM courses c
    LEFT JOIN categories cat ON cat.id = c.category_id
    LEFT JOIN users u ON u.id = c.instructor_id
    LEFT JOIN enrollments e ON e.course_id = c.id
    GROUP BY c.id, c.title, cat.name, u.first_name, u.last_name
  `);
  return res.json({
    success: true,
    data: {
      type: 'completion',
      rows: rows.map((r) => {
        const total = Number(r.totalEnrolled) || 0;
        const done = Number(r.completedCount) || 0;
        return {
          ...r,
          totalEnrolled: total,
          completedCount: done,
          averageProgress: total > 0 ? Math.round((done / total) * 100) : 0,
          averageGrade: r.averageGrade !== null ? Number(Number(r.averageGrade).toFixed(1)) : null,
        };
      }),
    },
  });
});

exports.reportUsers = asyncHandler(async (req, res) => {
  const [byRole] = await db.execute(`
    SELECT r.name AS role, COUNT(u.id) AS total,
           SUM(CASE WHEN u.status = 'active' THEN 1 ELSE 0 END) AS activeCount,
           SUM(CASE WHEN u.status = 'suspended' THEN 1 ELSE 0 END) AS suspendedCount
    FROM roles r
    LEFT JOIN users u ON u.role_id = r.id AND u.deleted_at IS NULL
    GROUP BY r.id, r.name
  `);
  res.json({ success: true, data: byRole });
});

exports.reportCourses = asyncHandler(async (req, res) => {
  const [rows] = await db.execute(`
    SELECT c.id, c.title, c.status, c.level, cat.name AS categoryName,
           COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Sin profesor asignado') AS instructorName,
           (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) AS modulesCount,
           (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = c.id) AS lessonsCount,
           (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrollmentsCount
    FROM courses c
    LEFT JOIN categories cat ON cat.id = c.category_id
    LEFT JOIN users u ON u.id = c.instructor_id
    ORDER BY enrollmentsCount DESC
  `);
  res.json({ success: true, data: rows });
});

exports.reportEnrollments = asyncHandler(async (req, res) => {
  const [rows] = await db.execute(`
    SELECT c.id AS courseId, c.title AS courseTitle,
           COUNT(e.id) AS totalEnrollments,
           SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) AS activeEnrollments,
           SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) AS completedEnrollments
    FROM courses c
    LEFT JOIN enrollments e ON e.course_id = c.id
    GROUP BY c.id, c.title
    ORDER BY totalEnrollments DESC
  `);
  res.json({ success: true, data: rows });
});

exports.reportCompletion = asyncHandler(async (req, res) => {
  const [rows] = await db.execute(`
    SELECT c.id AS courseId, c.title AS courseTitle,
           COUNT(e.id) AS enrolled,
           SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) AS completed,
           (SELECT AVG(att.score) FROM assignment_attempts att JOIN assignments a ON a.id = att.assignment_id
            WHERE a.course_id = c.id AND att.status = 'graded') AS averageGrade
    FROM courses c
    LEFT JOIN enrollments e ON e.course_id = c.id
    GROUP BY c.id, c.title
  `);
  res.json({
    success: true,
    data: rows.map((r) => {
      const enrolled = Number(r.enrolled) || 0;
      const completed = Number(r.completed) || 0;
      return {
        courseId: r.courseId,
        courseTitle: r.courseTitle,
        enrolled,
        completed,
        completionRate: enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0,
        averageGrade: r.averageGrade !== null ? Number(Number(r.averageGrade).toFixed(1)) : null,
      };
    }),
  });
});

exports.listAuditLogs = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 100);
  const [rows] = await db.query(
    `SELECT al.id, al.actor_user_id AS actorUserId, al.action, al.entity_type AS entityType,
            al.entity_id AS entityId, al.metadata, al.created_at AS createdAt,
            CONCAT(u.first_name, ' ', u.last_name) AS actorName, u.email AS actorEmail
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_user_id
     ORDER BY al.created_at DESC
     LIMIT ${limit}`
  );
  res.json({ success: true, data: rows });
});

// ----------------------------------------------------------------------------
// Gestión Administrativa de Usuarios
// ----------------------------------------------------------------------------

exports.listUsers = asyncHandler(async (req, res) => {
  const { q, role, status } = req.query;
  const where = ['u.deleted_at IS NULL'];
  const params = [];

  if (role) {
    where.push('r.name = ?');
    params.push(role);
  }
  if (status) {
    where.push('u.status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const [rows] = await db.execute(
    `SELECT u.*, r.name AS role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE ${where.join(' AND ')}
     ORDER BY u.created_at DESC`,
    params
  );

  const list = rows.map(publicUser);
  res.json({ success: true, data: list });
});

exports.getUser = asyncHandler(async (req, res) => {
  const u = await getUserByIdOrFail(req.params.id);
  const serialized = publicUser(u);
  res.json({ success: true, data: serialized, ...serialized });
});

exports.createUser = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, role = 'student' } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();
  const [exists] = await db.execute('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  if (exists.length) throw new AppError('El correo electrónico ya está registrado', 409);

  const [roleRows] = await db.execute('SELECT id FROM roles WHERE name = ?', [role]);
  if (!roleRows.length) throw new AppError('Rol inválido', 400);

  const hash = await bcrypt.hash(password, 10);
  const [ins] = await db.execute(
    `INSERT INTO users (first_name, last_name, email, password_hash, role_id, status, created_by_admin, email_verified_at)
     VALUES (?, ?, ?, ?, ?, 'active', 1, NOW())`,
    [firstName.trim(), (lastName || 'SkillTrack').trim(), normalizedEmail, hash, roleRows[0].id]
  );

  await logAudit(req.user.id, 'ADMIN_USER_CREATED', 'user', ins.insertId, { role, email: normalizedEmail });
  const created = publicUser(await getUserByIdOrFail(ins.insertId));
  res.status(201).json({ success: true, data: created, ...created });
});

exports.updateUser = asyncHandler(async (req, res) => {
  const target = await getUserByIdOrFail(req.params.id);
  const { firstName, lastName, email, password, role, status, bio } = req.body;

  // Si el usuario no fue creado por el administrador:
  // Solo se permite cambiar su rol institucional y suspender/reactivar su cuenta.
  if (!target.created_by_admin) {
    if (
      (firstName !== undefined && String(firstName).trim() !== target.first_name) ||
      (lastName !== undefined && String(lastName).trim() !== target.last_name) ||
      (email !== undefined && String(email).trim().toLowerCase() !== target.email.toLowerCase()) ||
      (password !== undefined && String(password).trim().length > 0) ||
      (bio !== undefined && String(bio).trim() !== (target.bio || ''))
    ) {
      throw new AppError(
        'El correo electrónico, contraseña y datos personales de este usuario solo pueden ser modificados por el propio usuario desde su cuenta. Como administrador podés cambiar su rol institucional (estudiante/docente) y suspender o reactivar su cuenta.',
        403,
        'CANNOT_EDIT_CREDENTIALS'
      );
    }
  }

  const sets = [];
  const vals = [];

  // Datos personales y credenciales (solo si fue creado por admin)
  if (target.created_by_admin) {
    if (firstName !== undefined && String(firstName).trim()) {
      sets.push('first_name = ?');
      vals.push(String(firstName).trim());
    }
    if (lastName !== undefined && String(lastName).trim()) {
      sets.push('last_name = ?');
      vals.push(String(lastName).trim());
    }
    if (email !== undefined && String(email).trim()) {
      const cleanEmail = String(email).trim().toLowerCase();
      if (cleanEmail !== target.email) {
        const [dup] = await db.execute('SELECT id FROM users WHERE email = ? AND id <> ?', [cleanEmail, target.id]);
        if (dup.length) throw new AppError('Ese correo electrónico ya está en uso por otro usuario', 409, 'EMAIL_EXISTS');
        sets.push('email = ?');
        vals.push(cleanEmail);
      }
    }
    if (password !== undefined && String(password).trim()) {
      if (String(password).length < 6) {
        throw new AppError('La contraseña debe tener al menos 6 caracteres', 422, 'INVALID_PASSWORD');
      }
      sets.push('password_hash = ?');
      vals.push(await bcrypt.hash(String(password), 10));
    }
    if (bio !== undefined) {
      sets.push('bio = ?');
      vals.push(String(bio).trim());
    }
  }

  // Rol institucional (permitido tanto para usuarios creados por admin como registro propio)
  if (role !== undefined && String(role).trim()) {
    if (Number(target.id) === Number(req.user.id)) {
      throw new AppError('Por seguridad no podés modificar tu propio rol de administrador', 400, 'SELF_ROLE_CHANGE');
    }
    const [roleRows] = await db.execute('SELECT id FROM roles WHERE name = ?', [String(role).trim()]);
    if (!roleRows.length) throw new AppError('Rol inválido', 400);
    sets.push('role_id = ?');
    vals.push(roleRows[0].id);
  }

  // Estado de la cuenta (activo/suspendido - permitido para ambos)
  if (status !== undefined && String(status).trim()) {
    const cleanStatus = String(status).trim().toLowerCase();
    if (!['active', 'suspended'].includes(cleanStatus)) {
      throw new AppError("Estado inválido. Debe ser 'active' o 'suspended'.", 400);
    }
    if (Number(target.id) === Number(req.user.id) && cleanStatus === 'suspended') {
      throw new AppError('No podés suspender tu propia cuenta administrativa', 400, 'SELF_STATUS_CHANGE');
    }
    sets.push('status = ?');
    vals.push(cleanStatus);
    if (cleanStatus === 'suspended') {
      await tokens.revokeAllForUser(target.id);
    }
  }

  if (sets.length > 0) {
    await db.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...vals, target.id]);
  }

  await logAudit(req.user.id, 'ADMIN_USER_UPDATED', 'user', target.id, { role, status });
  const updated = publicUser(await getUserByIdOrFail(target.id));
  res.json({ success: true, data: updated, ...updated });
});

exports.setUserRole = asyncHandler(async (req, res) => {
  const target = await getUserByIdOrFail(req.params.id);
  if (Number(target.id) === Number(req.user.id)) {
    throw new AppError('Por seguridad no podés modificar tu propio rol de administrador', 400, 'SELF_ROLE_CHANGE');
  }
  const { role } = req.body;
  const [roleRows] = await db.execute('SELECT id FROM roles WHERE name = ?', [role]);
  if (!roleRows.length) throw new AppError('Rol no válido', 400);

  await db.execute('UPDATE users SET role_id = ? WHERE id = ?', [roleRows[0].id, target.id]);
  await logAudit(req.user.id, 'USER_ROLE_CHANGED', 'user', target.id, { newRole: role });

  const updated = publicUser(await getUserByIdOrFail(target.id));
  res.json({ success: true, data: updated, ...updated });
});

exports.setUserStatus = asyncHandler(async (req, res) => {
  const target = await getUserByIdOrFail(req.params.id);
  if (Number(target.id) === Number(req.user.id)) {
    throw new AppError('No podés suspender tu propia cuenta administrativa', 400, 'SELF_STATUS_CHANGE');
  }

  let newStatus = req.body.status;
  if (!newStatus && req.body.isActive !== undefined) {
    newStatus = req.body.isActive ? 'active' : 'suspended';
  }
  if (!['active', 'suspended', 'pending_verification'].includes(newStatus)) {
    throw new AppError('Estado inválido', 400);
  }

  await db.execute('UPDATE users SET status = ? WHERE id = ?', [newStatus, target.id]);
  if (newStatus === 'suspended') {
    await tokens.revokeAllForUser(target.id);
  }
  await logAudit(req.user.id, 'USER_STATUS_CHANGED', 'user', target.id, { newStatus });

  const updated = publicUser(await getUserByIdOrFail(target.id));
  res.json({ success: true, data: updated, ...updated });
});

exports.deleteUser = asyncHandler(async (req, res) => {
  const target = await getUserByIdOrFail(req.params.id);
  if (Number(target.id) === Number(req.user.id)) {
    throw new AppError('No podés eliminar tu propia cuenta administrativa', 400);
  }
  if (!target.created_by_admin) {
    throw new AppError(
      'Solo se pueden eliminar los usuarios que hayan sido creados por el administrador.',
      403,
      'NOT_CREATED_BY_ADMIN'
    );
  }
  await db.execute("UPDATE users SET deleted_at = NOW(), status = 'suspended' WHERE id = ?", [target.id]);
  await tokens.revokeAllForUser(target.id);
  await logAudit(req.user.id, 'USER_DELETED', 'user', target.id, { email: target.email });
  res.status(204).end();
});

// ----------------------------------------------------------------------------
// CRUD Administrativo de Categorías, Habilidades y Configuración
// ----------------------------------------------------------------------------

exports.createCategory = asyncHandler(async (req, res) => {
  const { name, description = '', status = 'active' } = req.body;
  const [ins] = await db.execute('INSERT INTO categories (name, description, status) VALUES (?, ?, ?)', [
    name.trim(),
    description.trim(),
    status,
  ]);
  await logAudit(req.user.id, 'CATEGORY_CREATED', 'category', ins.insertId, { name });
  res.status(201).json({ success: true, data: { id: ins.insertId, name: name.trim(), description: description.trim(), status } });
});

exports.updateCategory = asyncHandler(async (req, res) => {
  const { name, description, status } = req.body;
  await db.execute(
    'UPDATE categories SET name = COALESCE(?, name), description = COALESCE(?, description), status = COALESCE(?, status) WHERE id = ?',
    [name ? name.trim() : null, description !== undefined ? description.trim() : null, status || null, req.params.id]
  );
  await logAudit(req.user.id, 'CATEGORY_UPDATED', 'category', Number(req.params.id));
  const [[updated]] = await db.execute('SELECT * FROM categories WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: updated });
});

exports.deleteCategory = asyncHandler(async (req, res) => {
  const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM courses WHERE category_id = ?', [req.params.id]);
  if (Number(count) > 0) {
    throw new AppError('No se puede eliminar una categoría con cursos asociados. Desactivala en su lugar.', 409);
  }
  await db.execute('DELETE FROM categories WHERE id = ?', [req.params.id]);
  await logAudit(req.user.id, 'CATEGORY_DELETED', 'category', Number(req.params.id));
  res.status(204).end();
});

exports.createSkill = asyncHandler(async (req, res) => {
  const { name, description = '', categoryId = null } = req.body;
  const [ins] = await db.execute('INSERT INTO skills (name, description, category_id) VALUES (?, ?, ?)', [
    name.trim(),
    description.trim(),
    categoryId ? Number(categoryId) : null,
  ]);
  await logAudit(req.user.id, 'SKILL_CREATED', 'skill', ins.insertId, { name });
  res.status(201).json({
    success: true,
    data: { id: ins.insertId, name: name.trim(), description: description.trim(), categoryId: categoryId ? Number(categoryId) : null },
  });
});

exports.updateSkill = asyncHandler(async (req, res) => {
  const { name, description, categoryId } = req.body;
  await db.execute(
    'UPDATE skills SET name = COALESCE(?, name), description = COALESCE(?, description), category_id = COALESCE(?, category_id) WHERE id = ?',
    [name ? name.trim() : null, description !== undefined ? description.trim() : null, categoryId ? Number(categoryId) : null, req.params.id]
  );
  const [[updated]] = await db.execute('SELECT id, name, description, category_id AS categoryId FROM skills WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: updated });
});

exports.deleteSkill = asyncHandler(async (req, res) => {
  await db.execute('DELETE FROM skills WHERE id = ?', [req.params.id]);
  await logAudit(req.user.id, 'SKILL_DELETED', 'skill', Number(req.params.id));
  res.status(204).end();
});

exports.getSettings = asyncHandler(async (req, res) => {
  const [rows] = await db.execute('SELECT setting_key AS k, setting_value AS v FROM platform_settings');
  const out = {};
  rows.forEach((r) => {
    out[r.k] = r.v;
  });
  res.json({ success: true, data: out });
});

exports.updateSettings = asyncHandler(async (req, res) => {
  const allowedKeys = [
    'platform_name',
    'institution_name',
    'platform_description',
    'enrollment_policy',
    'allow_public_registration',
    'require_email_verification',
    'certificates_enabled',
    'default_passing_score',
    'certificate_issuer_title',
    'support_email',
    'instructor_registration_key',
    'preceptor_registration_key',
  ];

  if (req.body.instructor_registration_key !== undefined) {
    const cleanKey = String(req.body.instructor_registration_key).trim();
    if (!cleanKey) {
      throw new AppError('La clave para registro de docentes no puede estar vacía', 422, 'EMPTY_INSTRUCTOR_KEY');
    }
  }

  if (req.body.preceptor_registration_key !== undefined) {
    const cleanKey = String(req.body.preceptor_registration_key).trim();
    if (!cleanKey) {
      throw new AppError('La clave para registro de preceptores no puede estar vacía', 422, 'EMPTY_PRECEPTOR_KEY');
    }
  }

  for (const key of allowedKeys) {
    if (req.body[key] !== undefined) {
      await db.execute(
        `INSERT INTO platform_settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, String(req.body[key]).trim()]
      );
    }
  }
  await logAudit(req.user.id, 'SETTINGS_UPDATED', 'system', 1);
  return exports.getSettings(req, res);
});

// ----------------------------------------------------------------------------
// Notificaciones y Certificados
// ----------------------------------------------------------------------------

exports.listNotifications = asyncHandler(async (req, res) => {
  const [rows] = await db.execute(
    `SELECT id, type, title, body, resource_type AS resourceType, resource_id AS resourceId,
            read_at AS readAt, created_at AS createdAt
     FROM notifications
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [req.user.id]
  );
  res.json({
    success: true,
    data: rows.map((n) => ({ ...n, isRead: !!n.readAt })),
  });
});

exports.markNotificationRead = asyncHandler(async (req, res) => {
  await db.execute('UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  res.json({ success: true, message: 'Notificación marcada como leída' });
});

exports.markAllNotificationsRead = asyncHandler(async (req, res) => {
  await db.execute('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
  res.json({ success: true, message: 'Todas las notificaciones fueron marcadas como leídas' });
});

exports.getCertificate = asyncHandler(async (req, res) => {
  const [rows] = await db.execute(
    `SELECT cert.id, cert.verification_code AS verificationCode, cert.issued_at AS issuedAt, cert.status,
            e.student_id AS studentId, c.id AS courseId, c.title AS courseTitle,
            c.estimated_duration AS estimatedDuration, c.level,
            CONCAT(stu.first_name, ' ', stu.last_name) AS studentName,
            COALESCE(CONCAT(inst.first_name, ' ', inst.last_name), 'Dirección Académica') AS instructorName
     FROM certificates cert
     JOIN enrollments e ON e.id = cert.enrollment_id
     JOIN courses c ON c.id = e.course_id
     JOIN users stu ON stu.id = e.student_id
     LEFT JOIN users inst ON inst.id = c.instructor_id
     WHERE cert.id = ?`,
    [req.params.id]
  );
  if (!rows.length) throw new AppError('Certificado no encontrado', 404);
  const cert = rows[0];

  if (req.user.role === 'student' && Number(cert.studentId) !== Number(req.user.id)) {
    throw new AppError('No tenés permiso para consultar este certificado privado', 403);
  }
  res.json({ success: true, data: cert });
});

exports.verifyCertificatePublic = asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').trim();
  const [rows] = await db.execute(
    `SELECT cert.verification_code AS verificationCode, cert.issued_at AS issuedAt, cert.status,
            c.title AS courseTitle, c.estimated_duration AS estimatedDuration, c.level,
            CONCAT(stu.first_name, ' ', stu.last_name) AS studentName,
            COALESCE(CONCAT(inst.first_name, ' ', inst.last_name), 'Dirección Académica') AS instructorName
     FROM certificates cert
     JOIN enrollments e ON e.id = cert.enrollment_id
     JOIN courses c ON c.id = e.course_id
     JOIN users stu ON stu.id = e.student_id
     LEFT JOIN users inst ON inst.id = c.instructor_id
     WHERE cert.verification_code = ?`,
    [code]
  );
  if (!rows.length) {
    throw new AppError('No existe ningún certificado registrado con ese código de verificación', 404, 'CERTIFICATE_NOT_FOUND');
  }
  res.json({
    success: true,
    valid: rows[0].status === 'valid',
    data: {
      ...rows[0],
      certificateCode: rows[0].verificationCode,
    },
  });
});

// ----------------------------------------------------------------------------
// Catálogo de Materias en la Base de Datos (school_subjects)
// ----------------------------------------------------------------------------

exports.listSubjects = asyncHandler(async (_req, res) => {
  const [rows] = await db.execute(
    `SELECT s.id, s.name, s.description, s.category_id AS categoryId,
            COALESCE(cat.name, 'General') AS categoryName,
            (SELECT COUNT(*) FROM courses c WHERE c.subject_id = s.id OR LOWER(c.title) = LOWER(s.name)) AS coursesCount,
            s.created_at AS createdAt
     FROM school_subjects s
     LEFT JOIN categories cat ON cat.id = s.category_id
     ORDER BY s.name ASC`
  );
  res.json({ success: true, data: rows });
});

exports.createSubject = asyncHandler(async (req, res) => {
  const name = String(req.body.name || req.body.title || '').trim();
  const description = req.body.description ? String(req.body.description).trim() : null;

  if (!name || name.length < 2) {
    throw new AppError('El nombre de la materia es obligatorio (mínimo 2 caracteres).', 422, 'SUBJECT_NAME_REQUIRED');
  }

  // REQUERIMIENTO ESTRICTO: No se pueden crear 2 materias iguales
  const [existing] = await db.execute('SELECT id, name FROM school_subjects WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1', [name]);
  if (existing.length > 0) {
    throw new AppError(`Ya existe una materia registrada con el nombre "${name}". No se permiten materias duplicadas.`, 409, 'SUBJECT_ALREADY_EXISTS');
  }

  // Se crea automáticamente una categoría con el nombre de la materia y nada más
  const categoryId = await getOrCreateCategoryForSubject(name);

  const [ins] = await db.execute(
    'INSERT INTO school_subjects (name, description, category_id) VALUES (?, ?, ?)',
    [name, description, categoryId]
  );

  // Vincular cursos existentes con el mismo título si aún no tenían subject_id o categoría sincronizada
  await db.execute(
    'UPDATE courses SET subject_id = ?, category_id = ? WHERE LOWER(TRIM(title)) = LOWER(TRIM(?))',
    [ins.insertId, categoryId, name]
  );

  await logAudit(req.user.id, 'SCHOOL_SUBJECT_CREATED', 'school_subject', ins.insertId, { name, categoryId });

  const [[created]] = await db.execute(
    `SELECT s.id, s.name, s.description, s.category_id AS categoryId,
            COALESCE(cat.name, s.name) AS categoryName
     FROM school_subjects s
     LEFT JOIN categories cat ON cat.id = s.category_id
     WHERE s.id = ?`,
    [ins.insertId]
  );

  res.status(201).json({ success: true, data: created });
});

exports.updateSubject = asyncHandler(async (req, res) => {
  const subjectId = Number(req.params.id);
  const [[subject]] = await db.execute('SELECT * FROM school_subjects WHERE id = ?', [subjectId]);
  if (!subject) throw new AppError('Materia no encontrada en la base de datos.', 404, 'SUBJECT_NOT_FOUND');

  const name = req.body.name !== undefined ? String(req.body.name).trim() : subject.name;
  const description = req.body.description !== undefined ? (req.body.description ? String(req.body.description).trim() : null) : subject.description;

  if (!name || name.length < 2) {
    throw new AppError('El nombre de la materia es obligatorio (mínimo 2 caracteres).', 422, 'SUBJECT_NAME_REQUIRED');
  }

  const [dup] = await db.execute(
    'SELECT id FROM school_subjects WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id <> ? LIMIT 1',
    [name, subjectId]
  );
  if (dup.length > 0) {
    throw new AppError(`Ya existe otra materia registrada con el nombre "${name}". No se permiten materias duplicadas.`, 409, 'SUBJECT_ALREADY_EXISTS');
  }

  // La categoría debe tener exactamente el nombre de la materia
  const categoryId = await getOrCreateCategoryForSubject(name);

  await db.execute(
    'UPDATE school_subjects SET name = ?, description = ?, category_id = ? WHERE id = ?',
    [name, description, categoryId, subjectId]
  );

  // Actualizar automáticamente el nombre y categoría en los cursos donde se dicta esta materia
  await db.execute(
    `UPDATE courses
     SET title = ?,
         category_id = ?,
         short_description = CONCAT(?, ' • ', school_year, '° Año - ', course_division, '° Curso')
     WHERE subject_id = ?`,
    [name, categoryId, name, subjectId]
  );

  await logAudit(req.user.id, 'SCHOOL_SUBJECT_UPDATED', 'school_subject', subjectId, { name, categoryId });

  const [[updated]] = await db.execute(
    `SELECT s.id, s.name, s.description, s.category_id AS categoryId,
            COALESCE(cat.name, s.name) AS categoryName
     FROM school_subjects s
     LEFT JOIN categories cat ON cat.id = s.category_id
     WHERE s.id = ?`,
    [subjectId]
  );

  res.json({ success: true, data: updated });
});

exports.deleteSubject = asyncHandler(async (req, res) => {
  const subjectId = Number(req.params.id);
  const [[subject]] = await db.execute('SELECT * FROM school_subjects WHERE id = ?', [subjectId]);
  if (!subject) throw new AppError('Materia no encontrada en la base de datos.', 404, 'SUBJECT_NOT_FOUND');

  await db.execute('DELETE FROM school_subjects WHERE id = ?', [subjectId]);
  await logAudit(req.user.id, 'SCHOOL_SUBJECT_DELETED', 'school_subject', subjectId, { name: subject.name });
  res.status(204).end();
});

// ----------------------------------------------------------------------------
// Armador de Cronograma Escolar por Año (1° a 6°) y Curso (1° a 3°)
// ----------------------------------------------------------------------------

function extractSlotsFromBody(body) {
  if (Array.isArray(body.slots) && body.slots.length > 0) {
    return validateMultipleSlotsInternal(body.slots);
  }
  if (Array.isArray(body.days) && body.days.length > 0) {
    const rawSlots = body.days.map((day) => ({
      dayOfWeek: day,
      startTime: body.startTime,
      endTime: body.endTime,
      classroom: body.classroom,
    }));
    return validateMultipleSlotsInternal(rawSlots);
  }
  if (body.dayOfWeek && body.startTime && body.endTime) {
    return validateMultipleSlotsInternal([
      {
        dayOfWeek: body.dayOfWeek,
        startTime: body.startTime,
        endTime: body.endTime,
        classroom: body.classroom,
      },
    ]);
  }
  throw new AppError(
    'Debés seleccionar al menos un día y horario para la materia (ej. Lunes y Miércoles de 07:30 a 09:30).',
    422,
    'SLOTS_REQUIRED'
  );
}

function parseNullableInstructorId(rawInstructorId) {
  if (
    rawInstructorId === null ||
    rawInstructorId === undefined ||
    rawInstructorId === '' ||
    rawInstructorId === 'null' ||
    Number(rawInstructorId) === 0
  ) {
    return null;
  }
  return Number(rawInstructorId);
}

exports.getSchoolSchedule = asyncHandler(async (req, res) => {
  const sy = req.query.schoolYear ? Number(req.query.schoolYear) : null;
  const cd = req.query.courseDivision ? Number(req.query.courseDivision) : null;

  const [subjectsCatalog] = await db.execute(
    `SELECT s.id, s.name, s.description, s.category_id AS categoryId,
            COALESCE(cat.name, 'General') AS categoryName,
            (SELECT COUNT(*) FROM courses c WHERE c.subject_id = s.id OR LOWER(c.title) = LOWER(s.name)) AS coursesCount
     FROM school_subjects s
     LEFT JOIN categories cat ON cat.id = s.category_id
     ORDER BY s.name ASC`
  );

  const [instructors] = await db.execute(
    `SELECT u.id, u.first_name AS firstName, u.last_name AS lastName,
            CONCAT(u.first_name, ' ', u.last_name) AS name, u.email
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.name = 'instructor' AND u.status = 'active' AND u.deleted_at IS NULL
     ORDER BY u.first_name ASC, u.last_name ASC`
  );

  const courseWhere = [];
  const courseParams = [];
  if (sy) {
    courseWhere.push('c.school_year = ?');
    courseParams.push(sy);
  }
  if (cd) {
    courseWhere.push('c.course_division = ?');
    courseParams.push(cd);
  }
  const courseClause = courseWhere.length ? `WHERE ${courseWhere.join(' AND ')}` : '';

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
     ${courseClause}
     ORDER BY c.school_year ASC, c.course_division ASC, c.title ASC`,
    courseParams
  );

  const schedWhere = [];
  const schedParams = [];
  if (sy) {
    schedWhere.push('cs.school_year = ?');
    schedParams.push(sy);
  }
  if (cd) {
    schedWhere.push('cs.course_division = ?');
    schedParams.push(cd);
  }
  const schedClause = schedWhere.length ? `WHERE ${schedWhere.join(' AND ')}` : '';

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
     ${schedClause}
     ORDER BY cs.school_year ASC, cs.course_division ASC,
              FIELD(cs.day_of_week, 'Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'),
              cs.start_time ASC`,
    schedParams
  );

  const enrichedCourses = courses.map((c) => ({
    ...c,
    schoolYear: Number(c.schoolYear) || 1,
    courseDivision: Number(c.courseDivision) || 1,
    schoolGroupLabel: `${Number(c.schoolYear) || 1}° Año - ${Number(c.courseDivision) || 1}° Curso`,
    schedules: schedule.filter((s) => Number(s.courseId) === Number(c.id)),
  }));

  const [schoolGroups] = await db.execute(
    `SELECT sg.id, sg.school_year AS schoolYear, sg.course_division AS courseDivision, sg.status,
            sg.access_code AS accessCode,
            (SELECT COUNT(*) FROM courses c WHERE c.school_year = sg.school_year AND c.course_division = sg.course_division) AS coursesCount,
            (SELECT COUNT(*) FROM users u WHERE u.school_year = sg.school_year AND u.course_division = sg.course_division) AS studentsCount
     FROM school_groups sg
     ORDER BY sg.school_year ASC, sg.course_division ASC`
  );

  res.json({
    success: true,
    data: {
      subjectsCatalog,
      instructors,
      courses: enrichedCourses,
      schedule,
      schoolGroups: schoolGroups.map((g) => ({
        ...g,
        label: `${g.schoolYear}° ${g.courseDivision}ª`,
        fullLabel: `${g.schoolYear}° Año - ${g.courseDivision}° Curso`,
        isOpen: g.status === 'open',
      })),
    },
  });
});

exports.addScheduleEntry = asyncHandler(async (req, res) => {
  const {
    schoolYear = 1,
    courseDivision = 1,
    courseId,
    subjectId: rawSubjectId,
    subjectName,
    title,
    categoryId: rawCategoryId,
    instructorId: rawInstructorId,
  } = req.body;

  const { schoolYear: sy, courseDivision: cd } = validateYearAndDivision(schoolYear, courseDivision);
  const instructorId = parseNullableInstructorId(rawInstructorId);
  const normalizedSlots = extractSlotsFromBody(req.body);

  // Resolver materia desde school_subjects (o por nombre)
  let resolvedSubjectId = rawSubjectId ? Number(rawSubjectId) : null;
  let resolvedTitle = String(subjectName || title || '').trim();
  let resolvedCategoryId = rawCategoryId ? Number(rawCategoryId) : 1;

  if (resolvedSubjectId) {
    const [[subj]] = await db.execute('SELECT * FROM school_subjects WHERE id = ?', [resolvedSubjectId]);
    if (!subj) {
      throw new AppError('La materia seleccionada no existe en la base de datos.', 404, 'SUBJECT_NOT_FOUND');
    }
    resolvedTitle = subj.name;
    resolvedCategoryId = subj.category_id || (await getOrCreateCategoryForSubject(resolvedTitle));
  } else if (resolvedTitle) {
    const [subjByName] = await db.execute('SELECT * FROM school_subjects WHERE LOWER(name) = LOWER(?) LIMIT 1', [
      resolvedTitle,
    ]);
    if (subjByName.length > 0) {
      resolvedSubjectId = subjByName[0].id;
      resolvedTitle = subjByName[0].name;
      resolvedCategoryId = subjByName[0].category_id || (await getOrCreateCategoryForSubject(resolvedTitle));
    } else {
      resolvedCategoryId = await getOrCreateCategoryForSubject(resolvedTitle);
    }
  }

  let targetCourseId = courseId ? Number(courseId) : null;
  let effectiveInstructorId = instructorId;

  if (targetCourseId) {
    const [[existingC]] = await db.execute('SELECT * FROM courses WHERE id = ?', [targetCourseId]);
    if (!existingC) throw new AppError('Materia del curso no encontrada', 404);
    if (rawInstructorId === undefined) {
      effectiveInstructorId = existingC.instructor_id;
    }
  } else {
    if (!resolvedTitle || resolvedTitle.length < 2) {
      throw new AppError('Seleccioná una materia del catálogo antes de asignarla al cronograma.', 422, 'SUBJECT_REQUIRED');
    }
    const [existingCourse] = await db.execute(
      'SELECT * FROM courses WHERE school_year = ? AND course_division = ? AND (subject_id = ? OR LOWER(title) = LOWER(?)) LIMIT 1',
      [sy, cd, resolvedSubjectId || 0, resolvedTitle]
    );
    if (existingCourse.length > 0) {
      targetCourseId = existingCourse[0].id;
      if (rawInstructorId === undefined) {
        effectiveInstructorId = existingCourse[0].instructor_id;
      }
    }
  }

  // 1. Validar TODOS los bloques horarios solicitados antes de insertar nada
  const validatedBlocks = [];
  for (const slot of normalizedSlots) {
    const validBlock = await validateScheduleBlock({
      schoolYear: sy,
      courseDivision: cd,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      instructorId: effectiveInstructorId,
    });
    validatedBlocks.push({
      ...validBlock,
      classroom: slot.classroom,
    });
  }

  // 2. Si la materia ya existía en el curso y se cambia el profesor, verificar también sus bloques previos
  if (targetCourseId) {
    if (rawInstructorId !== undefined) {
      await validateInstructorForExistingCourseSchedules(targetCourseId, effectiveInstructorId);
    }
    await db.execute(
      `UPDATE courses
       SET instructor_id = ?, subject_id = COALESCE(?, subject_id), status = 'published'
       WHERE id = ?`,
      [effectiveInstructorId, resolvedSubjectId, targetCourseId]
    );
  } else {
    const slug =
      resolvedTitle
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 120) +
      `-${sy}-${cd}-` +
      crypto.randomBytes(2).toString('hex');

    const summary = `${resolvedTitle} • ${sy}° Año - ${cd}° Curso`;
    const [ins] = await db.execute(
      `INSERT INTO courses (instructor_id, category_id, subject_id, school_year, course_division, title, slug, short_description, description,
                            cover_image, level, language, estimated_duration, status, visibility, certificate_enabled, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'beginner', 'Español', 10, 'published', 'public', 1, NOW())`,
      [
        effectiveInstructorId,
        resolvedCategoryId,
        resolvedSubjectId,
        sy,
        cd,
        resolvedTitle,
        slug,
        summary,
        `Espacio académico oficial de ${resolvedTitle} para los alumnos de ${sy}° Año - ${cd}° Curso.`,
        'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=900&q=80',
      ]
    );
    targetCourseId = ins.insertId;
  }

  // 3. Insertar todos los días y horarios validados
  for (const block of validatedBlocks) {
    await db.execute(
      `INSERT INTO course_schedules (course_id, school_year, course_division, day_of_week, start_time, end_time, classroom)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [targetCourseId, sy, cd, block.dayOfWeek, block.startTime, block.endTime, block.classroom]
    );
  }

  await syncCourseGroupEnrollments(targetCourseId, sy, cd);
  await logAudit(req.user.id, 'SCHEDULE_ADDED', 'course', targetCourseId, {
    schoolYear: sy,
    courseDivision: cd,
    subjectId: resolvedSubjectId,
    title: resolvedTitle,
    slotsCount: validatedBlocks.length,
    instructorId: effectiveInstructorId,
  });

  req.query.schoolYear = sy;
  req.query.courseDivision = cd;
  res.status(201);
  return exports.getSchoolSchedule(req, res);
});

/**
 * Permite editar íntegramente una materia asignada a un curso:
 * - Cambiar qué materia es (subjectId del catálogo de la BD o nombre)
 * - Cambiar los días y horarios (ej. pasar de Lunes y Miércoles 07:30-09:30 a Martes y Jueves 09:40-11:40)
 * - Cambiar el profesor asignado (o dejarlo sin profesor / vacante)
 */
exports.updateCourseScheduleInGroup = asyncHandler(async (req, res) => {
  const courseId = Number(req.params.id);
  const [[course]] = await db.execute('SELECT * FROM courses WHERE id = ?', [courseId]);
  if (!course) throw new AppError('Materia del curso no encontrada', 404, 'COURSE_NOT_FOUND');

  const sy = Number(course.school_year) || 1;
  const cd = Number(course.course_division) || 1;

  // Resolver materia (si se envió subjectId o subjectName)
  let nextSubjectId = course.subject_id;
  let nextTitle = course.title;
  let nextCategoryId = course.category_id || 1;

  if (req.body.subjectId !== undefined && req.body.subjectId !== null && req.body.subjectId !== '') {
    const [[subj]] = await db.execute('SELECT * FROM school_subjects WHERE id = ?', [Number(req.body.subjectId)]);
    if (!subj) throw new AppError('La materia seleccionada no existe en la base de datos.', 404, 'SUBJECT_NOT_FOUND');
    nextSubjectId = subj.id;
    nextTitle = subj.name;
    nextCategoryId = subj.category_id || (await getOrCreateCategoryForSubject(nextTitle));
  } else if (req.body.subjectName || req.body.title) {
    nextTitle = String(req.body.subjectName || req.body.title).trim();
    nextCategoryId = await getOrCreateCategoryForSubject(nextTitle);
  }

  // Verificar que al cambiar de materia no choque con otra materia idéntica ya creada en el mismo curso
  const [dupCourse] = await db.execute(
    `SELECT id FROM courses
     WHERE school_year = ? AND course_division = ? AND id <> ?
       AND ((? IS NOT NULL AND subject_id = ?) OR LOWER(title) = LOWER(?))
     LIMIT 1`,
    [sy, cd, courseId, nextSubjectId, nextSubjectId, nextTitle]
  );
  if (dupCourse.length > 0) {
    throw new AppError(
      `El curso ${sy}° Año - ${cd}° Curso ya tiene asignada la materia "${nextTitle}". Editá esa materia directamente.`,
      409,
      'DUPLICATE_COURSE_SUBJECT'
    );
  }

  const nextInstructorId =
    req.body.instructorId !== undefined ? parseNullableInstructorId(req.body.instructorId) : course.instructor_id;

  // Validar los nuevos días y horarios excluyendo los horarios actuales de este mismo courseId
  const normalizedSlots = extractSlotsFromBody(req.body);
  const validatedBlocks = [];

  for (const slot of normalizedSlots) {
    const validBlock = await validateScheduleBlock({
      schoolYear: sy,
      courseDivision: cd,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      instructorId: nextInstructorId,
      excludeCourseId: courseId,
    });
    validatedBlocks.push({
      ...validBlock,
      classroom: slot.classroom,
    });
  }

  // Actualizar datos de la materia en el curso y reemplazar sus bloques horarios
  const summary = `${nextTitle} • ${sy}° Año - ${cd}° Curso`;
  await db.execute(
    `UPDATE courses
     SET subject_id = ?,
         title = ?,
         category_id = ?,
         instructor_id = ?,
         short_description = ?,
         status = 'published'
     WHERE id = ?`,
    [nextSubjectId, nextTitle, nextCategoryId, nextInstructorId, summary, courseId]
  );

  await db.execute('DELETE FROM course_schedules WHERE course_id = ?', [courseId]);

  for (const block of validatedBlocks) {
    await db.execute(
      `INSERT INTO course_schedules (course_id, school_year, course_division, day_of_week, start_time, end_time, classroom)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [courseId, sy, cd, block.dayOfWeek, block.startTime, block.endTime, block.classroom]
    );
  }

  await syncCourseGroupEnrollments(courseId, sy, cd);
  await logAudit(req.user.id, 'COURSE_SCHEDULE_UPDATED', 'course', courseId, {
    schoolYear: sy,
    courseDivision: cd,
    subjectId: nextSubjectId,
    title: nextTitle,
    instructorId: nextInstructorId,
    slots: validatedBlocks,
  });

  req.query.schoolYear = sy;
  req.query.courseDivision = cd;
  return exports.getSchoolSchedule(req, res);
});

exports.deleteCourseFromSchedule = asyncHandler(async (req, res) => {
  const courseId = Number(req.params.id);
  const [[course]] = await db.execute('SELECT * FROM courses WHERE id = ?', [courseId]);
  if (!course) throw new AppError('Materia del curso no encontrada', 404);

  await deleteCourseAndDependencies(courseId);
  await logAudit(req.user.id, 'COURSE_DELETED_FROM_SCHEDULE', 'course', courseId, { title: course.title });
  res.status(204).end();
});

exports.assignCourseInstructor = asyncHandler(async (req, res) => {
  const courseId = Number(req.params.id);
  const [cRows] = await db.execute('SELECT * FROM courses WHERE id = ?', [courseId]);
  if (!cRows.length) throw new AppError('Materia no encontrada', 404);
  const course = cRows[0];

  const instructorId = parseNullableInstructorId(req.body.instructorId);

  // Verificar que el nuevo profesor no tenga superposición horaria con los horarios de esta materia
  await validateInstructorForExistingCourseSchedules(courseId, instructorId);

  await db.execute("UPDATE courses SET instructor_id = ?, status = 'published' WHERE id = ?", [instructorId, courseId]);
  await syncCourseGroupEnrollments(courseId, course.school_year || 1, course.course_division || 1);
  await logAudit(req.user.id, 'COURSE_INSTRUCTOR_ASSIGNED', 'course', courseId, { instructorId });

  req.query.schoolYear = course.school_year || 1;
  req.query.courseDivision = course.course_division || 1;
  return exports.getSchoolSchedule(req, res);
});

exports.deleteScheduleEntry = asyncHandler(async (req, res) => {
  const scheduleId = Number(req.params.id);
  const [rows] = await db.execute('SELECT * FROM course_schedules WHERE id = ?', [scheduleId]);
  if (!rows.length) throw new AppError('Bloque de horario no encontrado', 404);

  await db.execute('DELETE FROM course_schedules WHERE id = ?', [scheduleId]);
  await logAudit(req.user.id, 'SCHEDULE_DELETED', 'course_schedule', scheduleId);
  res.status(204).end();
});

// ============================================================================
// GESTIÓN DE CURSOS / DIVISIONES (ABRIR Y CERRAR CURSOS)
// ============================================================================

exports.listSchoolGroups = asyncHandler(async (req, res) => {
  const [groups] = await db.execute(
    `SELECT sg.id, sg.school_year AS schoolYear, sg.course_division AS courseDivision, sg.status,
            sg.access_code AS accessCode,
            (SELECT COUNT(*) FROM courses c WHERE c.school_year = sg.school_year AND c.course_division = sg.course_division) AS coursesCount,
            (SELECT COUNT(*) FROM users u WHERE u.school_year = sg.school_year AND u.course_division = sg.course_division) AS studentsCount
     FROM school_groups sg
     ORDER BY sg.school_year ASC, sg.course_division ASC`
  );

  res.json({
    success: true,
    data: groups.map((g) => ({
      ...g,
      label: `${g.schoolYear}° ${g.courseDivision}ª`,
      fullLabel: `${g.schoolYear}° Año - ${g.courseDivision}° Curso`,
      isOpen: g.status === 'open',
    })),
  });
});

exports.createSchoolGroup = asyncHandler(async (req, res) => {
  const sy = parseInt(req.body.schoolYear, 10);
  const cd = parseInt(req.body.courseDivision, 10);
  let code = req.body.accessCode ? String(req.body.accessCode).trim().toUpperCase() : '';
  if (!code) {
    code = `${sy}TO${cd}RA`;
  }

  if (!sy || isNaN(sy) || sy < 1) {
    throw new AppError('El año escolar debe ser un número entero mayor o igual a 1 (ej. 1, 6, 7).', 422, 'INVALID_YEAR');
  }
  if (!cd || isNaN(cd) || cd < 1) {
    throw new AppError('La división debe ser un número entero mayor o igual a 1 (ej. 1, 2, 3, 4, 5).', 422, 'INVALID_DIVISION');
  }

  // REQUERIMIENTO ESTRICTO:
  // Antes de crear una división (por ejemplo 7° 4ª), tiene que estar creada antes la división anterior (7° 3ª).
  // No puede estar la división 4 si no está la división 3.
  if (cd > 1) {
    const prevDiv = cd - 1;
    const [prevRows] = await db.execute(
      'SELECT id, status FROM school_groups WHERE school_year = ? AND course_division = ?',
      [sy, prevDiv]
    );
    if (!prevRows.length || prevRows[0].status !== 'open') {
      throw new AppError(
        `Para abrir ${sy}° ${cd}ª, primero debe estar creada y abierta la división anterior (${sy}° ${prevDiv}ª).`,
        400,
        'PREVIOUS_DIVISION_REQUIRED'
      );
    }
  }

  // Verificar si ya existe
  const [existing] = await db.execute(
    'SELECT id, status, access_code FROM school_groups WHERE school_year = ? AND course_division = ?',
    [sy, cd]
  );

  if (existing.length > 0) {
    if (existing[0].status === 'open') {
      throw new AppError(`El curso ${sy}° ${cd}ª ya se encuentra abierto.`, 409, 'COURSE_ALREADY_OPEN');
    }
    // Si estaba cerrado, se reabre y actualiza el código si se proveyó uno nuevo
    const finalCode = code || existing[0].access_code || `${sy}TO${cd}RA`;
    await db.execute("UPDATE school_groups SET status = 'open', access_code = ? WHERE id = ?", [finalCode, existing[0].id]);
    await logAudit(req.user.id, 'SCHOOL_GROUP_REOPENED', 'school_group', existing[0].id, { schoolYear: sy, courseDivision: cd, accessCode: finalCode });
    return res.json({
      success: true,
      message: `El curso ${sy}° ${cd}ª fue reabierto exitosamente con código "${finalCode}".`,
      data: { id: existing[0].id, schoolYear: sy, courseDivision: cd, status: 'open', accessCode: finalCode },
    });
  }

  // Crear nuevo curso/división abierto con su código de acceso
  const [insertRes] = await db.execute(
    "INSERT INTO school_groups (school_year, course_division, status, access_code) VALUES (?, ?, 'open', ?)",
    [sy, cd, code]
  );

  await logAudit(req.user.id, 'SCHOOL_GROUP_CREATED', 'school_group', insertRes.insertId, { schoolYear: sy, courseDivision: cd, accessCode: code });

  res.status(201).json({
    success: true,
    message: `Curso ${sy}° ${cd}ª abierto exitosamente con código "${code}".`,
    data: {
      id: insertRes.insertId,
      schoolYear: sy,
      courseDivision: cd,
      status: 'open',
      accessCode: code,
    },
  });
});

exports.updateSchoolGroupAccessCode = asyncHandler(async (req, res) => {
  const groupId = Number(req.params.id);
  const { accessCode } = req.body;
  if (!accessCode || !String(accessCode).trim()) {
    throw new AppError('El código de acceso no puede estar vacío.', 422, 'INVALID_ACCESS_CODE');
  }
  const cleanCode = String(accessCode).trim().toUpperCase();
  const [[group]] = await db.execute('SELECT * FROM school_groups WHERE id = ?', [groupId]);
  if (!group) throw new AppError('Curso / División no encontrado', 404);

  await db.execute('UPDATE school_groups SET access_code = ? WHERE id = ?', [cleanCode, groupId]);
  await logAudit(req.user.id, 'SCHOOL_GROUP_CODE_UPDATED', 'school_group', groupId, {
    schoolYear: group.school_year,
    courseDivision: group.course_division,
    accessCode: cleanCode,
  });

  res.json({
    success: true,
    message: `Código de acceso del curso ${group.school_year}° ${group.course_division}ª actualizado a "${cleanCode}".`,
    data: { id: groupId, accessCode: cleanCode },
  });
});

exports.toggleSchoolGroupStatus = asyncHandler(async (req, res) => {
  const groupId = Number(req.params.id);
  const [[group]] = await db.execute('SELECT * FROM school_groups WHERE id = ?', [groupId]);
  if (!group) throw new AppError('Curso / División no encontrado', 404);

  const nextStatus = group.status === 'open' ? 'closed' : 'open';

  // Si se va a REABRIR la división D (si D > 1), verificar que la división anterior esté abierta
  if (nextStatus === 'open' && group.course_division > 1) {
    const prevDiv = group.course_division - 1;
    const [prevRows] = await db.execute(
      "SELECT id, status FROM school_groups WHERE school_year = ? AND course_division = ? AND status = 'open'",
      [group.school_year, prevDiv]
    );
    if (!prevRows.length) {
      throw new AppError(
        `Para reabrir ${group.school_year}° ${group.course_division}ª, primero debe estar abierta la división anterior (${group.school_year}° ${prevDiv}ª).`,
        400,
        'PREVIOUS_DIVISION_REQUIRED'
      );
    }
  }

  // 1. Actualizar el estado del curso / división escolar
  await db.execute('UPDATE school_groups SET status = ? WHERE id = ?', [nextStatus, groupId]);

  // 2. Sincronizar el estado de las materias asignadas a este año y división
  if (nextStatus === 'closed') {
    await db.execute(
      "UPDATE courses SET status = 'archived' WHERE school_year = ? AND course_division = ? AND status = 'published'",
      [group.school_year, group.course_division]
    );
  } else {
    await db.execute(
      "UPDATE courses SET status = 'published' WHERE school_year = ? AND course_division = ? AND status = 'archived'",
      [group.school_year, group.course_division]
    );
  }

  await logAudit(req.user.id, `SCHOOL_GROUP_${nextStatus.toUpperCase()}`, 'school_group', groupId, {
    schoolYear: group.school_year,
    courseDivision: group.course_division,
    status: nextStatus,
  });

  res.json({
    success: true,
    message: `Curso ${group.school_year}° ${group.course_division}ª ${nextStatus === 'open' ? 'abierto' : 'cerrado'} exitosamente.`,
    data: {
      ...group,
      status: nextStatus,
      isOpen: nextStatus === 'open',
    },
  });
});

exports.deleteSchoolGroup = asyncHandler(async (req, res) => {
  const groupId = Number(req.params.id);
  const [[group]] = await db.execute('SELECT * FROM school_groups WHERE id = ?', [groupId]);
  if (!group) throw new AppError('Curso / División no encontrado', 404);

  // REQUERIMIENTO: Solo se pueden eliminar cursos cuando están cerrados
  if (group.status !== 'closed') {
    throw new AppError(
      `El curso ${group.school_year}° ${group.course_division}ª debe estar cerrado para poder ser eliminado. Cerralo primero.`,
      400,
      'COURSE_MUST_BE_CLOSED'
    );
  }

  const sy = group.school_year;
  const cd = group.course_division;

  // 1. Desvincular alumnos asignados a este curso/división escolar
  await db.execute(
    'UPDATE users SET school_year = NULL, course_division = NULL WHERE school_year = ? AND course_division = ?',
    [sy, cd]
  );

  // 2. Obtener todas las materias asignadas a este curso y eliminarlas limpiamente con todas sus dependencias
  const [courses] = await db.execute(
    'SELECT id FROM courses WHERE school_year = ? AND course_division = ?',
    [sy, cd]
  );
  for (const c of courses) {
    await deleteCourseAndDependencies(c.id);
  }

  // 3. Eliminar horarios residuales de este año y división
  await db.execute(
    'DELETE FROM course_schedules WHERE school_year = ? AND course_division = ?',
    [sy, cd]
  );

  // 4. Eliminar el registro del curso escolar
  await db.execute('DELETE FROM school_groups WHERE id = ?', [groupId]);

  await logAudit(req.user.id, 'SCHOOL_GROUP_DELETED', 'school_group', groupId, {
    schoolYear: sy,
    courseDivision: cd,
  });

  res.json({
    success: true,
    message: `Curso ${sy}° ${cd}ª eliminado exitosamente.`,
  });
});
