/**
 * Archivo: backend/src/utils/serializers.js
 * Descripción: Serializadores seguros de usuarios y permisos según el rol en el Campus.
 */
const ROLE_PERMISSIONS = {
  admin: [
    'dashboard:admin',
    'users:manage',
    'courses:manage_all',
    'categories:manage',
    'skills:manage',
    'reports:view',
    'audit:view',
    'settings:manage',
  ],
  instructor: [
    'dashboard:instructor',
    'courses:create',
    'courses:manage_own',
    'modules:manage_own',
    'assignments:manage_own',
    'submissions:grade_own',
    'students:view_own',
    'announcements:manage_own',
  ],
  student: [
    'dashboard:student',
    'courses:explore',
    'courses:enroll',
    'lessons:complete',
    'assignments:submit',
    'grades:view_own',
    'certificates:view_own',
    'favorites:manage_own',
  ],
};

function parsePreferences(raw) {
  const defaults = { theme: 'light', notifications: true, language: 'es' };
  if (!raw) return defaults;
  if (typeof raw === 'object') return { ...defaults, ...raw };
  try {
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

exports.publicUser = (u) => {
  if (!u) return null;
  const roleName = u.role_name || u.role || (u.role_id === 1 ? 'admin' : u.role_id === 2 ? 'instructor' : 'student');
  const firstName = u.first_name || '';
  const lastName = u.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim() || u.username || u.email;

  const schoolYear = u.school_year ? Number(u.school_year) : null;
  const courseDivision = u.course_division ? Number(u.course_division) : null;

  return {
    id: u.id,
    firstName,
    lastName,
    name: fullName,
    username: u.username || null,
    email: u.email,
    avatarUrl: u.avatar_url || null,
    bio: u.bio || '',
    role: roleName,
    roleId: u.role_id,
    schoolYear,
    courseDivision,
    schoolGroupLabel: schoolYear && courseDivision ? `${schoolYear}° Año - ${courseDivision}° Curso` : null,
    status: u.status || 'active',
    isActive: (u.status || 'active') === 'active',
    emailVerified: !!u.email_verified_at,
    emailVerifiedAt: u.email_verified_at || null,
    twoFactorEnabled: !!u.two_factor_enabled,
    createdByAdmin: !!u.created_by_admin,
    hasPassword: !!u.password_hash,
    preferences: parsePreferences(u.preferences),
    permissions: ROLE_PERMISSIONS[roleName] || ROLE_PERMISSIONS.student,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  };
};

exports.ROLE_PERMISSIONS = ROLE_PERMISSIONS;
