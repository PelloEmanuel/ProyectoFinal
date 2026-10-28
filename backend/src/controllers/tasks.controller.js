/**
 * Archivo: backend/src/controllers/tasks.controller.js
 * Descripción: Controlador CRUD de tareas, asignación de etiquetas (N:M) y métricas.
 * Se conecta con: backend/src/config/db.js, backend/src/routes/tasks.routes.js y utils/errors.js.
 * Incluye: Control de permisos por rol (user, manager, admin) y transacciones SQL
 * al crear o actualizar tareas junto con sus etiquetas en la tabla intermedia task_tags.
 */
const db = require('../config/db');
const { AppError, asyncHandler } = require('../utils/errors');

const SELECT = `
  SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date AS "dueDate",
         t.created_by AS "createdBy", cu.name AS "createdByName",
         t.assigned_to AS "assignedTo", au.name AS "assignedToName",
         t.created_at AS "createdAt", t.updated_at AS "updatedAt",
         COALESCE(
           (SELECT json_agg(json_build_object('id', g.id, 'name', g.name, 'color', g.color) ORDER BY g.name)
            FROM task_tags tt JOIN tags g ON g.id = tt.tag_id WHERE tt.task_id = t.id),
           '[]'::json
         ) AS tags
  FROM tasks t
  JOIN users cu ON cu.id = t.created_by
  LEFT JOIN users au ON au.id = t.assigned_to`;

const isStaff = (user) => user.role === 'admin' || user.role === 'manager';
const canSee = (user, t) => isStaff(user) || t.createdBy === user.id || t.assignedTo === user.id;

async function getTask(id, runner = db) {
  const [rows] = await runner.execute(`${SELECT} WHERE t.id=?`, [id]);
  if (!rows.length) throw new AppError('Tarea no encontrada', 404);
  return rows[0];
}

/** Sincroniza las etiquetas (relación N:M en task_tags) dentro de una transacción. */
async function syncTaskTags(tx, taskId, tagIds) {
  if (!Array.isArray(tagIds)) return;
  await tx.execute('DELETE FROM task_tags WHERE task_id=?', [taskId]);
  const cleanIds = [...new Set(tagIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  for (const tagId of cleanIds) {
    await tx.execute('INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [taskId, tagId]);
  }
}

/** Listado. Rol "user" solo ve tareas propias o asignadas; supervisor/admin ven todas. */
exports.list = asyncHandler(async (req, res) => {
  const where = [];
  const params = [];
  if (!isStaff(req.user)) {
    where.push('(t.created_by=? OR t.assigned_to=?)');
    params.push(req.user.id, req.user.id);
  }
  const { status, priority, q, assignedTo } = req.query;
  if (status) { where.push('t.status=?'); params.push(status); }
  if (priority) { where.push('t.priority=?'); params.push(priority); }
  if (assignedTo && isStaff(req.user)) { where.push('t.assigned_to=?'); params.push(assignedTo); }
  if (q) { where.push('(t.title ILIKE ? OR t.description ILIKE ?)'); params.push(`%${q}%`, `%${q}%`); }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  const offset = (Math.max(parseInt(req.query.page, 10) || 1, 1) - 1) * limit;
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';

  const [rows] = await db.query(`${SELECT}${clause} ORDER BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM tasks t${clause}`, params);
  res.json({ data: rows, page: Math.floor(offset / limit) + 1, limit, total });
});

exports.get = asyncHandler(async (req, res) => {
  const task = await getTask(req.params.id);
  if (!canSee(req.user, task)) throw new AppError('No tenés acceso a esta tarea', 403);
  res.json(task);
});

/** Crea una tarea y sus etiquetas usando una transacción para asegurar integridad. */
exports.create = asyncHandler(async (req, res) => {
  const { title, description = null, status = 'pending', priority = 'medium', dueDate = null, tagIds } = req.body;
  // Un usuario común solo puede asignarse tareas a sí mismo.
  const assignedTo = isStaff(req.user) ? req.body.assignedTo || null : req.user.id;

  const created = await db.withTransaction(async (tx) => {
    if (assignedTo) {
      const [u] = await tx.execute('SELECT id FROM users WHERE id=? AND is_active=1', [assignedTo]);
      if (!u.length) throw new AppError('El usuario asignado no existe', 400);
    }
    const [r] = await tx.execute(
      'INSERT INTO tasks (title, description, status, priority, due_date, created_by, assigned_to) VALUES (?,?,?,?,?,?,?)',
      [title, description, status, priority, dueDate, req.user.id, assignedTo]
    );
    await syncTaskTags(tx, r.insertId, tagIds);
    return getTask(r.insertId, tx);
  });

  res.status(201).json(created);
});

/** Actualiza una tarea y opcionalmente sus etiquetas dentro de una transacción. */
exports.update = asyncHandler(async (req, res) => {
  const task = await getTask(req.params.id);
  if (!canSee(req.user, task)) throw new AppError('No tenés acceso a esta tarea', 403);

  const fields = { title: 'title', description: 'description', status: 'status', priority: 'priority', dueDate: 'due_date' };
  if (isStaff(req.user)) fields.assignedTo = 'assigned_to'; // reasignar: solo supervisor/admin
  const sets = [];
  const vals = [];
  for (const [key, column] of Object.entries(fields)) {
    if (req.body[key] !== undefined) {
      sets.push(`${column}=?`);
      vals.push(req.body[key] === '' ? null : req.body[key]);
    }
  }
  const hasTagChanges = Array.isArray(req.body.tagIds);
  if (!sets.length && !hasTagChanges) throw new AppError('No hay cambios para guardar', 400);

  const updated = await db.withTransaction(async (tx) => {
    if (sets.length) {
      sets.push('updated_at=CURRENT_TIMESTAMP');
      await tx.execute(`UPDATE tasks SET ${sets.join(', ')} WHERE id=?`, [...vals, task.id]);
    }
    if (hasTagChanges) {
      await syncTaskTags(tx, task.id, req.body.tagIds);
    }
    return getTask(task.id, tx);
  });

  res.json(updated);
});

/** Rol "user" solo puede borrar tareas que creó; supervisor/admin cualquiera. */
exports.remove = asyncHandler(async (req, res) => {
  const task = await getTask(req.params.id);
  if (!isStaff(req.user) && task.createdBy !== req.user.id)
    throw new AppError('Solo podés eliminar tareas que creaste', 403);
  await db.execute('DELETE FROM tasks WHERE id=?', [task.id]);
  res.status(204).end();
});

/** Métricas para el panel (supervisor/admin) compatibles con PostgreSQL. */
exports.stats = asyncHandler(async (req, res) => {
  const [byStatus] = await db.execute('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status');
  const [byUser] = await db.execute(
    `SELECT u.id, u.name, COUNT(t.id) AS total,
            COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0) AS done
     FROM users u
     JOIN tasks t ON t.assigned_to = u.id
     GROUP BY u.id, u.name
     ORDER BY total DESC`
  );
  const [[{ overdue }]] = await db.execute(
    "SELECT COUNT(*) AS overdue FROM tasks WHERE status <> 'done' AND due_date IS NOT NULL AND due_date < CURRENT_DATE"
  );
  const counts = { pending: 0, in_progress: 0, done: 0 };
  byStatus.forEach((r) => (counts[r.status] = Number(r.count)));
  res.json({
    byStatus: counts,
    overdue: Number(overdue),
    byUser: byUser.map((u) => ({ ...u, total: Number(u.total), done: Number(u.done) })),
  });
});
