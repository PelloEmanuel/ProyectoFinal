// Importa los tipos de datos de usuario y preferencias definidos en el sistema.
import { FilaUsuarioBD, PreferenciasUsuario, RolUsuario, UsuarioPublico } from '../tipos';

// Define el mapa de permisos asignados a cada rol institucional dentro del Campus.
export const ROLE_PERMISSIONS: Record<string, string[]> = {
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
  preceptor: [
    'dashboard:preceptor',
    'attendance:manage',
    'students:view_all',
    'courses:view_all',
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

// Parsea de forma segura el campo JSON de preferencias del usuario aplicando valores por defecto.
function parsePreferences(raw: string | PreferenciasUsuario | null | undefined): PreferenciasUsuario {
  const defaults: PreferenciasUsuario = { theme: 'light', notifications: true, language: 'es' };
  if (!raw) return defaults;
  if (typeof raw === 'object') return { ...defaults, ...raw };
  try {
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

// Transforma una fila cruda de la tabla usuarios en un objeto público libre de hashes y secretos.
export const publicUser = (u: FilaUsuarioBD | null | undefined): UsuarioPublico | null => {
  if (!u) return null;
  const roleName: RolUsuario =
    u.role_name ||
    u.role ||
    (u.role_id === 1 ? 'admin' : u.role_id === 2 ? 'instructor' : u.role_id === 4 ? 'preceptor' : 'student');
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
