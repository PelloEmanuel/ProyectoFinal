/** Datos de usuario seguros para enviar al cliente (sin hash). */
exports.publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  isActive: !!u.is_active,
  twoFactorEnabled: !!u.two_factor_enabled,
  avatarUrl: u.avatar_url || null,
  createdAt: u.created_at,
});
