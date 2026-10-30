/**
 * Archivo: mobile/src/theme.js
 * Descripción: Tokens del sistema de diseño e identidad visual de SkillTrack.
 * Define paletas completas para Tema Claro y Tema Oscuro, tipografía, espaciado y etiquetas de dominio.
 */
export const lightColors = {
  mode: 'light',
  navy: '#f1f5f9',
  navySurface: '#e2e8f0',
  primary: '#b91c1c',        // Rojo distintivo Técnica 5
  primaryLight: '#fef2f2',
  secondary: '#15803d',      // Verde distintivo Técnica 5
  secondaryLight: '#f0fdf4',
  accent: '#15803d',
  info: '#15803d',
  bg: '#ffffff',             // Color base blanco para modo claro
  background: '#ffffff',
  card: '#f8fafc',
  surface: '#ffffff',
  surfaceAlt: '#f1f5f9',
  text: '#0f172a',
  textSecondary: '#334155',
  muted: '#64748b',
  textMuted: '#64748b',
  border: '#e2e8f0',
  success: '#15803d',        // Verde Técnica 5
  successLight: '#dcfce7',
  warning: '#d97706',
  warningLight: '#fef3c7',
  warningSoft: '#fef3c7',
  danger: '#b91c1c',         // Rojo Técnica 5
  dangerLight: '#fee2e2',
  overlay: 'rgba(15, 23, 42, 0.45)',
  // Acentos para campus escolar
  amber: '#d97706',
  emerald: '#15803d',
  violet: '#b91c1c',
  cyan: '#15803d',
  rose: '#b91c1c',
};

export const darkColors = {
  mode: 'dark',
  navy: '#060913',
  navySurface: '#0d1322',
  primary: '#ef4444',        // Rojo brillante armónico sobre fondo oscuro
  primaryLight: '#450a0a',
  secondary: '#22c55e',      // Verde vibrante armónico sobre fondo oscuro
  secondaryLight: '#052e16',
  accent: '#22c55e',
  info: '#22c55e',
  bg: '#0b0f19',             // Color base negro/azul actual
  background: '#0b0f19',
  card: '#131b2e',
  surface: '#131b2e',
  surfaceAlt: '#1c263f',
  text: '#f8fafc',
  textSecondary: '#cbd5e1',
  muted: '#94a3b8',
  textMuted: '#94a3b8',
  border: '#24324f',
  success: '#22c55e',        // Verde Técnica 5 en modo oscuro
  successLight: '#064e3b',
  warning: '#f59e0b',
  warningLight: '#451a03',
  warningSoft: '#451a03',
  danger: '#ef4444',         // Rojo Técnica 5 en modo oscuro
  dangerLight: '#4c0519',
  overlay: 'rgba(6, 9, 19, 0.82)',
  // Acentos para campus escolar
  amber: '#fbbf24',
  emerald: '#22c55e',
  violet: '#ef4444',
  cyan: '#22c55e',
  rose: '#ef4444',
};

// Objeto reactivo por defecto para compatibilidad directa
export const colors = { ...lightColors };

export const spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const ROLE_LABEL = {
  admin: 'Administrador',
  instructor: 'Instructor',
  student: 'Estudiante',
};

export const LEVEL_LABELS = {
  beginner: { label: 'Inicial', color: '#16a34a' },
  intermediate: { label: 'Intermedio', color: '#d97706' },
  advanced: { label: 'Avanzado', color: '#dc2626' },
};

export const COURSE_STATUS = {
  published: { label: 'Publicado', color: '#16a34a' },
  draft: { label: 'Borrador', color: '#d97706' },
  archived: { label: 'Archivado', color: '#64748b' },
};

export const ASSIGNMENT_TYPE_LABEL = {
  multiple_choice: 'Cuestionario Opción Múltiple',
  quiz: 'Cuestionario Opción Múltiple',
  true_false: 'Verdadero o Falso',
  short_answer: 'Respuesta Breve',
  text_submission: 'Entrega de Desarrollo',
  file_submission: 'Entrega con Archivo',
};

export const DELIVERY_STATUS = {
  pending: { label: 'Pendiente', color: '#d97706' },
  submitted: { label: 'Enviada', color: '#0284c7' },
  graded: { label: 'Corregida', color: '#16a34a' },
  overdue: { label: 'Vencida', color: '#dc2626' },
};
