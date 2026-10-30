/**
 * Archivo: mobile/src/theme.js
 * Descripción: Tokens del sistema de diseño e identidad visual de SkillTrack.
 * Define paletas completas para Tema Claro y Tema Oscuro, tipografía, espaciado y etiquetas de dominio.
 */
export const lightColors = {
  mode: 'light',
  navy: '#0f172a',
  navySurface: '#1e293b',
  primary: '#4f46e5',
  primaryLight: '#eef2ff',
  secondary: '#0891b2',
  accent: '#7c3aed',
  info: '#0284c7',
  bg: '#f8fafc',
  background: '#f8fafc',
  card: '#ffffff',
  surface: '#ffffff',
  surfaceAlt: '#f1f5f9',
  text: '#0f172a',
  textSecondary: '#334155',
  muted: '#64748b',
  textMuted: '#64748b',
  border: '#e2e8f0',
  success: '#16a34a',
  successLight: '#dcfce7',
  warning: '#d97706',
  warningLight: '#fef3c7',
  warningSoft: '#fef3c7',
  danger: '#dc2626',
  dangerLight: '#fef2f2',
  overlay: 'rgba(15, 23, 42, 0.65)',
  // Acentos vivos para campus escolar
  amber: '#f59e0b',
  emerald: '#10b981',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  rose: '#f43f5e',
};

export const darkColors = {
  mode: 'dark',
  navy: '#060913',
  navySurface: '#0d1322',
  primary: '#6366f1',
  primaryLight: '#262b5c',
  secondary: '#06b6d4',
  accent: '#8b5cf6',
  info: '#38bdf8',
  bg: '#0b0f19',
  background: '#0b0f19',
  card: '#131b2e',
  surface: '#131b2e',
  surfaceAlt: '#1c263f',
  text: '#f8fafc',
  textSecondary: '#cbd5e1',
  muted: '#94a3b8',
  textMuted: '#94a3b8',
  border: '#24324f',
  success: '#10b981',
  successLight: '#064e3b',
  warning: '#f59e0b',
  warningLight: '#451a03',
  warningSoft: '#451a03',
  danger: '#f43f5e',
  dangerLight: '#4c0519',
  overlay: 'rgba(6, 9, 19, 0.82)',
  // Acentos vivos para campus escolar
  amber: '#fbbf24',
  emerald: '#34d399',
  violet: '#a78bfa',
  cyan: '#22d3ee',
  rose: '#fb7185',
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
