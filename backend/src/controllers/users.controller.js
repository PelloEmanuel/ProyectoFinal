const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { AppError, asyncHandler } = require('../utils/errors');
const { publicUser } = require('../utils/serializers');
const tokens = require('../utils/tokens');

const findById = async (id) => (await db.execute('SELECT * FROM users WHERE id=?', [id]))[0][0];

exports.me = asyncHandler(async (req, res) => res.json(publicUser(await findById(req.user.id))));

/** Edita el perfil propio: nombre, 2FA y (opcional) contraseña. */
exports.updateMe = asyncHandler(async (req, res) => {
  const user = await findById(req.user.id);
  const { name, twoFactorEnabled, currentPassword, newPassword } = req.body;
  const sets = [];
  const vals = [];
  if (name !== undefined) { sets.push('name=?'); vals.push(name); }
  if (twoFactorEnabled !== undefined) { sets.push('two_factor_enabled=?'); vals.push(twoFactorEnabled ? 1 : 0); }
  if (newPassword) {
    if (user.password_hash && !(await bcrypt.compare(currentPassword || '', user.password_hash)))
      throw new AppError('La contraseña actual es incorrecta', 400);
    sets.push('password_hash=?');
    vals.push(await bcrypt.hash(newPassword, 10));
  }
  if (!sets.length) throw new AppError('No hay cambios para guardar', 400);
  await db.execute(`UPDATE users SET ${sets.join(', ')} WHERE id=?`, [...vals, req.user.id]);
  res.json(publicUser(await findById(req.user.id)));
});

/** Usuarios activos (id y nombre) para asignar tareas. Admin y supervisor. */
exports.assignable = asyncHandler(async (req, res) => {
  const [rows] = await db.execute('SELECT id, name, role FROM users WHERE is_active=1 ORDER BY name');
  res.json(rows);
});

exports.list = asyncHandler(async (req, res) => {
  const [rows] = await db.execute('SELECT * FROM users ORDER BY created_at DESC');
  res.json(rows.map(publicUser));
});

async function targetUser(req) {
  const id = Number(req.params.id);
  if (id === req.user.id) throw new AppError('No podés modificar tu propio usuario desde acá', 400);
  const user = await findById(id);
  if (!user) throw new AppError('Usuario no encontrado', 404);
  return user;
}

exports.setRole = asyncHandler(async (req, res) => {
  const user = await targetUser(req);
  await db.execute('UPDATE users SET role=? WHERE id=?', [req.body.role, user.id]);
  res.json(publicUser(await findById(user.id)));
});

exports.setStatus = asyncHandler(async (req, res) => {
  const user = await targetUser(req);
  await db.execute('UPDATE users SET is_active=? WHERE id=?', [req.body.isActive ? 1 : 0, user.id]);
  if (!req.body.isActive) await tokens.revokeAllForUser(user.id);
  res.json(publicUser(await findById(user.id)));
});

exports.remove = asyncHandler(async (req, res) => {
  const user = await targetUser(req);
  await db.execute('DELETE FROM users WHERE id=?', [user.id]);
  res.status(204).end();
});
