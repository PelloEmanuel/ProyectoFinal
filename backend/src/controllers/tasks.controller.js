const db = require('../config/db');
const { AppError, asyncHandler } = require('../utils/errors');

const SELECT = `
  SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date AS dueDate,
         t.created_by AS createdBy, cu.name AS createdByName,
         t.assigned_to AS assignedTo, au.name AS assignedToName,
         t.created_at AS createdAt, t.updated_at AS updatedAt
  FROM tasks t
  JOIN users cu ON cu.id = t.created_by
  LEFT JOIN users au ON au.id = t.assigned_to`;

const isStaff = (user) => user.role === 'admin' || user.role === 'manager';
const canSee = (user, t) => isStaff(user) || t.createdBy === user.id || t.assignedTo === user.id;

async function getTask(id) {
  const [rows] = await db.execute(`${SELECT} WHERE t.id=?`, [id]);
  if (!rows.length) throw new AppError('Tarea no encontrada', 404);
  return rows[0];
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
  if (q) { where.push('(t.title LIKE ? OR t.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }

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

exports.create = asyncHandler(async (req, res) => {
  const { title, description = null, status = 'pending', priority = 'medium', dueDate = null } = req.body;
  // Un usuario común solo puede asignarse tareas a sí mismo.
  const assignedTo = isStaff(req.user) ? req.body.assignedTo || null : req.user.id;
  if (assignedTo) {
    const [u] = await db.execute('SELECT id FROM users WHERE id=? AND is_active=1', [assignedTo]);
    if (!u.length) throw new AppError('El usuario asignado no existe', 400);
  }
  const [r] = await db.execute(
    'INSERT INTO tasks (title, description, status, priority, due_date, created_by, assigned_to) VALUES (?,?,?,?,?,?,?)',
    [title, description, status, priority, dueDate, req.user.id, assignedTo]
  );
  res.status(201).json(await getTask(r.insertId));
});

exports.update = asyncHandler(async (req, res) => {
  const task = await getTask(req.params.id);
  if (!canSee(req.user, task)) throw new AppError('No tenés acceso a esta tarea', 403);

  const fields = { title: 'title', description: 'description', status: 'status', priority: 'priority', dueDate: 'due_date' };
  if (isStaff(req.user)) fields.assignedTo = 'assigned_to'; // reasignar: solo supervisor/admin
  const sets = [];
  const vals = [];
  for (const [key, column] of Object.entries(fields)) {
    if (req.body[key] !== undefined) { sets.push(`${column}=?`); vals.push(req.body[key] === '' ? null : req.body[key]); }
  }
  if (!sets.length) throw new AppError('No hay cambios para guardar', 400);
  await db.execute(`UPDATE tasks SET ${sets.join(', ')} WHERE id=?`, [...vals, task.id]);
  res.json(await getTask(task.id));
});

/** Rol "user" solo puede borrar tareas que creó; supervisor/admin cualquiera. */
exports.remove = asyncHandler(async (req, res) => {
  const task = await getTask(req.params.id);
  if (!isStaff(req.user) && task.createdBy !== req.user.id)
    throw new AppError('Solo podés eliminar tareas que creaste', 403);
  await db.execute('DELETE FROM tasks WHERE id=?', [task.id]);
  res.status(204).end();
});

/** Métricas para el panel (supervisor/admin). */
exports.stats = asyncHandler(async (req, res) => {
  const [byStatus] = await db.execute('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status');
  const [byUser] = await db.execute(
    `SELECT u.id, u.name, COUNT(t.id) AS total, COALESCE(SUM(t.status='done'),0) AS done
     FROM users u JOIN tasks t ON t.assigned_to=u.id GROUP BY u.id, u.name ORDER BY total DESC`
  );
  const [[{ overdue }]] = await db.execute(
    "SELECT COUNT(*) AS overdue FROM tasks WHERE status<>'done' AND due_date IS NOT NULL AND due_date<CURDATE()"
  );
  const counts = { pending: 0, in_progress: 0, done: 0 };
  byStatus.forEach((r) => (counts[r.status] = Number(r.count)));
  res.json({ byStatus: counts, overdue: Number(overdue), byUser: byUser.map((u) => ({ ...u, total: Number(u.total), done: Number(u.done) })) });
});
