import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import db from '../configuracion/baseDatos';
import { AppError, asyncHandler } from '../utilidades/errores';
import { publicUser } from '../utilidades/serializadores';
import * as tokens from '../utilidades/tokens';
import { logAudit } from '../utilidades/auditoria';
import {
  validateYearAndDivision,
  syncCourseGroupEnrollments,
  validateScheduleBlock,
  validateMultipleSlotsInternal,
  validateInstructorForExistingCourseSchedules,
  getOrCreateCategoryForSubject,
  deleteCourseAndDependencies,
} from '../utilidades/escuela';
import { SolicitudAutenticada } from '../tipos';

// Define la consulta base para obtener un usuario activo con su rol asociado.
const USER_SQL = `
  SELECT u.*, r.name AS role_name
  FROM usuarios u
  JOIN roles r ON r.id = u.role_id
  WHERE u.deleted_at IS NULL`;

// Recupera un usuario por su identificador o lanza un error 404 si no existe.
async function getUserByIdOrFail(id: number | string | string[]): Promise<any> {
  // Ejecuta la consulta filtrando por el identificador del usuario.
  const [rows] = await db.execute<any[]>(`${USER_SQL} AND u.id = ?`, [Number(id)]);
  if (!rows.length) throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  return rows[0];
}

// Obtiene las métricas generales, distribución por roles, cursos destacados y auditoría para el panel de administración.
export const adminDashboard = asyncHandler(async (_req: SolicitudAutenticada, res: Response) => {
  // Consulta los indicadores globales de usuarios, cursos, inscripciones, tareas y certificados.
  const [[metrics]] = await db.execute<any[]>(`
    SELECT
      (SELECT COUNT(*) FROM usuarios WHERE deleted_at IS NULL) AS totalUsers,
      (SELECT COUNT(*) FROM usuarios u JOIN roles r ON r.id = u.role_id WHERE r.name = 'student' AND u.status = 'active' AND u.deleted_at IS NULL) AS activeStudents,
      (SELECT COUNT(*) FROM usuarios u JOIN roles r ON r.id = u.role_id WHERE r.name = 'instructor' AND u.deleted_at IS NULL) AS totalInstructors,
      (SELECT COUNT(*) FROM cursos WHERE status = 'published') AS publishedCourses,
      (SELECT COUNT(*) FROM cursos WHERE status = 'draft') AS draftCourses,
      (SELECT COUNT(*) FROM cursos WHERE status = 'archived') AS archivedCourses,
      (SELECT COUNT(*) FROM grupos_escolares) AS totalSchoolGroups,
      (SELECT COUNT(*) FROM grupos_escolares WHERE status = 'open') AS openSchoolGroups,
      (SELECT COUNT(*) FROM inscripciones) AS totalEnrollments,
      (SELECT COUNT(*) FROM inscripciones WHERE status = 'completed') AS completedEnrollments,
      (SELECT COUNT(*) FROM tareas) AS totalAssignments,
      (SELECT COUNT(*) FROM entregas_tareas WHERE status = 'submitted') AS pendingSubmissions,
      (SELECT COUNT(*) FROM certificados WHERE status = 'valid') AS issuedCertificates
  `);

  // Agrupa la cantidad de usuarios registrados según su rol institucional.
  const [byRole] = await db.execute<any[]>(`
    SELECT r.name AS role, COUNT(u.id) AS count
    FROM roles r
    LEFT JOIN usuarios u ON u.role_id = r.id AND u.deleted_at IS NULL
    GROUP BY r.id, r.name
  `);

  // Obtiene los 6 cursos con mayor cantidad de inscripciones.
  const [topCourses] = await db.execute<any[]>(`
    SELECT c.id, c.title, c.status, c.school_year AS schoolYear, c.course_division AS courseDivision,
           cat.name AS categoryName,
           COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Sin profesor asignado') AS instructorName,
           COUNT(e.id) AS enrollmentsCount,
           SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) AS completedCount
    FROM cursos c
    LEFT JOIN categorias cat ON cat.id = c.category_id
    LEFT JOIN usuarios u ON u.id = c.instructor_id
    LEFT JOIN inscripciones e ON e.course_id = c.id
    GROUP BY c.id, c.title, c.status, c.school_year, c.course_division, cat.name, u.first_name, u.last_name
    ORDER BY enrollmentsCount DESC, c.id ASC
    LIMIT 6
  `);

  // Recupera los últimos 10 eventos registrados en la bitácora de auditoría.
  const [recentAudit] = await db.execute<any[]>(`
    SELECT al.id, al.action, al.entity_type AS entityType, al.entity_id AS entityId, al.created_at AS createdAt,
           CONCAT(u.first_name, ' ', u.last_name) AS actorName
    FROM registros_auditoria al
    LEFT JOIN usuarios u ON u.id = al.actor_user_id
    ORDER BY al.created_at DESC
    LIMIT 10
  `);

  // Consulta la clave vigente de registro para docentes en ajustes_plataforma.
  const [keyRows] = await db.execute<any[]>(
    "SELECT setting_value FROM ajustes_plataforma WHERE setting_key = 'instructor_registration_key' LIMIT 1"
  );
  const instructorRegistrationKey = keyRows[0]?.setting_value || 'DOCENTE2026';

  // Calcula porcentajes y normaliza las estructuras numéricas para el cliente.
  const totalEnr = Number(metrics.totalEnrollments) || 0;
  const compEnr = Number(metrics.completedEnrollments) || 0;
  const pubCourses = Number(metrics.publishedCourses) || 0;
  const drfCourses = Number(metrics.draftCourses) || 0;
  const arcCourses = Number(metrics.archivedCourses) || 0;
  const mappedRoles = byRole.map((r: any) => ({ role: r.role, count: Number(r.count) || 0 }));
  const mappedTopCourses = topCourses.map((c: any) => ({
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
        totalCourses: Number(metrics.totalSchoolGroups) || 0,
        totalSchoolGroups: Number(metrics.totalSchoolGroups) || 0,
        openSchoolGroups: Number(metrics.openSchoolGroups) || 0,
        totalSubjects: pubCourses + drfCourses + arcCourses,
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

// Genera reportes administrativos unificados según el tipo solicitado (usuarios, inscripciones o finalización).
export const reportUnified = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Determina el tipo de reporte a partir de los parámetros de consulta.
  const type = req.query.type || 'completion';
  if (type === 'users') {
    const [rows] = await db.execute<any[]>(`
      SELECT r.name AS role, u.status, COUNT(u.id) AS totalUsers,
             SUM(CASE WHEN u.email_verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verifiedUsers,
             SUM(CASE WHEN u.two_factor_enabled = 1 THEN 1 ELSE 0 END) AS twoFactorUsers
      FROM usuarios u
      JOIN roles r ON r.id = u.role_id
      WHERE u.deleted_at IS NULL
      GROUP BY r.name, u.status
    `);
    return res.json({ success: true, data: { type, rows } });
  }
  if (type === 'enrollments') {
    const [rows] = await db.execute<any[]>(`
      SELECT e.id AS enrollmentId, e.status, e.enrolled_at AS enrolledAt,
             c.title AS courseTitle,
             CONCAT(u.first_name, ' ', u.last_name) AS studentName,
             u.email AS studentEmail,
             (SELECT COUNT(*) FROM lecciones l JOIN modulos m ON m.id = l.module_id WHERE m.course_id = c.id AND l.is_required = 1) AS totalReq,
             (SELECT COUNT(*) FROM progreso_lecciones lp JOIN lecciones l ON l.id = lp.lesson_id WHERE lp.enrollment_id = e.id AND lp.status = 'completed' AND l.is_required = 1) AS doneReq
      FROM inscripciones e
      JOIN cursos c ON c.id = e.course_id
      JOIN usuarios u ON u.id = e.student_id
      ORDER BY e.enrolled_at DESC
    `);
    return res.json({
      success: true,
      data: {
        type,
        rows: rows.map((r: any) => ({
          ...r,
          progressPercent: Number(r.totalReq) > 0 ? Math.min(100, Math.round((Number(r.doneReq) / Number(r.totalReq)) * 100)) : 0,
        })),
      },
    });
  }

  // Genera por defecto el reporte de finalización y promedio de calificaciones por materia.
  const [rows] = await db.execute<any[]>(`
    SELECT c.id AS courseId, c.title AS courseTitle, cat.name AS categoryName,
           COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Sin profesor asignado') AS instructorName,
           COUNT(e.id) AS totalEnrolled,
           SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) AS completedCount,
           (SELECT AVG(att.score) FROM entregas_tareas att JOIN tareas a ON a.id = att.assignment_id
            WHERE a.course_id = c.id AND att.status = 'graded') AS averageGrade
    FROM cursos c
    LEFT JOIN categorias cat ON cat.id = c.category_id
    LEFT JOIN usuarios u ON u.id = c.instructor_id
    LEFT JOIN inscripciones e ON e.course_id = c.id
    GROUP BY c.id, c.title, cat.name, u.first_name, u.last_name
  `);
  return res.json({
    success: true,
    data: {
      type: 'completion',
      rows: rows.map((r: any) => {
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

// Genera un reporte estadístico de usuarios agrupados por rol y estado de cuenta.
export const reportUsers = asyncHandler(async (_req: SolicitudAutenticada, res: Response) => {
  // Consulta las cantidades de usuarios activos y suspendidos por rol.
  const [byRole] = await db.execute<any[]>(`
    SELECT r.name AS role, COUNT(u.id) AS total,
           SUM(CASE WHEN u.status = 'active' THEN 1 ELSE 0 END) AS activeCount,
           SUM(CASE WHEN u.status = 'suspended' THEN 1 ELSE 0 END) AS suspendedCount
    FROM roles r
    LEFT JOIN usuarios u ON u.role_id = r.id AND u.deleted_at IS NULL
    GROUP BY r.id, r.name
  `);
  res.json({ success: true, data: byRole });
});

// Genera un reporte detallado de todos los cursos con conteo de módulos, lecciones e inscriptos.
export const reportCourses = asyncHandler(async (_req: SolicitudAutenticada, res: Response) => {
  // Ejecuta la consulta sobre la tabla cursos y sus relaciones académicas.
  const [rows] = await db.execute<any[]>(`
    SELECT c.id, c.title, c.status, c.level, cat.name AS categoryName,
           COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Sin profesor asignado') AS instructorName,
           (SELECT COUNT(*) FROM modulos m WHERE m.course_id = c.id) AS modulesCount,
           (SELECT COUNT(*) FROM lecciones l JOIN modulos m ON m.id = l.module_id WHERE m.course_id = c.id) AS lessonsCount,
           (SELECT COUNT(*) FROM inscripciones e WHERE e.course_id = c.id) AS enrollmentsCount
    FROM cursos c
    LEFT JOIN categorias cat ON cat.id = c.category_id
    LEFT JOIN usuarios u ON u.id = c.instructor_id
    ORDER BY enrollmentsCount DESC
  `);
  res.json({ success: true, data: rows });
});

// Genera un reporte de inscripciones activas y completadas por cada curso.
export const reportEnrollments = asyncHandler(async (_req: SolicitudAutenticada, res: Response) => {
  // Agrupa las inscripciones por curso y estado de avance.
  const [rows] = await db.execute<any[]>(`
    SELECT c.id AS courseId, c.title AS courseTitle,
           COUNT(e.id) AS totalEnrollments,
           SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) AS activeEnrollments,
           SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) AS completedEnrollments
    FROM cursos c
    LEFT JOIN inscripciones e ON e.course_id = c.id
    GROUP BY c.id, c.title
    ORDER BY totalEnrollments DESC
  `);
  res.json({ success: true, data: rows });
});

// Genera un reporte de tasa de finalización y promedio de notas por curso.
export const reportCompletion = asyncHandler(async (_req: SolicitudAutenticada, res: Response) => {
  // Consulta los totales de inscriptos, graduados y promedio de calificaciones en entregas_tareas.
  const [rows] = await db.execute<any[]>(`
    SELECT c.id AS courseId, c.title AS courseTitle,
           COUNT(e.id) AS enrolled,
           SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) AS completed,
           (SELECT AVG(att.score) FROM entregas_tareas att JOIN tareas a ON a.id = att.assignment_id
            WHERE a.course_id = c.id AND att.status = 'graded') AS averageGrade
    FROM cursos c
    LEFT JOIN inscripciones e ON e.course_id = c.id
    GROUP BY c.id, c.title
  `);
  res.json({
    success: true,
    data: rows.map((r: any) => {
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

// Lista los registros recientes de la bitácora de auditoría del sistema.
export const listAuditLogs = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Limita la cantidad de registros devueltos entre 1 y 100.
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '40'), 10) || 40, 1), 100);
  const [rows] = await db.query<any[]>(
    `SELECT al.id, al.actor_user_id AS actorUserId, al.action, al.entity_type AS entityType,
            al.entity_id AS entityId, al.metadata, al.created_at AS createdAt,
            CONCAT(u.first_name, ' ', u.last_name) AS actorName, u.email AS actorEmail
     FROM registros_auditoria al
     LEFT JOIN usuarios u ON u.id = al.actor_user_id
     ORDER BY al.created_at DESC
     LIMIT ${limit}`
  );
  res.json({ success: true, data: rows });
});

// Lista todos los usuarios registrados permitiendo filtrar por rol, estado o texto de búsqueda.
export const listUsers = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Construye las condiciones de filtrado dinámico según los parámetros de consulta.
  const { q, role, status } = req.query;
  const where = ['u.deleted_at IS NULL'];
  const params: any[] = [];

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

  // Ejecuta la búsqueda en la tabla usuarios y serializa los resultados.
  const [rows] = await db.execute<any[]>(
    `SELECT u.*, r.name AS role_name
     FROM usuarios u
     JOIN roles r ON r.id = u.role_id
     WHERE ${where.join(' AND ')}
     ORDER BY u.created_at DESC`,
    params
  );

  const list = rows.map(publicUser);
  res.json({ success: true, data: list });
});

// Obtiene el detalle de un usuario específico por su identificador.
export const getUser = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Busca al usuario y devuelve su representación pública.
  const u = await getUserByIdOrFail(req.params.id);
  const serialized = publicUser(u);
  res.json({ success: true, data: serialized, ...serialized });
});

// Permite al administrador crear una nueva cuenta de usuario ya verificada.
export const createUser = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Valida que el correo no esté duplicado y que el rol exista.
  const { firstName, lastName, email, password, role = 'student' } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();
  const [exists] = await db.execute<any[]>('SELECT id FROM usuarios WHERE email = ?', [normalizedEmail]);
  if (exists.length) throw new AppError('El correo electrónico ya está registrado', 409);

  const [roleRows] = await db.execute<any[]>('SELECT id FROM roles WHERE name = ?', [role]);
  if (!roleRows.length) throw new AppError('Rol inválido', 400);

  // Encripta la contraseña e inserta el usuario con el indicador created_by_admin activado.
  const hash = await bcrypt.hash(password, 10);
  const [ins] = await db.execute<any>(
    `INSERT INTO usuarios (first_name, last_name, email, password_hash, role_id, status, created_by_admin, email_verified_at)
     VALUES (?, ?, ?, ?, ?, 'active', 1, NOW())`,
    [firstName.trim(), (lastName || 'Campus').trim(), normalizedEmail, hash, roleRows[0].id]
  );

  await logAudit(req.user!.id, 'ADMIN_USER_CREATED', 'user', ins.insertId, { role, email: normalizedEmail });
  const created = publicUser(await getUserByIdOrFail(ins.insertId));
  res.status(201).json({ success: true, data: created, ...created });
});

// Actualiza los datos, rol o estado de un usuario desde el panel de administración.
export const updateUser = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Recupera el usuario objetivo y verifica si fue creado por el administrador.
  const target = await getUserByIdOrFail(req.params.id);
  const { firstName, lastName, email, password, role, status, bio } = req.body;

  // Restringe la edición de datos privados si el usuario se registró por su propia cuenta.
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

  const sets: string[] = [];
  const vals: any[] = [];

  // Permite actualizar credenciales y datos personales únicamente en cuentas creadas por administración.
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
        const [dup] = await db.execute<any[]>('SELECT id FROM usuarios WHERE email = ? AND id <> ?', [cleanEmail, target.id]);
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

  // Actualiza el rol institucional impidiendo que el administrador se quite su propio rol.
  if (role !== undefined && String(role).trim()) {
    if (Number(target.id) === Number(req.user!.id)) {
      throw new AppError('Por seguridad no podés modificar tu propio rol de administrador', 400, 'SELF_ROLE_CHANGE');
    }
    const [roleRows] = await db.execute<any[]>('SELECT id FROM roles WHERE name = ?', [String(role).trim()]);
    if (!roleRows.length) throw new AppError('Rol inválido', 400);
    sets.push('role_id = ?');
    vals.push(roleRows[0].id);
  }

  // Actualiza el estado de la cuenta y revoca sesiones si pasa a estado suspendido.
  if (status !== undefined && String(status).trim()) {
    const cleanStatus = String(status).trim().toLowerCase();
    if (!['active', 'suspended'].includes(cleanStatus)) {
      throw new AppError("Estado inválido. Debe ser 'active' o 'suspended'.", 400);
    }
    if (Number(target.id) === Number(req.user!.id) && cleanStatus === 'suspended') {
      throw new AppError('No podés suspender tu propia cuenta administrativa', 400, 'SELF_STATUS_CHANGE');
    }
    sets.push('status = ?');
    vals.push(cleanStatus);
    if (cleanStatus === 'suspended') {
      await tokens.revokeAllForUser(target.id);
    }
  }

  if (sets.length > 0) {
    await db.execute(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = ?`, [...vals, target.id]);
  }

  await logAudit(req.user!.id, 'ADMIN_USER_UPDATED', 'user', target.id, { role, status });
  const updated = publicUser(await getUserByIdOrFail(target.id));
  res.json({ success: true, data: updated, ...updated });
});

// Cambia exclusivamente el rol institucional de un usuario.
export const setUserRole = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Verifica que el administrador no esté modificando su propio rol.
  const target = await getUserByIdOrFail(req.params.id);
  if (Number(target.id) === Number(req.user!.id)) {
    throw new AppError('Por seguridad no podés modificar tu propio rol de administrador', 400, 'SELF_ROLE_CHANGE');
  }
  const { role } = req.body;
  const [roleRows] = await db.execute<any[]>('SELECT id FROM roles WHERE name = ?', [role]);
  if (!roleRows.length) throw new AppError('Rol no válido', 400);

  // Actualiza el rol en la tabla usuarios y registra la acción en auditoría.
  await db.execute('UPDATE usuarios SET role_id = ? WHERE id = ?', [roleRows[0].id, target.id]);
  await logAudit(req.user!.id, 'USER_ROLE_CHANGED', 'user', target.id, { newRole: role });

  const updated = publicUser(await getUserByIdOrFail(target.id));
  res.json({ success: true, data: updated, ...updated });
});

// Cambia el estado de activación o suspensión de una cuenta de usuario.
export const setUserStatus = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Impide que el administrador suspenda su propia cuenta.
  const target = await getUserByIdOrFail(req.params.id);
  if (Number(target.id) === Number(req.user!.id)) {
    throw new AppError('No podés suspender tu propia cuenta administrativa', 400, 'SELF_STATUS_CHANGE');
  }

  let newStatus = req.body.status;
  if (!newStatus && req.body.isActive !== undefined) {
    newStatus = req.body.isActive ? 'active' : 'suspended';
  }
  if (!['active', 'suspended', 'pending_verification'].includes(newStatus)) {
    throw new AppError('Estado inválido', 400);
  }

  // Actualiza el estado en la tabla usuarios y revoca tokens si fue suspendido.
  await db.execute('UPDATE usuarios SET status = ? WHERE id = ?', [newStatus, target.id]);
  if (newStatus === 'suspended') {
    await tokens.revokeAllForUser(target.id);
  }
  await logAudit(req.user!.id, 'USER_STATUS_CHANGED', 'user', target.id, { newStatus });

  const updated = publicUser(await getUserByIdOrFail(target.id));
  res.json({ success: true, data: updated, ...updated });
});

// Elimina una cuenta de usuario creada por el administrador.
export const deleteUser = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Verifica que no sea la propia cuenta del administrador y que haya sido creada por administración.
  const target = await getUserByIdOrFail(req.params.id);
  if (Number(target.id) === Number(req.user!.id)) {
    throw new AppError('No podés eliminar tu propia cuenta administrativa', 400);
  }
  if (!target.created_by_admin) {
    throw new AppError(
      'Solo se pueden eliminar los usuarios que hayan sido creados por el administrador.',
      403,
      'NOT_CREATED_BY_ADMIN'
    );
  }

  // Revoca sesiones, desvincula cursos dictados y elimina el registro de usuarios.
  await tokens.revokeAllForUser(target.id);
  await db.execute('UPDATE cursos SET instructor_id = NULL WHERE instructor_id = ?', [target.id]);
  await db.execute('DELETE FROM usuarios WHERE id = ?', [target.id]);
  res.status(204).end();
});

// Crea una nueva categoría académica en el catálogo.
export const createCategory = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Inserta la categoría en la tabla categorias y registra el evento en auditoría.
  const { name, description = '', status = 'active' } = req.body;
  const [ins] = await db.execute<any>('INSERT INTO categorias (name, description, status) VALUES (?, ?, ?)', [
    name.trim(),
    description.trim(),
    status,
  ]);
  await logAudit(req.user!.id, 'CATEGORY_CREATED', 'category', ins.insertId, { name });
  res.status(201).json({ success: true, data: { id: ins.insertId, name: name.trim(), description: description.trim(), status } });
});

// Actualiza los datos de una categoría existente por su identificador.
export const updateCategory = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Modifica los campos provistos en la tabla categorias.
  const { name, description, status } = req.body;
  await db.execute(
    'UPDATE categorias SET name = COALESCE(?, name), description = COALESCE(?, description), status = COALESCE(?, status) WHERE id = ?',
    [name ? name.trim() : null, description !== undefined ? description.trim() : null, status || null, req.params.id]
  );
  await logAudit(req.user!.id, 'CATEGORY_UPDATED', 'category', Number(req.params.id));
  const [[updated]] = await db.execute<any[]>('SELECT * FROM categorias WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: updated });
});

// Elimina una categoría si no tiene cursos asociados.
export const deleteCategory = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Comprueba que ningún curso dependa de esta categoría antes de borrarla.
  const [[{ count }]] = await db.execute<any[]>('SELECT COUNT(*) AS count FROM cursos WHERE category_id = ?', [req.params.id]);
  if (Number(count) > 0) {
    throw new AppError('No se puede eliminar una categoría con cursos asociados. Desactivala en su lugar.', 409);
  }
  await db.execute('DELETE FROM categorias WHERE id = ?', [req.params.id]);
  await logAudit(req.user!.id, 'CATEGORY_DELETED', 'category', Number(req.params.id));
  res.status(204).end();
});

// Crea una nueva habilidad o competencia en el catálogo.
export const createSkill = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Inserta la habilidad en la tabla habilidades.
  const { name, description = '', categoryId = null } = req.body;
  const [ins] = await db.execute<any>('INSERT INTO habilidades (name, description, category_id) VALUES (?, ?, ?)', [
    name.trim(),
    description.trim(),
    categoryId ? Number(categoryId) : null,
  ]);
  await logAudit(req.user!.id, 'SKILL_CREATED', 'skill', ins.insertId, { name });
  res.status(201).json({
    success: true,
    data: { id: ins.insertId, name: name.trim(), description: description.trim(), categoryId: categoryId ? Number(categoryId) : null },
  });
});

// Actualiza una habilidad existente en el catálogo.
export const updateSkill = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Modifica el registro en la tabla habilidades y devuelve el objeto actualizado.
  const { name, description, categoryId } = req.body;
  await db.execute(
    'UPDATE habilidades SET name = COALESCE(?, name), description = COALESCE(?, description), category_id = COALESCE(?, category_id) WHERE id = ?',
    [name ? name.trim() : null, description !== undefined ? description.trim() : null, categoryId ? Number(categoryId) : null, req.params.id]
  );
  const [[updated]] = await db.execute<any[]>('SELECT id, name, description, category_id AS categoryId FROM habilidades WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: updated });
});

// Elimina una habilidad del catálogo por su identificador.
export const deleteSkill = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Borra el registro de la tabla habilidades.
  await db.execute('DELETE FROM habilidades WHERE id = ?', [req.params.id]);
  await logAudit(req.user!.id, 'SKILL_DELETED', 'skill', Number(req.params.id));
  res.status(204).end();
});

// Obtiene todos los parámetros de configuración institucional de la plataforma.
export const getSettings = asyncHandler(async (_req: SolicitudAutenticada, res: Response) => {
  // Consulta los pares clave-valor de la tabla ajustes_plataforma.
  const [rows] = await db.execute<any[]>('SELECT setting_key AS k, setting_value AS v FROM ajustes_plataforma');
  const out: Record<string, any> = {};
  rows.forEach((r: any) => {
    out[r.k] = r.v;
  });
  res.json({ success: true, data: out });
});

// Actualiza los parámetros de configuración institucional y las claves de registro de docentes y preceptores.
export const updateSettings = asyncHandler(async (req: SolicitudAutenticada, res: Response, next) => {
  // Define la lista de claves de configuración permitidas.
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

  // Valida que las claves de docente y preceptor no estén vacías si fueron enviadas.
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

  // Guarda cada parámetro en ajustes_plataforma convirtiendo las claves de acceso a mayúsculas.
  for (const key of allowedKeys) {
    if (req.body[key] !== undefined) {
      let val = String(req.body[key]).trim();
      if (key === 'instructor_registration_key' || key === 'preceptor_registration_key') {
        val = val.toUpperCase();
      }
      await db.execute(
        `INSERT INTO ajustes_plataforma (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, val]
      );
    }
  }
  await logAudit(req.user!.id, 'SETTINGS_UPDATED', 'system', 1);
  return getSettings(req, res, next);
});

// Lista las últimas 50 notificaciones dirigidas al usuario autenticado.
export const listNotifications = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Consulta la tabla notificaciones ordenada desde la más reciente.
  const [rows] = await db.execute<any[]>(
    `SELECT id, type, title, body, resource_type AS resourceType, resource_id AS resourceId,
            read_at AS readAt, created_at AS createdAt
     FROM notificaciones
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [req.user!.id]
  );
  res.json({
    success: true,
    data: rows.map((n: any) => ({ ...n, isRead: !!n.readAt })),
  });
});

// Marca una notificación específica como leída.
export const markNotificationRead = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Actualiza la fecha de lectura en la tabla notificaciones.
  await db.execute('UPDATE notificaciones SET read_at = COALESCE(read_at, NOW()) WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user!.id,
  ]);
  res.json({ success: true, message: 'Notificación marcada como leída' });
});

// Marca todas las notificaciones pendientes del usuario como leídas.
export const markAllNotificationsRead = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Actualiza todas las filas no leídas del usuario en la tabla notificaciones.
  await db.execute('UPDATE notificaciones SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [req.user!.id]);
  res.json({ success: true, message: 'Todas las notificaciones fueron marcadas como leídas' });
});

// Obtiene el detalle de un certificado académico emitido por su identificador.
export const getCertificate = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Consulta los datos del certificado, curso, alumno e instructor en la tabla certificados.
  const [rows] = await db.execute<any[]>(
    `SELECT cert.id, cert.verification_code AS verificationCode, cert.issued_at AS issuedAt, cert.status,
            e.student_id AS studentId, c.id AS courseId, c.title AS courseTitle,
            c.estimated_duration AS estimatedDuration, c.level,
            CONCAT(stu.first_name, ' ', stu.last_name) AS studentName,
            COALESCE(CONCAT(inst.first_name, ' ', inst.last_name), 'Dirección Académica') AS instructorName
     FROM certificados cert
     JOIN inscripciones e ON e.id = cert.enrollment_id
     JOIN cursos c ON c.id = e.course_id
     JOIN usuarios stu ON stu.id = e.student_id
     LEFT JOIN usuarios inst ON inst.id = c.instructor_id
     WHERE cert.id = ?`,
    [req.params.id]
  );
  if (!rows.length) throw new AppError('Certificado no encontrado', 404);
  const cert = rows[0];

  // Verifica que un estudiante solo pueda consultar sus propios certificados.
  if (req.user!.role === 'student' && Number(cert.studentId) !== Number(req.user!.id)) {
    throw new AppError('No tenés permiso para consultar este certificado privado', 403);
  }
  res.json({ success: true, data: cert });
});

// Verifica públicamente la autenticidad de un certificado mediante su código único.
export const verifyCertificatePublic = asyncHandler(async (req: Request, res: Response) => {
  // Busca el certificado por su código de verificación en la tabla certificados.
  const code = String(req.params.code || '').trim();
  const [rows] = await db.execute<any[]>(
    `SELECT cert.verification_code AS verificationCode, cert.issued_at AS issuedAt, cert.status,
            c.title AS courseTitle, c.estimated_duration AS estimatedDuration, c.level,
            CONCAT(stu.first_name, ' ', stu.last_name) AS studentName,
            COALESCE(CONCAT(inst.first_name, ' ', inst.last_name), 'Dirección Académica') AS instructorName
     FROM certificados cert
     JOIN inscripciones e ON e.id = cert.enrollment_id
     JOIN cursos c ON c.id = e.course_id
     JOIN usuarios stu ON stu.id = e.student_id
     LEFT JOIN usuarios inst ON inst.id = c.instructor_id
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

// Lista todas las materias registradas en el catálogo escolar oficial.
export const listSubjects = asyncHandler(async (_req: SolicitudAutenticada, res: Response) => {
  // Consulta las materias en materias_escolares junto con su categoría y cantidad de cursos asociados.
  const [rows] = await db.execute<any[]>(
    `SELECT s.id, s.name, s.description, s.category_id AS categoryId,
            COALESCE(cat.name, 'General') AS categoryName,
            (SELECT COUNT(*) FROM cursos c WHERE c.subject_id = s.id OR LOWER(c.title) = LOWER(s.name)) AS coursesCount,
            s.created_at AS createdAt
     FROM materias_escolares s
     LEFT JOIN categorias cat ON cat.id = s.category_id
     ORDER BY s.name ASC`
  );
  res.json({ success: true, data: rows });
});

// Crea una nueva materia en el catálogo escolar evitando duplicados y sincronizando su categoría.
export const createSubject = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Valida que el nombre de la materia tenga al menos 2 caracteres (las materias solo llevan nombre, sin descripción).
  const name = String(req.body.name || req.body.title || '').trim();

  if (!name || name.length < 2) {
    throw new AppError('El nombre de la materia es obligatorio (mínimo 2 caracteres).', 422, 'SUBJECT_NAME_REQUIRED');
  }

  // Comprueba que no exista otra materia con el mismo nombre en materias_escolares.
  const [existing] = await db.execute<any[]>('SELECT id, name FROM materias_escolares WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1', [name]);
  if (existing.length > 0) {
    throw new AppError(`Ya existe una materia registrada con el nombre "${name}". No se permiten materias duplicadas.`, 409, 'SUBJECT_ALREADY_EXISTS');
  }

  // Obtiene o crea la categoría homónima e inserta la materia en materias_escolares únicamente con su nombre.
  const categoryId = await getOrCreateCategoryForSubject(name);
  const [ins] = await db.execute<any>(
    'INSERT INTO materias_escolares (name, description, category_id) VALUES (?, NULL, ?)',
    [name, categoryId]
  );

  // Vincula los cursos existentes que compartan el mismo título.
  await db.execute(
    'UPDATE cursos SET subject_id = ?, category_id = ? WHERE LOWER(TRIM(title)) = LOWER(TRIM(?))',
    [ins.insertId, categoryId, name]
  );

  await logAudit(req.user!.id, 'SCHOOL_SUBJECT_CREATED', 'school_subject', ins.insertId, { name, categoryId });

  const [[created]] = await db.execute<any[]>(
    `SELECT s.id, s.name, s.description, s.category_id AS categoryId,
            COALESCE(cat.name, s.name) AS categoryName
     FROM materias_escolares s
     LEFT JOIN categorias cat ON cat.id = s.category_id
     WHERE s.id = ?`,
    [ins.insertId]
  );

  res.status(201).json({ success: true, data: created });
});

// Actualiza el nombre de una materia del catálogo y propaga el cambio a los cursos asociados.
export const updateSubject = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Busca la materia por su identificador en materias_escolares.
  const subjectId = Number(req.params.id);
  const [[subject]] = await db.execute<any[]>('SELECT * FROM materias_escolares WHERE id = ?', [subjectId]);
  if (!subject) throw new AppError('Materia no encontrada en la base de datos.', 404, 'SUBJECT_NOT_FOUND');

  const name = req.body.name !== undefined ? String(req.body.name).trim() : subject.name;

  if (!name || name.length < 2) {
    throw new AppError('El nombre de la materia es obligatorio (mínimo 2 caracteres).', 422, 'SUBJECT_NAME_REQUIRED');
  }

  // Verifica que el nuevo nombre no colisione con otra materia existente.
  const [dup] = await db.execute<any[]>(
    'SELECT id FROM materias_escolares WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id <> ? LIMIT 1',
    [name, subjectId]
  );
  if (dup.length > 0) {
    throw new AppError(`Ya existe otra materia registrada con el nombre "${name}". No se permiten materias duplicadas.`, 409, 'SUBJECT_ALREADY_EXISTS');
  }

  const categoryId = await getOrCreateCategoryForSubject(name);

  // Actualiza el nombre de la materia dejando la descripción nula y sincroniza el título en los cursos donde se dicta.
  await db.execute(
    'UPDATE materias_escolares SET name = ?, description = NULL, category_id = ? WHERE id = ?',
    [name, categoryId, subjectId]
  );

  await db.execute(
    `UPDATE cursos
     SET title = ?,
         category_id = ?,
         short_description = CONCAT(?, ' • ', school_year, '° Año - ', course_division, '° Curso')
     WHERE subject_id = ?`,
    [name, categoryId, name, subjectId]
  );

  await logAudit(req.user!.id, 'SCHOOL_SUBJECT_UPDATED', 'school_subject', subjectId, { name, categoryId });

  const [[updated]] = await db.execute<any[]>(
    `SELECT s.id, s.name, s.description, s.category_id AS categoryId,
            COALESCE(cat.name, s.name) AS categoryName
     FROM materias_escolares s
     LEFT JOIN categorias cat ON cat.id = s.category_id
     WHERE s.id = ?`,
    [subjectId]
  );

  res.json({ success: true, data: updated });
});

// Elimina una materia del catálogo escolar por su identificador.
export const deleteSubject = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Comprueba que la materia exista y la elimina de materias_escolares.
  const subjectId = Number(req.params.id);
  const [[subject]] = await db.execute<any[]>('SELECT * FROM materias_escolares WHERE id = ?', [subjectId]);
  if (!subject) throw new AppError('Materia no encontrada en la base de datos.', 404, 'SUBJECT_NOT_FOUND');

  await db.execute('DELETE FROM materias_escolares WHERE id = ?', [subjectId]);
  await logAudit(req.user!.id, 'SCHOOL_SUBJECT_DELETED', 'school_subject', subjectId, { name: subject.name });
  res.status(204).end();
});

// Extrae y valida la lista de bloques horarios enviados en el cuerpo de una petición.
function extractSlotsFromBody(body: any) {
  // Soporta arreglos de bloques directos, arreglos de días o un único día y horario.
  if (Array.isArray(body.slots) && body.slots.length > 0) {
    return validateMultipleSlotsInternal(body.slots);
  }
  if (Array.isArray(body.days) && body.days.length > 0) {
    const rawSlots = body.days.map((day: any) => ({
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

// Normaliza el identificador de un docente permitiendo valores nulos cuando la materia queda sin profesor asignado.
function parseNullableInstructorId(rawInstructorId: any): number | null {
  // Devuelve null si el valor está vacío, es nulo o cero.
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

// Obtiene el cronograma escolar completo incluyendo catálogo de materias, docentes, cursos, horarios y grupos.
export const getSchoolSchedule = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Lee los filtros opcionales de año escolar y división.
  const sy = req.query.schoolYear ? Number(req.query.schoolYear) : null;
  const cd = req.query.courseDivision ? Number(req.query.courseDivision) : null;

  // Consulta el catálogo de materias y la nómina de docentes activos.
  const [subjectsCatalog] = await db.execute<any[]>(
    `SELECT s.id, s.name, s.description, s.category_id AS categoryId,
            COALESCE(cat.name, 'General') AS categoryName,
            (SELECT COUNT(*) FROM cursos c WHERE c.subject_id = s.id OR LOWER(c.title) = LOWER(s.name)) AS coursesCount
     FROM materias_escolares s
     LEFT JOIN categorias cat ON cat.id = s.category_id
     ORDER BY s.name ASC`
  );

  const [instructors] = await db.execute<any[]>(
    `SELECT u.id, u.first_name AS firstName, u.last_name AS lastName,
            CONCAT(u.first_name, ' ', u.last_name) AS name, u.email
     FROM usuarios u
     JOIN roles r ON r.id = u.role_id
     WHERE r.name = 'instructor' AND u.status = 'active' AND u.deleted_at IS NULL
     ORDER BY u.first_name ASC, u.last_name ASC`
  );

  // Construye las condiciones de filtrado para consultar las materias asignadas a los cursos.
  const courseWhere: string[] = [];
  const courseParams: any[] = [];
  if (sy) {
    courseWhere.push('c.school_year = ?');
    courseParams.push(sy);
  }
  if (cd) {
    courseWhere.push('c.course_division = ?');
    courseParams.push(cd);
  }
  const courseClause = courseWhere.length ? `WHERE ${courseWhere.join(' AND ')}` : '';

  const [courses] = await db.execute<any[]>(
    `SELECT c.id, c.subject_id AS subjectId, c.title, c.short_description AS summary, c.description,
            c.category_id AS categoryId, c.school_year AS schoolYear, c.course_division AS courseDivision,
            c.instructor_id AS instructorId, c.status, c.theme_color AS themeColor,
            cat.name AS categoryName,
            COALESCE(CONCAT(inst.first_name, ' ', inst.last_name), 'Sin profesor asignado') AS instructorName,
            (SELECT COUNT(*) FROM inscripciones e WHERE e.course_id = c.id) AS studentsCount,
            (SELECT COUNT(*) FROM modulos m WHERE m.course_id = c.id) AS modulesCount,
            (SELECT COUNT(*) FROM tareas a WHERE a.course_id = c.id) AS assignmentsCount
     FROM cursos c
     LEFT JOIN categorias cat ON cat.id = c.category_id
     LEFT JOIN usuarios inst ON inst.id = c.instructor_id
     ${courseClause}
     ORDER BY c.school_year ASC, c.course_division ASC, c.title ASC`,
    courseParams
  );

  // Consulta los bloques horarios registrados en horarios_curso.
  const schedWhere: string[] = [];
  const schedParams: any[] = [];
  if (sy) {
    schedWhere.push('cs.school_year = ?');
    schedParams.push(sy);
  }
  if (cd) {
    schedWhere.push('cs.course_division = ?');
    schedParams.push(cd);
  }
  const schedClause = schedWhere.length ? `WHERE ${schedWhere.join(' AND ')}` : '';

  const [schedule] = await db.execute<any[]>(
    `SELECT cs.id, cs.course_id AS courseId, cs.school_year AS schoolYear,
            cs.course_division AS courseDivision, cs.day_of_week AS dayOfWeek,
            cs.start_time AS startTime, cs.end_time AS endTime, cs.classroom,
            c.subject_id AS subjectId, c.title AS courseTitle, c.instructor_id AS instructorId,
            cat.name AS categoryName,
            COALESCE(CONCAT(inst.first_name, ' ', inst.last_name), 'Sin profesor asignado') AS instructorName
     FROM horarios_curso cs
     JOIN cursos c ON c.id = cs.course_id
     LEFT JOIN categorias cat ON cat.id = c.category_id
     LEFT JOIN usuarios inst ON inst.id = c.instructor_id
     ${schedClause}
     ORDER BY cs.school_year ASC, cs.course_division ASC,
              FIELD(cs.day_of_week, 'Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'),
              cs.start_time ASC`,
    schedParams
  );

  // Combina cada curso con sus horarios y consulta la lista de divisiones en grupos_escolares.
  const enrichedCourses = courses.map((c: any) => ({
    ...c,
    schoolYear: Number(c.schoolYear) || 1,
    courseDivision: Number(c.courseDivision) || 1,
    schoolGroupLabel: `${Number(c.schoolYear) || 1}° Año - ${Number(c.courseDivision) || 1}° Curso`,
    schedules: schedule.filter((s: any) => Number(s.courseId) === Number(c.id)),
  }));

  const [schoolGroups] = await db.execute<any[]>(
    `SELECT sg.id, sg.school_year AS schoolYear, sg.course_division AS courseDivision, sg.status,
            sg.access_code AS accessCode,
            (SELECT COUNT(*) FROM cursos c WHERE c.school_year = sg.school_year AND c.course_division = sg.course_division) AS coursesCount,
            (SELECT COUNT(*) FROM usuarios u WHERE u.school_year = sg.school_year AND u.course_division = sg.course_division) AS studentsCount
     FROM grupos_escolares sg
     ORDER BY sg.school_year ASC, sg.course_division ASC`
  );

  res.json({
    success: true,
    data: {
      subjectsCatalog,
      instructors,
      courses: enrichedCourses,
      schedule,
      schoolGroups: schoolGroups.map((g: any) => ({
        ...g,
        label: `${g.schoolYear}° ${g.courseDivision}ª`,
        fullLabel: `${g.schoolYear}° Año - ${g.courseDivision}° Curso`,
        isOpen: g.status === 'open',
      })),
    },
  });
});

// Agrega una materia y sus bloques horarios al cronograma de un año y división escolar.
export const addScheduleEntry = asyncHandler(async (req: SolicitudAutenticada, res: Response, next) => {
  // Extrae y valida el año, división, docente y horarios enviados.
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

  // Resuelve la materia a partir del catálogo en materias_escolares o su nombre.
  let resolvedSubjectId = rawSubjectId ? Number(rawSubjectId) : null;
  let resolvedTitle = String(subjectName || title || '').trim();
  let resolvedCategoryId = rawCategoryId ? Number(rawCategoryId) : 1;

  if (resolvedSubjectId) {
    const [[subj]] = await db.execute<any[]>('SELECT * FROM materias_escolares WHERE id = ?', [resolvedSubjectId]);
    if (!subj) {
      throw new AppError('La materia seleccionada no existe en la base de datos.', 404, 'SUBJECT_NOT_FOUND');
    }
    resolvedTitle = subj.name;
    resolvedCategoryId = subj.category_id || (await getOrCreateCategoryForSubject(resolvedTitle));
  } else if (resolvedTitle) {
    const [subjByName] = await db.execute<any[]>('SELECT * FROM materias_escolares WHERE LOWER(name) = LOWER(?) LIMIT 1', [
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

  // Comprueba si el curso ya existe para ese año y división.
  let targetCourseId = courseId ? Number(courseId) : null;
  let effectiveInstructorId = instructorId;

  if (targetCourseId) {
    const [[existingC]] = await db.execute<any[]>('SELECT * FROM cursos WHERE id = ?', [targetCourseId]);
    if (!existingC) throw new AppError('Materia del curso no encontrada', 404);
    if (rawInstructorId === undefined) {
      effectiveInstructorId = existingC.instructor_id;
    }
  } else {
    if (!resolvedTitle || resolvedTitle.length < 2) {
      throw new AppError('Seleccioná una materia del catálogo antes de asignarla al cronograma.', 422, 'SUBJECT_REQUIRED');
    }
    const [existingCourse] = await db.execute<any[]>(
      'SELECT * FROM cursos WHERE school_year = ? AND course_division = ? AND (subject_id = ? OR LOWER(title) = LOWER(?)) LIMIT 1',
      [sy, cd, resolvedSubjectId || 0, resolvedTitle]
    );
    if (existingCourse.length > 0) {
      targetCourseId = existingCourse[0].id;
      if (rawInstructorId === undefined) {
        effectiveInstructorId = existingCourse[0].instructor_id;
      }
    }
  }

  // Valida que ninguno de los bloques horarios genere superposición en el curso ni con el docente.
  const validatedBlocks: any[] = [];
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

  // Actualiza el curso existente o crea uno nuevo en la tabla cursos.
  if (targetCourseId) {
    if (rawInstructorId !== undefined) {
      await validateInstructorForExistingCourseSchedules(targetCourseId, effectiveInstructorId);
    }
    await db.execute(
      `UPDATE cursos
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
    const [ins] = await db.execute<any>(
      `INSERT INTO cursos (instructor_id, category_id, subject_id, school_year, course_division, title, slug, short_description, description,
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

  // Inserta los bloques horarios validados en la tabla horarios_curso y sincroniza inscripciones.
  for (const block of validatedBlocks) {
    await db.execute(
      `INSERT INTO horarios_curso (course_id, school_year, course_division, day_of_week, start_time, end_time, classroom)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [targetCourseId, sy, cd, block.dayOfWeek, block.startTime, block.endTime, block.classroom]
    );
  }

  await syncCourseGroupEnrollments(targetCourseId!, sy, cd);
  await logAudit(req.user!.id, 'SCHEDULE_ADDED', 'course', targetCourseId, {
    schoolYear: sy,
    courseDivision: cd,
    subjectId: resolvedSubjectId,
    title: resolvedTitle,
    slotsCount: validatedBlocks.length,
    instructorId: effectiveInstructorId,
  });

  req.query.schoolYear = String(sy);
  req.query.courseDivision = String(cd);
  res.status(201);
  return getSchoolSchedule(req, res, next);
});

// Actualiza íntegramente la materia, el docente asignado y los horarios de un curso dentro de un grupo escolar.
export const updateCourseScheduleInGroup = asyncHandler(async (req: SolicitudAutenticada, res: Response, next) => {
  // Busca el curso por su identificador en la tabla cursos.
  const courseId = Number(req.params.id);
  const [[course]] = await db.execute<any[]>('SELECT * FROM cursos WHERE id = ?', [courseId]);
  if (!course) throw new AppError('Materia del curso no encontrada', 404, 'COURSE_NOT_FOUND');

  const sy = Number(course.school_year) || 1;
  const cd = Number(course.course_division) || 1;

  // Resuelve la nueva materia si fue modificada en la petición.
  let nextSubjectId = course.subject_id;
  let nextTitle = course.title;
  let nextCategoryId = course.category_id || 1;

  if (req.body.subjectId !== undefined && req.body.subjectId !== null && req.body.subjectId !== '') {
    const [[subj]] = await db.execute<any[]>('SELECT * FROM materias_escolares WHERE id = ?', [Number(req.body.subjectId)]);
    if (!subj) throw new AppError('La materia seleccionada no existe en la base de datos.', 404, 'SUBJECT_NOT_FOUND');
    nextSubjectId = subj.id;
    nextTitle = subj.name;
    nextCategoryId = subj.category_id || (await getOrCreateCategoryForSubject(nextTitle));
  } else if (req.body.subjectName || req.body.title) {
    nextTitle = String(req.body.subjectName || req.body.title).trim();
    nextCategoryId = await getOrCreateCategoryForSubject(nextTitle);
  }

  // Comprueba que no exista otra materia idéntica en el mismo año y división.
  const [dupCourse] = await db.execute<any[]>(
    `SELECT id FROM cursos
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

  // Valida todos los nuevos bloques horarios excluyendo los horarios previos de este mismo curso.
  const normalizedSlots = extractSlotsFromBody(req.body);
  const validatedBlocks: any[] = [];

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

  // Actualiza los datos en cursos y reemplaza los bloques horarios en horarios_curso.
  const summary = `${nextTitle} • ${sy}° Año - ${cd}° Curso`;
  await db.execute(
    `UPDATE cursos
     SET subject_id = ?,
         title = ?,
         category_id = ?,
         instructor_id = ?,
         short_description = ?,
         status = 'published'
     WHERE id = ?`,
    [nextSubjectId, nextTitle, nextCategoryId, nextInstructorId, summary, courseId]
  );

  await db.execute('DELETE FROM horarios_curso WHERE course_id = ?', [courseId]);

  for (const block of validatedBlocks) {
    await db.execute(
      `INSERT INTO horarios_curso (course_id, school_year, course_division, day_of_week, start_time, end_time, classroom)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [courseId, sy, cd, block.dayOfWeek, block.startTime, block.endTime, block.classroom]
    );
  }

  await syncCourseGroupEnrollments(courseId, sy, cd);
  await logAudit(req.user!.id, 'COURSE_SCHEDULE_UPDATED', 'course', courseId, {
    schoolYear: sy,
    courseDivision: cd,
    subjectId: nextSubjectId,
    title: nextTitle,
    instructorId: nextInstructorId,
    slots: validatedBlocks,
  });

  req.query.schoolYear = String(sy);
  req.query.courseDivision = String(cd);
  return getSchoolSchedule(req, res, next);
});

// Elimina una materia y todas sus dependencias del cronograma escolar.
export const deleteCourseFromSchedule = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Verifica la existencia del curso y ejecuta el borrado completo en cascada.
  const courseId = Number(req.params.id);
  const [[course]] = await db.execute<any[]>('SELECT * FROM cursos WHERE id = ?', [courseId]);
  if (!course) throw new AppError('Materia del curso no encontrada', 404);

  await deleteCourseAndDependencies(courseId);
  await logAudit(req.user!.id, 'COURSE_DELETED_FROM_SCHEDULE', 'course', courseId, { title: course.title });
  res.status(204).end();
});

// Asigna o desvincula un docente de una materia específica validando superposiciones horarias.
export const assignCourseInstructor = asyncHandler(async (req: SolicitudAutenticada, res: Response, next) => {
  // Busca el curso y valida la disponibilidad horaria del docente seleccionado.
  const courseId = Number(req.params.id);
  const [cRows] = await db.execute<any[]>('SELECT * FROM cursos WHERE id = ?', [courseId]);
  if (!cRows.length) throw new AppError('Materia no encontrada', 404);
  const course = cRows[0];

  const instructorId = parseNullableInstructorId(req.body.instructorId);
  await validateInstructorForExistingCourseSchedules(courseId, instructorId);

  // Actualiza el docente en la tabla cursos y sincroniza las inscripciones del grupo.
  await db.execute("UPDATE cursos SET instructor_id = ?, status = 'published' WHERE id = ?", [instructorId, courseId]);
  await syncCourseGroupEnrollments(courseId, course.school_year || 1, course.course_division || 1);
  await logAudit(req.user!.id, 'COURSE_INSTRUCTOR_ASSIGNED', 'course', courseId, { instructorId });

  req.query.schoolYear = String(course.school_year || 1);
  req.query.courseDivision = String(course.course_division || 1);
  return getSchoolSchedule(req, res, next);
});

// Elimina un bloque horario individual del cronograma escolar.
export const deleteScheduleEntry = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Comprueba que el bloque exista en horarios_curso y lo elimina.
  const scheduleId = Number(req.params.id);
  const [rows] = await db.execute<any[]>('SELECT * FROM horarios_curso WHERE id = ?', [scheduleId]);
  if (!rows.length) throw new AppError('Bloque de horario no encontrado', 404);

  await db.execute('DELETE FROM horarios_curso WHERE id = ?', [scheduleId]);
  await logAudit(req.user!.id, 'SCHEDULE_DELETED', 'course_schedule', scheduleId);
  res.status(204).end();
});

// Lista todos los cursos o divisiones escolares con su estado, código de acceso y conteo de alumnos.
export const listSchoolGroups = asyncHandler(async (_req: SolicitudAutenticada, res: Response) => {
  // Consulta la tabla grupos_escolares ordenada por año y división.
  const [groups] = await db.execute<any[]>(
    `SELECT sg.id, sg.school_year AS schoolYear, sg.course_division AS courseDivision, sg.status,
            sg.access_code AS accessCode,
            (SELECT COUNT(*) FROM cursos c WHERE c.school_year = sg.school_year AND c.course_division = sg.course_division) AS coursesCount,
            (SELECT COUNT(*) FROM usuarios u WHERE u.school_year = sg.school_year AND u.course_division = sg.course_division) AS studentsCount
     FROM grupos_escolares sg
     ORDER BY sg.school_year ASC, sg.course_division ASC`
  );

  res.json({
    success: true,
    data: groups.map((g: any) => ({
      ...g,
      label: `${g.schoolYear}° ${g.courseDivision}ª`,
      fullLabel: `${g.schoolYear}° Año - ${g.courseDivision}° Curso`,
      isOpen: g.status === 'open',
    })),
  });
});

// Abre o reabre un curso/división escolar asignándole su código de acceso en mayúsculas.
export const createSchoolGroup = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Parsea el año, la división y normaliza el código de acceso a mayúsculas.
  const sy = parseInt(String(req.body.schoolYear), 10);
  const cd = parseInt(String(req.body.courseDivision), 10);
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

  // Verifica que la división inmediata anterior esté creada y abierta cuando la división es mayor a 1.
  if (cd > 1) {
    const prevDiv = cd - 1;
    const [prevRows] = await db.execute<any[]>(
      'SELECT id, status FROM grupos_escolares WHERE school_year = ? AND course_division = ?',
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

  // Comprueba si el grupo escolar ya existe en grupos_escolares para reabrirlo o crearlo.
  const [existing] = await db.execute<any[]>(
    'SELECT id, status, access_code FROM grupos_escolares WHERE school_year = ? AND course_division = ?',
    [sy, cd]
  );

  if (existing.length > 0) {
    if (existing[0].status === 'open') {
      throw new AppError(`El curso ${sy}° ${cd}ª ya se encuentra abierto.`, 409, 'COURSE_ALREADY_OPEN');
    }
    const finalCode = code || existing[0].access_code || `${sy}TO${cd}RA`;
    await db.execute("UPDATE grupos_escolares SET status = 'open', access_code = ? WHERE id = ?", [finalCode, existing[0].id]);
    await logAudit(req.user!.id, 'SCHOOL_GROUP_REOPENED', 'school_group', existing[0].id, { schoolYear: sy, courseDivision: cd, accessCode: finalCode });
    return res.json({
      success: true,
      message: `El curso ${sy}° ${cd}ª fue reabierto exitosamente con código "${finalCode}".`,
      data: { id: existing[0].id, schoolYear: sy, courseDivision: cd, status: 'open', accessCode: finalCode },
    });
  }

  // Inserta el nuevo grupo escolar abierto en la tabla grupos_escolares.
  const [insertRes] = await db.execute<any>(
    "INSERT INTO grupos_escolares (school_year, course_division, status, access_code) VALUES (?, ?, 'open', ?)",
    [sy, cd, code]
  );

  await logAudit(req.user!.id, 'SCHOOL_GROUP_CREATED', 'school_group', insertRes.insertId, { schoolYear: sy, courseDivision: cd, accessCode: code });

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

// Actualiza la clave de acceso en mayúsculas de un curso o división escolar.
export const updateSchoolGroupAccessCode = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Valida que el código no esté vacío y lo convierte a mayúsculas.
  const groupId = Number(req.params.id);
  const { accessCode } = req.body;
  if (!accessCode || !String(accessCode).trim()) {
    throw new AppError('El código de acceso no puede estar vacío.', 422, 'INVALID_ACCESS_CODE');
  }
  const cleanCode = String(accessCode).trim().toUpperCase();
  const [[group]] = await db.execute<any[]>('SELECT * FROM grupos_escolares WHERE id = ?', [groupId]);
  if (!group) throw new AppError('Curso / División no encontrado', 404);

  // Actualiza el código en grupos_escolares y registra el cambio en auditoría.
  await db.execute('UPDATE grupos_escolares SET access_code = ? WHERE id = ?', [cleanCode, groupId]);
  await logAudit(req.user!.id, 'SCHOOL_GROUP_CODE_UPDATED', 'school_group', groupId, {
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

// Alterna el estado de un curso escolar entre abierto y cerrado sincronizando sus materias asociadas.
export const toggleSchoolGroupStatus = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Busca el grupo escolar en grupos_escolares y determina su próximo estado.
  const groupId = Number(req.params.id);
  const [[group]] = await db.execute<any[]>('SELECT * FROM grupos_escolares WHERE id = ?', [groupId]);
  if (!group) throw new AppError('Curso / División no encontrado', 404);

  const nextStatus = group.status === 'open' ? 'closed' : 'open';

  // Verifica que la división anterior esté abierta antes de reabrir una división superior a 1.
  if (nextStatus === 'open' && group.course_division > 1) {
    const prevDiv = group.course_division - 1;
    const [prevRows] = await db.execute<any[]>(
      "SELECT id, status FROM grupos_escolares WHERE school_year = ? AND course_division = ? AND status = 'open'",
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

  // Actualiza el estado en grupos_escolares y archiva o republica los cursos asociados.
  await db.execute('UPDATE grupos_escolares SET status = ? WHERE id = ?', [nextStatus, groupId]);

  if (nextStatus === 'closed') {
    await db.execute(
      "UPDATE cursos SET status = 'archived' WHERE school_year = ? AND course_division = ? AND status = 'published'",
      [group.school_year, group.course_division]
    );
  } else {
    await db.execute(
      "UPDATE cursos SET status = 'published' WHERE school_year = ? AND course_division = ? AND status = 'archived'",
      [group.school_year, group.course_division]
    );
  }

  await logAudit(req.user!.id, `SCHOOL_GROUP_${nextStatus.toUpperCase()}`, 'school_group', groupId, {
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

// Elimina definitivamente un curso o división escolar que se encuentre cerrado junto con sus materias y horarios.
export const deleteSchoolGroup = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  // Comprueba que el curso exista y que su estado actual sea cerrado.
  const groupId = Number(req.params.id);
  const [[group]] = await db.execute<any[]>('SELECT * FROM grupos_escolares WHERE id = ?', [groupId]);
  if (!group) throw new AppError('Curso / División no encontrado', 404);

  if (group.status !== 'closed') {
    throw new AppError(
      `El curso ${group.school_year}° ${group.course_division}ª debe estar cerrado para poder ser eliminado. Cerralo primero.`,
      400,
      'COURSE_MUST_BE_CLOSED'
    );
  }

  const sy = group.school_year;
  const cd = group.course_division;

  // Desvincula a los estudiantes asignados, borra los cursos asociados y elimina el registro de grupos_escolares.
  await db.execute(
    'UPDATE usuarios SET school_year = NULL, course_division = NULL WHERE school_year = ? AND course_division = ?',
    [sy, cd]
  );

  const [courses] = await db.execute<any[]>(
    'SELECT id FROM cursos WHERE school_year = ? AND course_division = ?',
    [sy, cd]
  );
  for (const c of courses) {
    await deleteCourseAndDependencies(c.id);
  }

  await db.execute(
    'DELETE FROM horarios_curso WHERE school_year = ? AND course_division = ?',
    [sy, cd]
  );

  await db.execute('DELETE FROM grupos_escolares WHERE id = ?', [groupId]);

  await logAudit(req.user!.id, 'SCHOOL_GROUP_DELETED', 'school_group', groupId, {
    schoolYear: sy,
    courseDivision: cd,
  });

  res.json({
    success: true,
    message: `Curso ${sy}° ${cd}ª eliminado exitosamente.`,
  });
});
